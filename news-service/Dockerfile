FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y gcc g++ && rm -rf /var/lib/apt/lists/*

# Copy and install infra SDKs first
COPY infra/health-check/src /app/infra/health-check/src
COPY infra/event-bus/src /app/infra/event-bus/src
RUN pip install --no-cache-dir /app/infra/health-check/src

# Copy News Service source code and requirements
COPY news-service/requirements.txt .
COPY news-service/src/ ./src/
COPY news-service/pyproject.toml .

# Install dependencies (不使用 editable mode)
RUN pip install --no-cache-dir -r requirements.txt

# Set Python path (包含 infra SDK)
ENV PYTHONPATH=/app/src:/app/infra/event-bus/src:/app/infra/health-check/src

# Run service
CMD ["python", "src/news_service/main.py"]
