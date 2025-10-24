FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for audio processing and database backup
RUN apt-get update && apt-get install -y \
    ffmpeg \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install uv

# Copy project files
COPY pyproject.toml .
COPY app ./app

# Install dependencies
RUN uv sync

# Create necessary directories
RUN mkdir -p echolens_data/uploads echolens_data/exports task_logs

# Expose backend port
EXPOSE 8000

# Run FastAPI with uvicorn (production - no reload)
CMD ["sh", "-c", ". .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
