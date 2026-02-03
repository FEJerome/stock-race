"""
Helper functions and utilities.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Callable
from functools import wraps
import time


def async_retry(
    max_retries: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: tuple = (Exception,)
):
    """
    Decorator for retrying async functions.

    Args:
        max_retries: Maximum number of retries
        delay: Initial delay between retries in seconds
        backoff: Backoff multiplier
        exceptions: Exceptions to catch and retry

    Returns:
        Decorated function
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            retries = 0
            current_delay = delay

            while retries < max_retries:
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    retries += 1
                    if retries == max_retries:
                        raise

                    logging.warning(
                        f"Retry {retries}/{max_retries} for {func.__name__}: {str(e)}"
                    )
                    await asyncio.sleep(current_delay)
                    current_delay *= backoff

            raise RuntimeError(f"Max retries exceeded for {func.__name__}")

        return wrapper
    return decorator


def timing_decorator(func):
    """
    Decorator to measure function execution time.

    Args:
        func: Function to decorate

    Returns:
        Decorated function
    """
    @wraps(func)
    async def async_wrapper(*args, **kwargs):
        start_time = time.time()
        try:
            result = await func(*args, **kwargs)
            return result
        finally:
            end_time = time.time()
            logging.debug(
                f"{func.__name__} executed in {end_time - start_time:.3f} seconds"
            )

    @wraps(func)
    def sync_wrapper(*args, **kwargs):
        start_time = time.time()
        try:
            result = func(*args, **kwargs)
            return result
        finally:
            end_time = time.time()
            logging.debug(
                f"{func.__name__} executed in {end_time - start_time:.3f} seconds"
            )

    if asyncio.iscoroutinefunction(func):
        return async_wrapper
    return sync_wrapper


def format_timestamp(timestamp: datetime) -> str:
    """
    Format timestamp to ISO string.

    Args:
        timestamp: Datetime object

    Returns:
        ISO formatted string
    """
    return timestamp.isoformat()


def parse_timestamp(timestamp_str: str) -> Optional[datetime]:
    """
    Parse timestamp string to datetime.

    Args:
        timestamp_str: ISO formatted timestamp string

    Returns:
        Datetime object or None if parsing fails
    """
    try:
        # Try ISO format
        return datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
    except ValueError:
        try:
            # Try other common formats
            formats = [
                "%Y-%m-%d %H:%M:%S",
                "%Y/%m/%d %H:%M:%S",
                "%Y%m%d %H%M%S",
                "%Y-%m-%d",
                "%Y/%m/%d"
            ]

            for fmt in formats:
                try:
                    return datetime.strptime(timestamp_str, fmt)
                except ValueError:
                    continue
        except Exception:
            pass

    return None


def calculate_percentage_change(old_value: float, new_value: float) -> float:
    """
    Calculate percentage change between two values.

    Args:
        old_value: Old value
        new_value: New value

    Returns:
        Percentage change
    """
    if old_value == 0:
        return 0.0
    return ((new_value - old_value) / old_value) * 100


def format_currency(value: float, currency: str = "CNY") -> str:
    """
    Format currency value.

    Args:
        value: Currency value
        currency: Currency code

    Returns:
        Formatted currency string
    """
    if currency == "CNY":
        return f"¥{value:,.2f}"
    elif currency == "USD":
        return f"${value:,.2f}"
    else:
        return f"{value:,.2f} {currency}"


def format_volume(volume: int) -> str:
    """
    Format volume with appropriate units.

    Args:
        volume: Volume number

    Returns:
        Formatted volume string
    """
    if volume >= 1_000_000_000:
        return f"{volume / 1_000_000_000:.2f}B"
    elif volume >= 1_000_000:
        return f"{volume / 1_000_000:.2f}M"
    elif volume >= 1_000:
        return f"{volume / 1_000:.2f}K"
    else:
        return str(volume)


def validate_stock_symbol(symbol: str) -> bool:
    """
    Validate stock symbol format.

    Args:
        symbol: Stock symbol

    Returns:
        True if valid, False otherwise
    """
    if not symbol or not isinstance(symbol, str):
        return False

    # Chinese A-share format: 000001.SZ or 600036.SH
    if "." in symbol:
        code, exchange = symbol.split(".")
        if exchange not in ["SH", "SZ", "HK"]:
            return False
        if not code.isdigit():
            return False
        return True

    # Simple code format
    return symbol.isdigit() and len(symbol) == 6


def normalize_symbol(symbol: str) -> str:
    """
    Normalize stock symbol format.

    Args:
        symbol: Stock symbol

    Returns:
        Normalized symbol
    """
    if not validate_stock_symbol(symbol):
        return symbol

    # Ensure proper format
    if "." not in symbol:
        # Add exchange based on code
        if symbol.startswith("6"):
            return f"{symbol}.SH"
        else:
            return f"{symbol}.SZ"

    return symbol.upper()


