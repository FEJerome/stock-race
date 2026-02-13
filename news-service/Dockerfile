FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/
COPY pyproject.toml .

# Install local package
RUN pip install -e .

# Set Python path
ENV PYTHONPATH=/app/src

# Run service
CMD ["python", "src/news_service/main.py"]
