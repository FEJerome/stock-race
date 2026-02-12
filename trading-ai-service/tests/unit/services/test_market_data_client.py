"""
Unit tests for MarketDataClient.

Tests for:
- HTTP client initialization and configuration
- Sector quotes API calls
- Industry quotes API calls
- Index components API calls
- Error handling and retries
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
import asyncio

import sys
from pathlib import Path

# Add paths for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / "src"))

from ai_service.services.market_data_client import MarketDataClient


class TestMarketDataClient:
    """Test cases for MarketDataClient."""

    @pytest.fixture
    def client(self):
        """Create a MarketDataClient instance."""
        return MarketDataClient(base_url="http://localhost:8001")

    @pytest.mark.asyncio
    async def test_init(self):
        """Test client initialization."""
        client = MarketDataClient(base_url="http://localhost:8001")
        assert client.base_url == "http://localhost:8001"
        assert client.timeout == 10.0

    @pytest.mark.asyncio
    async def test_init_custom_timeout(self):
        """Test client initialization with custom timeout."""
        client = MarketDataClient(base_url="http://localhost:8001", timeout=5.0)
        assert client.timeout == 5.0

    @pytest.mark.asyncio
    async def test_get_sector_quotes_success(self, client):
        """Test successful sector quotes retrieval."""
        mock_response = Mock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={
            "sector": "technology",
            "stocks": [
                {"symbol": "000001.SZ", "name": "平安银行", "price": 10.5, "change_percent": 2.5},
                {"symbol": "000002.SZ", "name": "万科A", "price": 15.2, "change_percent": -1.2},
            ],
            "total": 2,
            "timestamp": "2026-02-12T10:00:00Z"
        })

        with patch("aiohttp.ClientSession.get") as mock_get:
            mock_get.return_value.__aenter__ = AsyncMock(return_value=mock_response)
            mock_get.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await client.get_sector_quotes("technology")

            assert result["sector"] == "technology"
            assert len(result["stocks"]) == 2
            assert result["total"] == 2

    @pytest.mark.asyncio
    async def test_get_sector_quotes_with_pagination(self, client):
        """Test sector quotes with pagination parameters."""
        mock_response = Mock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={
            "sector": "financial",
            "stocks": [],
            "total": 0,
            "timestamp": "2026-02-12T10:00:00Z"
        })

        with patch("aiohttp.ClientSession.get") as mock_get:
            mock_get.return_value.__aenter__ = AsyncMock(return_value=mock_response)
            mock_get.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await client.get_sector_quotes(
                sector="financial",
                skip=10,
                limit=20,
                sort_by="market_cap"
            )

            # Verify the call was made with correct parameters
            mock_get.assert_called_once()
            call_args = mock_get.call_args
            assert "financial" in call_args[0][0]

    @pytest.mark.asyncio
    async def test_get_industry_quotes_success(self, client):
        """Test successful industry quotes retrieval."""
        mock_response = Mock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={
            "industry": "banking",
            "stocks": [
                {"symbol": "000001.SZ", "name": "平安银行", "price": 10.5, "change_percent": 2.5},
            ],
            "total": 1,
            "timestamp": "2026-02-12T10:00:00Z"
        })

        with patch("aiohttp.ClientSession.get") as mock_get:
            mock_get.return_value.__aenter__ = AsyncMock(return_value=mock_response)
            mock_get.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await client.get_industry_quotes("banking")

            assert result["industry"] == "banking"
            assert len(result["stocks"]) == 1

    @pytest.mark.asyncio
    async def test_get_index_components_success(self, client):
        """Test successful index components retrieval."""
        mock_response = Mock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={
            "index": "CSI300",
            "components": [
                {"symbol": "000001.SZ", "name": "平安银行", "weight": 2.5, "price": 10.5},
                {"symbol": "000002.SZ", "name": "万科A", "weight": 1.8, "price": 15.2},
            ],
            "total": 2,
            "timestamp": "2026-02-12T10:00:00Z"
        })

        with patch("aiohttp.ClientSession.get") as mock_get:
            mock_get.return_value.__aenter__ = AsyncMock(return_value=mock_response)
            mock_get.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await client.get_index_components("CSI300")

            assert result["index"] == "CSI300"
            assert len(result["components"]) == 2
            assert result["components"][0]["weight"] == 2.5

    @pytest.mark.asyncio
    async def test_get_sector_quotes_http_error(self, client):
        """Test handling of HTTP errors."""
        mock_response = Mock()
        mock_response.status = 500
        mock_response.text = AsyncMock(return_value="Internal Server Error")

        with patch("aiohttp.ClientSession.get") as mock_get:
            mock_get.return_value.__aenter__ = AsyncMock(return_value=mock_response)
            mock_get.return_value.__aexit__ = AsyncMock(return_value=False)

            with pytest.raises(Exception) as exc_info:
                await client.get_sector_quotes("technology")

            assert "500" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_sector_quotes_connection_error(self, client):
        """Test handling of connection errors."""
        with patch("aiohttp.ClientSession.get", side_effect=Exception("Connection refused")):
            with pytest.raises(Exception) as exc_info:
                await client.get_sector_quotes("technology")

            assert "Connection refused" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_get_sector_list(self, client):
        """Test getting sector list."""
        mock_response = Mock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={
            "sectors": [
                {"code": "technology", "name": "科技", "stock_count": 150},
                {"code": "financial", "name": "金融", "stock_count": 80},
            ]
        })

        with patch("aiohttp.ClientSession.get") as mock_get:
            mock_get.return_value.__aenter__ = AsyncMock(return_value=mock_response)
            mock_get.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await client.get_sector_list()

            assert len(result["sectors"]) == 2
            assert result["sectors"][0]["code"] == "technology"

    @pytest.mark.asyncio
    async def test_get_industry_list(self, client):
        """Test getting industry list."""
        mock_response = Mock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={
            "industries": [
                {"code": "banking", "name": "银行", "stock_count": 40},
                {"code": "software", "name": "软件", "stock_count": 120},
            ]
        })

        with patch("aiohttp.ClientSession.get") as mock_get:
            mock_get.return_value.__aenter__ = AsyncMock(return_value=mock_response)
            mock_get.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await client.get_industry_list()

            assert len(result["industries"]) == 2
            assert result["industries"][0]["code"] == "banking"


class TestMarketDataClientIntegration:
    """Integration-style tests for MarketDataClient."""

    @pytest.mark.asyncio
    async def test_client_context_manager(self):
        """Test client as async context manager."""
        async with MarketDataClient(base_url="http://localhost:8001") as client:
            assert client.base_url == "http://localhost:8001"

    @pytest.mark.asyncio
    async def test_concurrent_requests(self):
        """Test concurrent API calls."""
        client = MarketDataClient(base_url="http://localhost:8001")

        mock_response = Mock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value={"stocks": [], "total": 0})

        with patch("aiohttp.ClientSession.get") as mock_get:
            mock_get.return_value.__aenter__ = AsyncMock(return_value=mock_response)
            mock_get.return_value.__aexit__ = AsyncMock(return_value=False)

            # Make concurrent calls
            results = await asyncio.gather(
                client.get_sector_quotes("technology"),
                client.get_industry_quotes("banking"),
                client.get_index_components("CSI300"),
            )

            assert len(results) == 3
            assert mock_get.call_count == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