def chunk_list(items: List[Any], chunk_size: int) -> List[List[Any]]:
    """
    Split list into chunks.

    Args:
        items: List of items
        chunk_size: Size of each chunk

    Returns:
        List of chunks
    """
    return [items[i:i + chunk_size] for i in range(0, len(items), chunk_size)]


async def batch_process(
    items: List[Any],
    process_func: Callable,
    batch_size: int = 10,
    max_concurrent: int = 5
) -> List[Any]:
    """
    Process items in batches with concurrency control.

    Args:
        items: List of items to process
        process_func: Async function to process each item
        batch_size: Size of each batch
        max_concurrent: Maximum concurrent batches

    Returns:
        List of results
    """
    results = []
    chunks = chunk_list(items, batch_size)

    # Process chunks with concurrency control
    semaphore = asyncio.Semaphore(max_concurrent)

    async def process_chunk(chunk):
        async with semaphore:
            chunk_results = []
            for item in chunk:
                try:
                    result = await process_func(item)
                    chunk_results.append(result)
                except Exception as e:
                    logging.error(f"Failed to process item {item}: {str(e)}")
                    chunk_results.append(None)
            return chunk_results

    # Process all chunks
    tasks = [process_chunk(chunk) for chunk in chunks]
    chunk_results_list = await asyncio.gather(*tasks, return_exceptions=True)

    # Flatten results
    for chunk_results in chunk_results_list:
        if isinstance(chunk_results, Exception):
            logging.error(f"Chunk processing failed: {str(chunk_results)}")
            continue
        results.extend(chunk_results)

    return results


def calculate_moving_average(prices: List[float], period: int) -> List[float]:
    """
    Calculate simple moving average.

    Args:
        prices: List of prices
        period: Moving average period

    Returns:
        List of moving average values
    """
    if len(prices) < period:
        return []

    ma_values = []
    for i in range(len(prices) - period + 1):
        window = prices[i:i + period]
        ma_values.append(sum(window) / period)

    return ma_values


def calculate_standard_deviation(values: List[float]) -> float:
    """
    Calculate standard deviation.

    Args:
        values: List of values

    Returns:
        Standard deviation
    """
    if len(values) < 2:
        return 0.0

    mean = sum(values) / len(values)
    variance = sum((x - mean) ** 2 for x in values) / (len(values) - 1)
    return variance ** 0.5


def is_market_hours(timestamp: datetime) -> bool:
    """
    Check if timestamp is within market hours.

    Args:
        timestamp: Timestamp to check

    Returns:
        True if within market hours, False otherwise
    """
    # Chinese A-share market hours: 9:30-11:30, 13:00-15:00
    hour = timestamp.hour
    minute = timestamp.minute

    # Morning session: 9:30-11:30
    morning_start = (9, 30)
    morning_end = (11, 30)

    # Afternoon session: 13:00-15:00
    afternoon_start = (13, 0)
    afternoon_end = (15, 0)

    def is_within(start, end):
        start_total = start[0] * 60 + start[1]
        end_total = end[0] * 60 + end[1]
        current_total = hour * 60 + minute
        return start_total <= current_total <= end_total

    return (is_within(morning_start, morning_end) or
            is_within(afternoon_start, afternoon_end))


def get_next_market_open(timestamp: datetime) -> datetime:
    """
    Get next market open time.

    Args:
        timestamp: Current timestamp

    Returns:
        Next market open timestamp
    """
    next_open = timestamp.replace(hour=9, minute=30, second=0, microsecond=0)

    # If current time is after market close, move to next day
    if timestamp.hour >= 15:
        next_open += timedelta(days=1)

    # Skip weekends
    while next_open.weekday() >= 5:  # Saturday or Sunday
        next_open += timedelta(days=1)

    return next_open


def safe_float(value: Any, default: float = 0.0) -> float:
    """
    Safely convert value to float.

    Args:
        value: Value to convert
        default: Default value if conversion fails

    Returns:
        Float value
    """
    try:
        if value is None:
            return default
        return float(value)
    except (ValueError, TypeError):
        return default


def safe_int(value: Any, default: int = 0) -> int:
    """
    Safely convert value to int.

    Args:
        value: Value to convert
        default: Default value if conversion fails

    Returns:
        Integer value
    """
    try:
        if value is None:
            return default
        return int(float(value))
    except (ValueError, TypeError):
        return default


def mask_sensitive_data(data: Dict[str, Any], fields: List[str] = None) -> Dict[str, Any]:
    """
    Mask sensitive data in dictionary.

    Args:
        data: Dictionary with data
        fields: List of fields to mask

    Returns:
        Dictionary with masked data
    """
    if fields is None:
        fields = ["password", "token", "secret", "key", "api_key"]

    masked_data = data.copy()
    for key in masked_data:
        for field in fields:
            if field in key.lower():
                masked_data[key] = "***MASKED***"
                break

    return masked_data