"""
HTTP client for Market Data Service.

Provides access to breadth query APIs:
- Sector quotes: GET /api/v1/market/sector/{sector}/quotes
- Industry quotes: GET /api/v1/market/industry/{industry}/quotes
- Index components: GET /api/v1/market/index/{index}/components
"""

from typing import Dict, Any, Optional, List
import aiohttp
from loguru import logger


class MarketDataClient:
    """
    HTTP client for Market Data Service breadth queries.

    Used for:
    - C6-TAI-001: Sector-level decisions
    - C6-TAI-002: Industry-level decisions
    - C6-TAI-003: Batch decisions for index components
    """

    def __init__(self, base_url: str = "http://localhost:8001", timeout: float = 10.0):
        """
        Initialize the Market Data client.

        Args:
            base_url: Base URL of Market Data Service
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=self.timeout)
            )
        return self._session

    async def _make_request(self, endpoint: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Make HTTP GET request to Market Data Service.

        Args:
            endpoint: API endpoint path
            params: Query parameters

        Returns:
            JSON response as dictionary

        Raises:
            Exception: If request fails
        """
        url = f"{self.base_url}{endpoint}"
        session = await self._get_session()

        try:
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    logger.debug(f"✅ Successfully fetched data from {endpoint}")
                    return data
                else:
                    error_text = await response.text()
                    logger.error(f"❌ Market Data API error: {response.status} - {error_text}")
                    raise Exception(f"Market Data API returned {response.status}: {error_text}")
        except aiohttp.ClientError as e:
            logger.error(f"❌ Market Data API connection error: {e}")
            raise Exception(f"Failed to connect to Market Data Service: {e}")

    async def get_sector_quotes(
        self,
        sector: str,
        skip: int = 0,
        limit: int = 50,
        sort_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get quotes for all stocks in a sector.

        Args:
            sector: Sector code (e.g., "technology", "financial")
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return
            sort_by: Sort field (market_cap, price, change_percent, volume)

        Returns:
            Dictionary with sector data and stock quotes
        """
        params = {"skip": skip, "limit": limit}
        if sort_by:
            params["sort_by"] = sort_by

        return await self._make_request(
            f"/api/v1/market/sector/{sector}/quotes",
            params=params
        )

    async def get_industry_quotes(
        self,
        industry: str,
        skip: int = 0,
        limit: int = 50,
        sort_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get quotes for all stocks in an industry.

        Args:
            industry: Industry code (e.g., "banking", "software")
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return
            sort_by: Sort field (market_cap, price, change_percent, volume)

        Returns:
            Dictionary with industry data and stock quotes
        """
        params = {"skip": skip, "limit": limit}
        if sort_by:
            params["sort_by"] = sort_by

        return await self._make_request(
            f"/api/v1/market/industry/{industry}/quotes",
            params=params
        )

    async def get_index_components(
        self,
        index: str,
        skip: int = 0,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """
        Get components (stocks) of a market index.

        Args:
            index: Index code (e.g., "CSI300", "SSE50")
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return

        Returns:
            Dictionary with index data and component stocks
        """
        params = {"skip": skip, "limit": limit}

        return await self._make_request(
            f"/api/v1/market/index/{index}/components",
            params=params
        )

    async def get_sector_list(self) -> Dict[str, Any]:
        """
        Get list of all available sectors.

        Returns:
            Dictionary with list of sectors
        """
        return await self._make_request("/api/v1/market/sectors")

    async def get_industry_list(self) -> Dict[str, Any]:
        """
        Get list of all available industries.

        Returns:
            Dictionary with list of industries
        """
        return await self._make_request("/api/v1/market/industries")

    async def get_stock_classification(self, symbol: str) -> Dict[str, Any]:
        """
        Get classification (sector/industry) for a stock.

        Args:
            symbol: Stock symbol (e.g., "000001.SZ")

        Returns:
            Dictionary with stock classification info
        """
        return await self._make_request(f"/api/v1/market/classification/{symbol}")

    async def close(self):
        """Close the HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()
            logger.info("✅ MarketDataClient session closed")

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
