#!/usr/bin/env python3
"""
Alternative entry point for Data Service that fixes import issues.
"""
import sys
import os

# Add src directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Now import and run the app
from data_service.main import app

if __name__ == "__main__":
    import uvicorn
    from data_service.core.config import settings

    uvicorn.run(
        "run:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info",
    )