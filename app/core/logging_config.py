"""Structured logging configuration using structlog."""

import logging
import os
import sys
from pathlib import Path

import structlog


def configure_logging(log_level: str = "INFO") -> None:
    """
    Configure structlog for structured logging.

    - Development: Pretty console output with colors
    - Production: JSON output for log aggregation systems (ELK, Datadog, etc.)

    Args:
        log_level: Log level (DEBUG, INFO, WARNING, ERROR)
    """
    # Determine if we're in production
    is_production = os.getenv("ENVIRONMENT", "development") == "production"

    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper()),
    )

    # Shared processors for both environments
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]

    # Production: JSON output for log aggregation
    # Development: Pretty colored console output
    if is_production:
        processors = shared_processors + [structlog.processors.JSONRenderer()]
    else:
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True, exception_formatter=structlog.dev.plain_traceback)
        ]

    # Configure structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def setup_task_file_logging(task_id: str) -> logging.Handler:
    """
    Set up file logging for a specific Celery task.

    This creates a task-specific log file in task_logs/{task_id}.log
    and configures the standard library logger to write to it.
    Works alongside structlog for structured logging.

    Args:
        task_id: The Celery task ID

    Returns:
        The file handler that was created (for cleanup if needed)
    """
    # Create task_logs directory if it doesn't exist
    logs_dir = Path("task_logs")
    logs_dir.mkdir(exist_ok=True)

    # Create task-specific log file
    log_file = logs_dir / f"{task_id}.log"

    # Create file handler with simple formatting
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(logging.INFO)

    # Use a simple formatter for readability in the UI
    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
    file_handler.setFormatter(formatter)

    # Add handler to root logger so structlog can use it
    root_logger = logging.getLogger()
    root_logger.addHandler(file_handler)

    return file_handler
