import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.base import Base

logger = structlog.get_logger(__name__)

# Support for local, Docker, and remote (Neon, etc.) PostgreSQL
engine_config = {
    "echo": False,  # Set to True for SQL query debugging
    "pool_pre_ping": True,  # Verify connections before using
    "pool_recycle": 3600,  # Recycle connections after 1 hour
}

# Add SSL support and disable prepared statements for remote databases (Neon, etc.)
if "neon.tech" in settings.database_url or "ssl=require" in settings.database_url:
    engine_config["connect_args"] = {
        "ssl": "require",
        "prepared_statement_cache_size": 0,  # Disable prepared statement cache
    }

engine = create_async_engine(settings.database_url, **engine_config)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with async_session_maker() as session:
        yield session


async def validate_vector_dimensions():
    """
    Validate that database vector column dimensions match EMBEDDING_DIMENSIONS from .env

    Raises:
        RuntimeError: If dimensions mismatch and embeddings exist
    """

    async with engine.begin() as conn:
        # Check if tables exist and get their vector dimensions
        tables_to_check = ["transcriptions", "terms", "vector_slices"]

        for table_name in tables_to_check:
            # Check if table exists
            result = await conn.execute(
                text(f"""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = '{table_name}'
                )
            """)
            )
            table_exists = result.scalar()

            if not table_exists:
                continue  # Table doesn't exist yet, will be created with correct dimensions

            # Get current vector dimension for this table
            result = await conn.execute(
                text(f"""
                SELECT atttypmod
                FROM pg_attribute
                WHERE attrelid = '{table_name}'::regclass
                AND attname = 'embedding'
            """)
            )

            db_dimension = result.scalar()

            if db_dimension is None:
                continue  # No embedding column yet

            # For pgvector, atttypmod directly stores the dimension (not +4 like some other types)
            # db_dimension is already the correct value
            expected_dimension = settings.embedding_dimensions

            if db_dimension != expected_dimension:
                # Check if there are any embeddings in this table
                if table_name == "transcriptions":
                    count_result = await conn.execute(
                        text("SELECT COUNT(*) FROM transcriptions WHERE embedding IS NOT NULL")
                    )
                elif table_name == "terms":
                    count_result = await conn.execute(
                        text("SELECT COUNT(*) FROM terms WHERE embedding IS NOT NULL")
                    )
                elif table_name == "vector_slices":
                    count_result = await conn.execute(
                        text("SELECT COUNT(*) FROM vector_slices WHERE embedding IS NOT NULL")
                    )

                embedding_count = count_result.scalar()

                if embedding_count > 0:
                    raise RuntimeError(
                        f"\n{'=' * 80}\n"
                        f"❌ DIMENSION MISMATCH ERROR\n"
                        f"{'=' * 80}\n"
                        f"Table: {table_name}\n"
                        f"Database has: vector({db_dimension})\n"
                        f".env EMBEDDING_DIMENSIONS: {expected_dimension}\n"
                        f"Existing embeddings: {embedding_count}\n"
                        f"\n"
                        f"You've changed embedding models but the database still has the old dimensions.\n"
                        f"\n"
                        f"Options:\n"
                        f"1. Run migration to change dimensions (see app/migrations/README.md):\n"
                        f"   docker exec -it echolens-postgres psql -U echolens -d echolens -f /app/migrations/change_vector_dimensions.sql\n"
                        f"\n"
                        f"2. Full reset (deletes ALL data):\n"
                        f"   ./full-reset.sh\n"
                        f"\n"
                        f"3. Revert .env to use EMBEDDING_DIMENSIONS={db_dimension}\n"
                        f"{'=' * 80}\n"
                    )
                # No embeddings exist, safe to auto-update dimension
                logger.warning(
                    f"Auto-updating {table_name}.embedding from vector({db_dimension}) "
                    f"to vector({expected_dimension}) (no embeddings exist)"
                )
                await conn.execute(
                    text(
                        f"ALTER TABLE {table_name} ALTER COLUMN embedding TYPE vector({expected_dimension})"
                    )
                )
                # Transaction will auto-commit when exiting the context manager


async def apply_schema_updates():
    """
    Apply schema updates for existing tables.
    SQLAlchemy's create_all() only creates missing tables, not missing columns.
    This function handles adding new columns to existing tables.
    """

    async with engine.begin() as conn:
        # Add source column to terms table if missing
        result = await conn.execute(
            text("""
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'terms' AND column_name = 'source'
            )
        """)
        )
        has_source_column = result.scalar()

        if not has_source_column:
            logger.info("adding_source_column", table="terms")
            await conn.execute(text("ALTER TABLE terms ADD COLUMN source VARCHAR DEFAULT 'auto'"))
            logger.info("source_column_added", table="terms")


async def init_db():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)

    # Apply any schema updates for existing tables
    await apply_schema_updates()

    # Validate dimensions after tables are created
    await validate_vector_dimensions()
