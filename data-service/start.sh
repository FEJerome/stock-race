#!/bin/bash
# Start script for Data Service

cd "$(dirname "$0")"

# Activate virtual environment
source venv/bin/activate

# Add src directory to Python path
export PYTHONPATH="$PWD/src:$PYTHONPATH"

# Start the service
echo "Starting Data Service on port 8001..."
python3 -c "
import sys
sys.path.insert(0, 'src')
from data_service.main import app
import uvicorn
from data_service.core.config import settings

uvicorn.run(
    'data_service.main:app',
    host=settings.HOST,
    port=settings.PORT,
    reload=settings.DEBUG,
    log_level='info'
)
"