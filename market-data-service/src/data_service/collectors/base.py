"""
Base data collector interface.
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import aiohttp

from data_service.core.config import settings

logger = logging.getLogger(__name__)


class DataSourceError(Exception):
    """Base exception for data source errors."""
    pass


class RateLimitError(DataSourceError):
    """Rate limit exceeded error."""
    pass


class DataSource(ABC):
    """Abstract base class for data sources."""

    def __init__(self, name: str, priority: int = 1):
        self.name = name
        self.priority = priority
        self.session: Optional[aiohttp.ClientSession] = None
        self.last_request_time: Optional[datetime] = None
        self.request_count = 0
        self.error_count = 0
        self.max_retries = settings.MAX_RETRIES
        self.timeout = aiohttp.ClientTimeout(total=30)

    async def __aenter__(self):
        """Async context manager entry."""
        self.session = aiohttp.ClientSession(timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()

    @abstractmethod
    async def get_stock_quote(self, symbol: str) -> Dict[str, Any]:
        """
        Get real-time quote for a stock.

        Args:
            symbol: Stock symbol

        Returns:
            Dictionary with quote data
        """
        pass

    @abstractmethod
    async def get_stock_history(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
        interval: str = "1d"
    ) -> List[Dict[str, Any]]:
        """
        Get historical data for a stock.

        Args:
            symbol: Stock symbol
            start_date: Start date
            end_date: End date
            interval: Data interval (1m, 5m, 1d, etc.)

        Returns:
            List of historical data points
        """
        pass

    @abstractmethod
    async def get_stock_info(self, symbol: str) -> Dict[str, Any]:
        """
        Get stock information (company info, fundamentals).

        Args:
            symbol: Stock symbol

        Returns:
            Dictionary with stock information
        """
        pass

    @abstractmethod
    async def get_batch_quotes(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Get real-time quotes for multiple stocks.

        Args:
            symbols: List of stock symbols

        Returns:
            Dictionary mapping symbol to quote data
        """
        pass

    async def _make_request(
        self,
        url: str,
        method: str = "GET",
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Make HTTP request with rate limiting and error handling.

        Args:
            url: Request URL
            method: HTTP method
            params: Query parameters
            headers: HTTP headers
            data: Request body

        Returns:
            Response data

        Raises:
            RateLimitError: If rate limit exceeded
            DataSourceError: If request fails
        """
        if not self.session:
            self.session = aiohttp.ClientSession(timeout=self.timeout)

        # Rate limiting
        await self._check_rate_limit()

        # Prepare request
        request_headers = headers or {}
        request_headers.setdefault("User-Agent", "StockRace/1.0")

        try:
            async with self.session.request(
                method=method,
                url=url,
                params=params,
                headers=request_headers,
                json=data
            ) as response:
                self.last_request_time = datetime.now()
                self.request_count += 1

                if response.status == 429:  # Too Many Requests
                    raise RateLimitError(f"Rate limit exceeded for {self.name}")

                if response.status != 200:
                    self.error_count += 1
                    raise DataSourceError(
                        f"Request failed with status {response.status}: {await response.text()}"
                    )

                content_type = response.headers.get("Content-Type", "")
                if "application/json" in content_type:
                    return await response.json()
                else:
                    return {"text": await response.text()}

        except aiohttp.ClientError as e:
            self.error_count += 1
            raise DataSourceError(f"HTTP request failed: {str(e)}")
        except asyncio.TimeoutError:
            self.error_count += 1
            raise DataSourceError(f"Request timeout for {self.name}")

    async def _check_rate_limit(self):
        """Check and enforce rate limiting."""
        if not self.last_request_time:
            return

        # Simple rate limiting: at least 100ms between requests
        elapsed = (datetime.now() - self.last_request_time).total_seconds()
        if elapsed < 0.1:  # 100ms
            await asyncio.sleep(0.1 - elapsed)

    async def _retry_request(self, func, *args, **kwargs) -> Any:
        """
        Retry a function with exponential backoff.

        Args:
            func: Function to retry
            *args: Function arguments
            **kwargs: Function keyword arguments

        Returns:
            Function result

        Raises:
            DataSourceError: If all retries fail
        """
        for attempt in range(self.max_retries):
            try:
                return await func(*args, **kwargs)
            except (DataSourceError, aiohttp.ClientError, asyncio.TimeoutError) as e:
                if attempt == self.max_retries - 1:
                    raise DataSourceError(
                        f"Failed after {self.max_retries} attempts: {str(e)}"
                    )

                # Exponential backoff
                delay = 2 ** attempt
                logger.warning(
                    f"Attempt {attempt + 1} failed for {self.name}, "
                    f"retrying in {delay}s: {str(e)}"
                )
                await asyncio.sleep(delay)

    def get_health_status(self) -> Dict[str, Any]:
        """
        Get data source health status.

        Returns:
            Dictionary with health metrics
        """
        return {
            "name": self.name,
            "priority": self.priority,
            "request_count": self.request_count,
            "error_count": self.error_count,
            "error_rate": self.error_count / max(self.request_count, 1),
            "last_request": self.last_request_time.isoformat() if self.last_request_time else None,
            "is_healthy": self.error_count < 10  # Simple health check
        }

    async def close(self):
        """Close the data source."""
        if self.session:
            await self.session.close()
            self.session = None