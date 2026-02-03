"""
Logging utilities for AI Service.
"""

import logging
import sys
from typing import Any, Dict, Optional
from loguru import logger

from ..core.config import settings


class InterceptHandler(logging.Handler):
    """Intercept standard logging messages toward Loguru."""

    def emit(self, record: logging.LogRecord) -> None:
        # Get corresponding Loguru level if it exists
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        # Find caller from where originated the logged message
        frame, depth = logging.currentframe(), 2
        while frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(
            level, record.getMessage()
        )


def setup_logging() -> None:
    """Setup logging configuration."""
    # Remove default handler
    logger.remove()

    # Add console handler
    logger.add(
        sys.stdout,
        level=settings.LOG_LEVEL,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        colorize=True,
    )

    # Add file handler
    logger.add(
        settings.LOG_FILE,
        level=settings.LOG_LEVEL,
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
        rotation="500 MB",
        retention="10 days",
        compression="zip",
    )

    # Intercept standard logging
    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)

    # Set loguru as default logger for uvicorn
    for logger_name in ["uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"]:
        logging_logger = logging.getLogger(logger_name)
        logging_logger.handlers = [InterceptHandler()]
        logging_logger.propagate = False

    logger.info("Logging setup complete")


def log_decision_request(
    request_id: str,
    account_id: str,
    ai_provider: str,
    model_name: str,
    stock_count: int,
    position_count: int,
) -> None:
    """Log decision request details."""
    logger.info(
        f"Decision request - ID: {request_id}, Account: {account_id}, "
        f"Provider: {ai_provider}, Model: {model_name}, "
        f"Stocks: {stock_count}, Positions: {position_count}"
    )


def log_decision_result(
    request_id: str,
    action: str,
    symbol: str,
    confidence: float,
    risk_level: str,
    processing_time_ms: int,
    cost_usd: Optional[float] = None,
) -> None:
    """Log decision result details."""
    cost_info = f", Cost: ${cost_usd:.4f}" if cost_usd is not None else ""
    logger.info(
        f"Decision result - ID: {request_id}, Action: {action}, Symbol: {symbol}, "
        f"Confidence: {confidence:.2f}, Risk: {risk_level}, "
        f"Time: {processing_time_ms}ms{cost_info}"
    )


def log_api_call(
    provider: str,
    model: str,
    success: bool,
    duration_ms: int,
    error: Optional[str] = None,
    cost_usd: Optional[float] = None,
) -> None:
    """Log AI API call details."""
    status = "✅ Success" if success else "❌ Failed"
    error_info = f", Error: {error}" if error else ""
    cost_info = f", Cost: ${cost_usd:.4f}" if cost_usd is not None else ""

    logger.info(
        f"API Call - Provider: {provider}, Model: {model}, "
        f"Status: {status}, Duration: {duration_ms}ms{cost_info}{error_info}"
    )


def log_error(
    error_type: str,
    message: str,
    context: Optional[Dict[str, Any]] = None,
    exc_info: bool = True,
) -> None:
    """Log error with context."""
    context_info = f", Context: {context}" if context else ""
    logger.error(
        f"Error - Type: {error_type}, Message: {message}{context_info}",
        exc_info=exc_info,
    )


def log_warning(
    warning_type: str,
    message: str,
    context: Optional[Dict[str, Any]] = None,
) -> None:
    """Log warning with context."""
    context_info = f", Context: {context}" if context else ""
    logger.warning(f"Warning - Type: {warning_type}, Message: {message}{context_info}")


def get_logger(name: str) -> logger:
    """Get logger instance for a module."""
    return logger.bind(module=name)