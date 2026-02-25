# Market Data Service Dockerfile
FROM python:3.11-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache gcc g++ musl-dev curl

# Copy requirements and install Python dependencies
COPY market-data-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY market-data-service/src/ ./src/

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Run the application
CMD ["uvicorn", "data_service.main:app", "--host", "0.0.0.0", "--port", "8001"]
