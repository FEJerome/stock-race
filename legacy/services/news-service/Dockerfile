# News Service Dockerfile
FROM python:3.11-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache gcc g++ musl-dev

# Copy and install infra SDKs first
COPY infra/health-check/src /app/infra/health-check/src
COPY infra/event-bus/src /app/infra/event-bus/src
RUN pip install --no-cache-dir /app/infra/health-check/src

# Copy News Service source code and requirements
COPY news-service/requirements.txt .
COPY news-service/src/ ./src/
COPY news-service/pyproject.toml .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Set Python path
ENV PYTHONPATH=/app/src:/app/infra/event-bus/src:/app/infra/health-check/src

# Run service
CMD ["python", "src/news_service/main.py"]
