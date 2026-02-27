"""
Unit tests for BreadthDecisionService.

Tests for:
- Sector decision generation (C6-TAI-001)
- Industry decision generation (C6-TAI-002)
- Batch decision generation for index components (C6-TAI-003)
- Integration with MarketDataClient
- AI decision generation for breadth data
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime

import sys
from pathlib import Path

# Add paths for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / "src"))

from ai_service.services.breadth_decision_service import (
    BreadthDecisionService,
    SectorDecisionRequest,
    IndustryDecisionRequest,
    BatchDecisionRequest,
)
from ai_service.models.schemas import AIProvider, AccountInfo


class TestSectorDecision:
    """Test cases for sector-level decisions (C6-TAI-001)."""

    @pytest.fixture
    def account_info(self):
        """Create test account info."""
        return AccountInfo(
            account_id="acc_123",
            user_id="user_456",
            total_balance=100000.0,
            available_cash=50000.0,
            total_market_value=50000.0,
            total_unrealized_pnl=0.0,
            total_unrealized_pnl_percent=0.0,
        )

    @pytest.fixture
    def service(self):
        """Create a BreadthDecisionService instance."""
        return BreadthDecisionService()

    @pytest.mark.asyncio
    async def test_generate_sector_decision_success(self, service, account_info):
        """Test successful sector decision generation."""
        # Mock market data response
        mock_sector_data = {
            "sector": "technology",
            "stocks": [
                {"symbol": "000001.SZ", "name": "平安银行", "price": 10.5, "change_percent": 2.5, "market_cap": 1000000000},
                {"symbol": "000002.SZ", "name": "万科A", "price": 15.2, "change_percent": -1.2, "market_cap": 800000000},
            ],
            "total": 2,
            "timestamp": "2026-02-12T10:00:00Z"
        }

        with patch.object(service.market_client, 'get_sector_quotes', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_sector_data

            with patch.object(service, '_generate_ai_decision', new_callable=AsyncMock) as mock_ai:
                mock_ai.return_value = {
                    "action": "overweight",
                    "confidence": 0.75,
                    "reasoning": "Technology sector showing strong momentum",
                    "selected_stocks": ["000001.SZ"],
                }

                result = await service.generate_sector_decision(
                    sector="technology",
                    account_info=account_info,
                    ai_provider=AIProvider.DEEPSEEK,
                )

                assert result["sector"] == "technology"
                assert result["decision"]["action"] == "overweight"
                assert result["decision"]["confidence"] == 0.75
                assert len(result["stocks_analyzed"]) == 2

    @pytest.mark.asyncio
    async def test_generate_sector_decision_empty_sector(self, service, account_info):
        """Test sector decision with empty sector data."""
        with patch.object(service.market_client, 'get_sector_quotes', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = {
                "sector": "empty_sector",
                "stocks": [],
                "total": 0,
            }

            result = await service.generate_sector_decision(
                sector="empty_sector",
                account_info=account_info,
                ai_provider=AIProvider.DEEPSEEK,
            )

            assert result["sector"] == "empty_sector"
            assert result["decision"]["action"] == "hold"
            assert "No stocks found" in result["decision"]["reasoning"]

    @pytest.mark.asyncio
    async def test_generate_sector_decision_api_error(self, service, account_info):
        """Test handling of market data API error."""
        with patch.object(service.market_client, 'get_sector_quotes', new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = Exception("API Error: 500 Internal Server Error")

            result = await service.generate_sector_decision(
                sector="technology",
                account_info=account_info,
                ai_provider=AIProvider.DEEPSEEK,
            )

            assert result["sector"] == "technology"
            assert result["decision"]["action"] == "hold"
            assert "error" in result


class TestIndustryDecision:
    """Test cases for industry-level decisions (C6-TAI-002)."""

    @pytest.fixture
    def account_info(self):
        """Create test account info."""
        return AccountInfo(
            account_id="acc_123",
            user_id="user_456",
            total_balance=100000.0,
            available_cash=50000.0,
            total_market_value=50000.0,
            total_unrealized_pnl=0.0,
            total_unrealized_pnl_percent=0.0,
        )

    @pytest.fixture
    def service(self):
        """Create a BreadthDecisionService instance."""
        return BreadthDecisionService()

    @pytest.mark.asyncio
    async def test_generate_industry_decision_success(self, service, account_info):
        """Test successful industry decision generation."""
        mock_industry_data = {
            "industry": "banking",
            "stocks": [
                {"symbol": "000001.SZ", "name": "平安银行", "price": 10.5, "change_percent": 1.5},
                {"symbol": "000002.SZ", "name": "万科A", "price": 15.2, "change_percent": 0.8},
            ],
            "total": 2,
        }

        with patch.object(service.market_client, 'get_industry_quotes', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_industry_data

            with patch.object(service, '_generate_ai_decision', new_callable=AsyncMock) as mock_ai:
                mock_ai.return_value = {
                    "action": "equal_weight",
                    "confidence": 0.65,
                    "reasoning": "Banking sector stable with moderate growth",
                }

                result = await service.generate_industry_decision(
                    industry="banking",
                    account_info=account_info,
                    ai_provider=AIProvider.DEEPSEEK,
                )

                assert result["industry"] == "banking"
                assert result["decision"]["action"] == "equal_weight"


class TestBatchDecision:
    """Test cases for batch decisions on index components (C6-TAI-003)."""

    @pytest.fixture
    def account_info(self):
        """Create test account info."""
        return AccountInfo(
            account_id="acc_123",
            user_id="user_456",
            total_balance=100000.0,
            available_cash=50000.0,
            total_market_value=50000.0,
            total_unrealized_pnl=0.0,
            total_unrealized_pnl_percent=0.0,
        )

    @pytest.fixture
    def service(self):
        """Create a BreadthDecisionService instance."""
        return BreadthDecisionService()

    @pytest.mark.asyncio
    async def test_generate_batch_decision_success(self, service, account_info):
        """Test successful batch decision generation for index components."""
        mock_components = {
            "index": "CSI300",
            "components": [
                {"symbol": "000001.SZ", "name": "平安银行", "weight": 2.5, "price": 10.5},
                {"symbol": "000002.SZ", "name": "万科A", "weight": 1.8, "price": 15.2},
                {"symbol": "000063.SZ", "name": "中兴通讯", "weight": 1.2, "price": 25.0},
            ],
            "total": 3,
        }

        with patch.object(service.market_client, 'get_index_components', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_components

            with patch.object(service, '_generate_batch_ai_decisions', new_callable=AsyncMock) as mock_ai:
                mock_ai.return_value = [
                    {"symbol": "000001.SZ", "action": "buy", "confidence": 0.8},
                    {"symbol": "000002.SZ", "action": "hold", "confidence": 0.6},
                    {"symbol": "000063.SZ", "action": "sell", "confidence": 0.7},
                ]

                result = await service.generate_batch_decision(
                    index="CSI300",
                    account_info=account_info,
                    ai_provider=AIProvider.DEEPSEEK,
                )

                assert result["index"] == "CSI300"
                assert len(result["decisions"]) == 3
                assert result["total_components"] == 3

    @pytest.mark.asyncio
    async def test_generate_batch_decision_with_max_stocks(self, service, account_info):
        """Test batch decision with max stocks limit."""
        mock_components = {
            "index": "CSI300",
            "components": [
                {"symbol": f"{i:06d}.SZ", "name": f"Stock{i}", "weight": 1.0, "price": 10.0}
                for i in range(1, 11)  # 10 stocks
            ],
            "total": 10,
        }

        with patch.object(service.market_client, 'get_index_components', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_components

            with patch.object(service, '_generate_batch_ai_decisions', new_callable=AsyncMock) as mock_ai:
                mock_ai.return_value = [
                    {"symbol": f"{i:06d}.SZ", "action": "buy", "confidence": 0.7}
                    for i in range(1, 6)  # Only 5 decisions
                ]

                result = await service.generate_batch_decision(
                    index="CSI300",
                    account_info=account_info,
                    ai_provider=AIProvider.DEEPSEEK,
                    max_stocks=5,
                )

                # Should limit to top 5 by weight
                assert len(result["decisions"]) <= 5


class TestBreadthDecisionPrompts:
    """Test cases for prompt generation."""

    def test_create_sector_prompt(self):
        """Test sector decision prompt creation."""
        from ai_service.services.breadth_decision_service import BreadthDecisionService

        service = BreadthDecisionService()
        sector_data = {
            "sector": "technology",
            "stocks": [
                {"symbol": "000001.SZ", "name": "平安银行", "price": 10.5, "change_percent": 2.5},
            ],
        }
        account_info = Mock()
        account_info.total_balance = 100000.0
        account_info.available_cash = 50000.0

        prompt = service._create_sector_prompt(sector_data, account_info)

        assert "technology" in prompt
        assert "000001.SZ" in prompt
        assert "平安银行" in prompt
        assert "sector" in prompt.lower() or "板块" in prompt

    def test_create_industry_prompt(self):
        """Test industry decision prompt creation."""
        from ai_service.services.breadth_decision_service import BreadthDecisionService

        service = BreadthDecisionService()
        industry_data = {
            "industry": "banking",
            "stocks": [
                {"symbol": "000001.SZ", "name": "平安银行", "price": 10.5},
            ],
        }
        account_info = Mock()
        account_info.total_balance = 100000.0

        prompt = service._create_industry_prompt(industry_data, account_info)

        assert "banking" in prompt or "银行" in prompt
        assert "industry" in prompt.lower() or "行业" in prompt


class TestBreadthDecisionServiceIntegration:
    """Integration-style tests."""

    @pytest.mark.asyncio
    async def test_service_initialization(self):
        """Test service initialization with default client."""
        service = BreadthDecisionService()
        assert service.market_client is not None

    @pytest.mark.asyncio
    async def test_service_with_custom_client(self):
        """Test service with custom market client."""
        mock_client = Mock()
        service = BreadthDecisionService(market_client=mock_client)
        assert service.market_client == mock_client


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
