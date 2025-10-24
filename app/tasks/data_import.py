"""
Celery task for database import with progress tracking.
"""

import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import urlparse

import structlog
from celery import shared_task

from app.core.config import settings

logger = structlog.get_logger(__name__)


@shared_task(bind=True)
def import_data_task(self, temp_file_path: str, filename: str):
    """
    Import data from a SQL dump or ZIP export file.
    Runs as a background task with progress updates.

    Args:
        temp_file_path: Path to the temporarily saved upload file
        filename: Original filename (to determine if ZIP or SQL)
    """
    # Setup file logging for this task
    from app.core.logging_config import setup_task_file_logging
    file_handler = setup_task_file_logging(self.request.id)

    temp_dir = None
    try:
        # Update progress: Starting
        self.update_state(
            state="PROGRESS", meta={"step": "Initializing", "progress": 0, "total": 100}
        )

        temp_dir = tempfile.mkdtemp()
        temp_file = Path(temp_file_path)

        # Check if it's a ZIP file (SQL + uploads) or just SQL
        if filename.endswith(".zip"):
            # Update progress: Extracting ZIP
            self.update_state(
                state="PROGRESS", meta={"step": "Extracting archive", "progress": 10, "total": 100}
            )

            with zipfile.ZipFile(temp_file, "r") as zipf:
                zipf.extractall(temp_dir)

            # Find SQL file
            sql_path = Path(temp_dir) / "database.sql"
            if not sql_path.exists():
                raise Exception("ZIP file must contain database.sql")

            # Check if uploads folder exists
            uploads_in_zip = Path(temp_dir) / "echolens_data" / "uploads"
            if not uploads_in_zip.exists():
                uploads_in_zip = Path(temp_dir) / "uploads"
            has_uploads = uploads_in_zip.exists()
        else:
            # Direct SQL import
            sql_path = temp_file
            has_uploads = False

        # Update progress: Saving current admin
        self.update_state(
            state="PROGRESS", meta={"step": "Saving current admin credentials", "progress": 15, "total": 100}
        )

        # Parse database URL
        db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        parsed = urlparse(db_url)
        db_name = parsed.path.lstrip("/")

        env = {
            "PGPASSWORD": parsed.password,
            "PGHOST": parsed.hostname or "postgres",
            "PGPORT": str(parsed.port or 5432),
            "PGUSER": parsed.username,
        }

        # Find psql command early (needed for admin backup)
        import shutil as sh_util

        psql_cmd = sh_util.which("psql")
        if not psql_cmd:
            for path in ["/opt/homebrew/bin/psql", "/usr/local/bin/psql", "/usr/bin/psql"]:
                if Path(path).exists():
                    psql_cmd = path
                    break

        if not psql_cmd:
            raise Exception("psql command not found. Please install PostgreSQL client tools.")

        # Save current admin user credentials before dropping database
        admin_backup = None
        admin_query = """
            SELECT id, email, hashed_password, is_admin, is_active, created_at, last_login
            FROM users
            WHERE is_admin = true
            LIMIT 1;
        """

        backup_cmd = [
            psql_cmd,
            "-h", env["PGHOST"],
            "-p", env["PGPORT"],
            "-U", env["PGUSER"],
            "-d", db_name,
            "-t", "-A", "-F", "|",
            "-c", admin_query
        ]

        result = subprocess.run(backup_cmd, env=env, capture_output=True, text=True, check=False)

        if result.returncode == 0 and result.stdout.strip():
            # Parse admin data: id|email|password|is_admin|is_active|created_at|last_login
            parts = result.stdout.strip().split("|")
            if len(parts) >= 5:
                admin_backup = {
                    "id": parts[0],
                    "email": parts[1],
                    "hashed_password": parts[2],
                    "is_admin": parts[3],
                    "is_active": parts[4],
                    "created_at": parts[5] if len(parts) > 5 else None,
                    "last_login": parts[6] if len(parts) > 6 else None,
                }
                logger.info("admin_user_backed_up", email=admin_backup['email'], task_id=self.request.id)

        # Update progress: Preparing database
        self.update_state(
            state="PROGRESS", meta={"step": "Preparing database", "progress": 20, "total": 100}
        )

        # Validate database name
        import re

        if not re.match(r"^[a-zA-Z0-9_]+$", db_name):
            raise Exception("Invalid database name")

        # Update progress: Terminating connections
        self.update_state(
            state="PROGRESS",
            meta={"step": "Terminating active connections", "progress": 30, "total": 100},
        )

        # Terminate all connections to the database
        terminate_cmd = [
            psql_cmd,
            "-h",
            env["PGHOST"],
            "-p",
            env["PGPORT"],
            "-U",
            env["PGUSER"],
            "-d",
            "postgres",
            "-c",
            f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{db_name}' AND pid <> pg_backend_pid();",
        ]
        subprocess.run(terminate_cmd, env=env, check=True, capture_output=True)

        # Update progress: Dropping database
        self.update_state(
            state="PROGRESS", meta={"step": "Dropping old database", "progress": 40, "total": 100}
        )

        drop_cmd = [
            psql_cmd,
            "-h",
            env["PGHOST"],
            "-p",
            env["PGPORT"],
            "-U",
            env["PGUSER"],
            "-d",
            "postgres",
            "-c",
            f"DROP DATABASE IF EXISTS {db_name};",
        ]
        subprocess.run(drop_cmd, env=env, check=True, capture_output=True)

        # Update progress: Creating database
        self.update_state(
            state="PROGRESS", meta={"step": "Creating database", "progress": 50, "total": 100}
        )

        create_cmd = [
            psql_cmd,
            "-h",
            env["PGHOST"],
            "-p",
            env["PGPORT"],
            "-U",
            env["PGUSER"],
            "-d",
            "postgres",
            "-c",
            f"CREATE DATABASE {db_name};",
        ]
        subprocess.run(create_cmd, env=env, check=True, capture_output=True)

        # Update progress: Restoring from SQL
        self.update_state(
            state="PROGRESS",
            meta={"step": "Restoring database from SQL dump", "progress": 60, "total": 100},
        )

        restore_cmd = [
            psql_cmd,
            "-h",
            env["PGHOST"],
            "-p",
            env["PGPORT"],
            "-U",
            env["PGUSER"],
            "-d",
            db_name,
            "-f",
            str(sql_path),
        ]

        result = subprocess.run(
            restore_cmd, check=False, env=env, capture_output=True, text=True, timeout=600
        )

        if result.returncode != 0:
            raise Exception(f"Database restore failed: {result.stderr}")

        # Restore admin user credentials if we had backed them up
        if admin_backup:
            self.update_state(
                state="PROGRESS",
                meta={"step": "Restoring current admin credentials", "progress": 75, "total": 100},
            )

            # Update the admin user in the imported database with saved credentials
            # This preserves the current admin's email/password while importing all their data
            restore_admin_sql = f"""
                UPDATE users
                SET email = '{admin_backup['email']}',
                    hashed_password = '{admin_backup['hashed_password']}'
                WHERE is_admin = true;
            """

            restore_admin_cmd = [
                psql_cmd,
                "-h", env["PGHOST"],
                "-p", env["PGPORT"],
                "-U", env["PGUSER"],
                "-d", db_name,
                "-c", restore_admin_sql
            ]

            result = subprocess.run(restore_admin_cmd, env=env, capture_output=True, text=True, check=False)

            if result.returncode == 0:
                logger.info("admin_credentials_restored", email=admin_backup['email'], task_id=self.request.id)
            else:
                logger.warning("admin_restore_failed", email=admin_backup['email'], error=result.stderr, task_id=self.request.id)

        # Update progress: Restoring files (if present)
        if has_uploads:
            self.update_state(
                state="PROGRESS",
                meta={"step": "Restoring uploaded files", "progress": 85, "total": 100},
            )

            uploads_target = Path("echolens_data/uploads")
            uploads_target.parent.mkdir(parents=True, exist_ok=True)
            if uploads_target.exists():
                backup_uploads = Path(temp_dir) / "uploads_backup"
                shutil.move(str(uploads_target), str(backup_uploads))

            shutil.copytree(str(uploads_in_zip), str(uploads_target))

        # Update progress: Validating
        self.update_state(
            state="PROGRESS", meta={"step": "Validating embeddings", "progress": 92, "total": 100}
        )

        # Validate embedding dimensions
        dimension_warnings = []
        tables_to_check = ["transcriptions", "terms", "vector_slices"]

        for table_name in tables_to_check:
            check_cmd = [
                psql_cmd,
                "-h",
                env["PGHOST"],
                "-p",
                env["PGPORT"],
                "-U",
                env["PGUSER"],
                "-d",
                db_name,
                "-t",
                "-c",
                f"SELECT atttypmod FROM pg_attribute WHERE attrelid = '{table_name}'::regclass AND attname = 'embedding';",
            ]

            result = subprocess.run(check_cmd, check=False, env=env, capture_output=True, text=True)

            if result.returncode == 0 and result.stdout.strip():
                db_dimension = int(result.stdout.strip())

                if db_dimension != settings.embedding_dimensions:
                    count_cmd = [
                        psql_cmd,
                        "-h",
                        env["PGHOST"],
                        "-p",
                        env["PGPORT"],
                        "-U",
                        env["PGUSER"],
                        "-d",
                        db_name,
                        "-t",
                        "-c",
                        f"SELECT COUNT(*) FROM {table_name} WHERE embedding IS NOT NULL;",
                    ]

                    count_result = subprocess.run(
                        count_cmd, check=False, env=env, capture_output=True, text=True
                    )
                    embedding_count = (
                        int(count_result.stdout.strip()) if count_result.returncode == 0 else 0
                    )

                    if embedding_count > 0:
                        dimension_warnings.append(
                            {
                                "table": table_name,
                                "imported_dimension": db_dimension,
                                "current_env_dimension": settings.embedding_dimensions,
                                "embedding_count": embedding_count,
                            }
                        )

        # Update progress: Complete
        self.update_state(
            state="PROGRESS", meta={"step": "Import complete!", "progress": 100, "total": 100}
        )

        return {
            "success": True,
            "message": "Import completed successfully",
            "admin_restored": admin_backup is not None,
            "admin_email": admin_backup["email"] if admin_backup else None,
            "has_uploads": has_uploads,
            "dimension_warnings": dimension_warnings,
            "warning_message": (
                f"⚠️ Dimension mismatch detected! Update EMBEDDING_DIMENSIONS to {dimension_warnings[0]['imported_dimension']} or regenerate embeddings."
                if dimension_warnings
                else None
            ),
        }

    except Exception as e:
        import traceback

        error_msg = str(e)
        logger.exception("import_data_task_failed", task_id=self.request.id, error=error_msg)
        self.update_state(
            state="FAILURE", meta={"error": error_msg, "traceback": traceback.format_exc()}
        )
        raise

    finally:
        # Clean up file handler
        import logging
        root_logger = logging.getLogger()
        root_logger.removeHandler(file_handler)
        file_handler.close()

        # Clean up temp files
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        if temp_file_path and Path(temp_file_path).exists():
            Path(temp_file_path).unlink()
