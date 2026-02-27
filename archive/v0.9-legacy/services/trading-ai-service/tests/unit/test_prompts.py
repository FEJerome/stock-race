"""
Unit tests for prompt templates.

Tests for:
- base_prompts.py
- trading_prompts.py
"""

import pytest
from datetime import datetime

import sys
from pathlib import Path

# Add paths for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / "src"))

from ai_service.models.schemas import (
    StockData,
    Position,
    AccountInfo,
    DecisionAction,
    RiskLevel,
)
from ai_service.prompts.base_prompts import BasePrompts
from ai_service.prompts.trading_prompts import TradingPrompts


class TestBasePrompts:
    """Test cases for BasePrompts class."""

    def test_format_stock_data_basic(self):
        """Test formatting basic stock data."""
        stock = StockData(
            symbol="000001.SZ",
            name="平安银行",
            current_price=10.50,
        )

        result = BasePrompts.format_stock_data(stock)

        assert "股票代码: 000001.SZ" in result
        assert "股票名称: 平安银行" in result
        assert "当前价格: ¥10.50" in result

    def test_format_stock_data_with_technical_indicators(self):
        """Test formatting stock data with technical indicators."""
        stock = StockData(
            symbol="000001.SZ",
            name="平安银行",
            current_price=10.50,
            open_price=10.20,
            high_price=10.80,
            low_price=10.10,
            volume=1000000,
            change=0.30,
            change_percent=2.94,
            ma_5=10.30,
            ma_20=10.10,
            ma_60=9.80,
            rsi=65.5,
            macd=0.25,
        )

        result = BasePrompts.format_stock_data(stock)

        assert "开盘价: ¥10.20" in result
        assert "最高价: ¥10.80" in result
        assert "最低价: ¥10.10" in result
        assert "成交量: 1,000,000" in result
        assert "涨跌: +0.30" in result
        assert "涨跌幅: +2.94%" in result
        assert "5日均线" in result
        assert "20日均线" in result
        assert "60日均线" in result
        assert "RSI: 65.5" in result
        assert "MACD: 0.25" in result

    def test_format_stock_data_negative_change(self):
        """Test formatting stock data with negative change."""
        stock = StockData(
            symbol="000001.SZ",
            name="平安银行",
            current_price=10.20,
            change=-0.30,
            change_percent=-2.86,
        )

        result = BasePrompts.format_stock_data(stock)

        assert "涨跌: -0.30" in result
        assert "涨跌幅: -2.86%" in result

    def test_format_position(self):
        """Test formatting position data."""
        position = Position(
            symbol="000001.SZ",
            quantity=1000,
            avg_cost=10.00,
            current_price=10.50,
            market_value=10500.00,
            unrealized_pnl=500.00,
            unrealized_pnl_percent=5.0,
        )

        result = BasePrompts.format_position(position)

        assert "000001.SZ" in result
        assert "1,000" in result
        assert "¥10.00" in result
        assert "¥10.50" in result

    def test_format_position_with_pnl(self):
        """Test formatting position with P&L data."""
        position = Position(
            symbol="000001.SZ",
            quantity=1000,
            avg_cost=10.00,
            current_price=10.50,
            market_value=10500.00,
            unrealized_pnl=500.00,
            unrealized_pnl_percent=5.0,
        )

        result = BasePrompts.format_position(position)

        assert "10,500.00" in result
        assert "500.00" in result
        assert "5.00%" in result

    def test_format_account_info(self):
        """Test formatting account info."""
        account = AccountInfo(
            account_id="acc_123",
            user_id="user_456",
            total_balance=100000.00,
            available_cash=50000.00,
            total_market_value=50000.00,
            total_unrealized_pnl=2000.00,
            total_unrealized_pnl_percent=4.0,
        )

        result = BasePrompts.format_account_info(account)

        assert "acc_123" in result
        assert "100,000.00" in result
        assert "50,000.00" in result
        assert "2,000.00" in result

    def test_format_account_info_with_strategy(self):
        """Test formatting account info with strategy."""
        account = AccountInfo(
            account_id="acc_123",
            user_id="user_456",
            total_balance=100000.00,
            available_cash=50000.00,
            total_market_value=50000.00,
            total_unrealized_pnl=0.00,
            total_unrealized_pnl_percent=0.00,
            risk_tolerance="medium",
            trading_strategy="growth",
        )

        result = BasePrompts.format_account_info(account)

        assert "medium" in result
        assert "growth" in result

    def test_get_trading_constraints_prompt(self):
        """Test formatting constraints."""
        constraints = {
            "max_position_size": 100000.0,
            "min_trade_amount": 1000.0,
            "max_daily_trades": 10,
        }

        result = BasePrompts.get_trading_constraints_prompt(constraints)

        assert "单只股票最大持仓" in result
        assert "最小交易金额" in result
        assert "每日最大交易次数" in result

    def test_get_trading_constraints_prompt_empty(self):
        """Test formatting empty constraints."""
        result = BasePrompts.get_trading_constraints_prompt({})
        assert result == ""


class TestTradingPrompts:
    """Test cases for TradingPrompts class."""

    def test_create_decision_prompt_basic(self):
        """Test creating basic decision prompt."""
        from ai_service.models.schemas import DecisionRequest

        account = AccountInfo(
            account_id="acc_123",
            user_id="user_456",
            total_balance=100000.00,
            available_cash=50000.00,
            total_market_value=50000.00,
            total_unrealized_pnl=0.00,
            total_unrealized_pnl_percent=0.00,
        )

        stock = StockData(
            symbol="000001.SZ",
            name="平安银行",
            current_price=10.50,
        )

        request = DecisionRequest(
            account_info=account,
            stock_data=[stock],
            positions=[],
        )

        prompt = TradingPrompts.create_decision_prompt(request)

        assert "账户信息" in prompt
        assert "股票数据" in prompt
        assert "000001.SZ" in prompt
        assert "平安银行" in prompt

    def test_create_decision_prompt_with_position(self):
        """Test creating decision prompt with existing position."""
        from ai_service.models.schemas import DecisionRequest

        account = AccountInfo(
            account_id="acc_123",
            user_id="user_456",
            total_balance=100000.00,
            available_cash=50000.00,
            total_market_value=50000.00,
            total_unrealized_pnl=0.00,
            total_unrealized_pnl_percent=0.00,
        )

        stock = StockData(
            symbol="000001.SZ",
            name="平安银行",
            current_price=10.50,
        )

        position = Position(
            symbol="000001.SZ",
            quantity=1000,
            avg_cost=10.00,
            current_price=10.50,
            market_value=10500.00,
            unrealized_pnl=500.00,
            unrealized_pnl_percent=5.0,
        )

        request = DecisionRequest(
            account_info=account,
            stock_data=[stock],
            positions=[position],
        )

        prompt = TradingPrompts.create_decision_prompt(request)

        assert "当前持仓" in prompt
        assert "000001.SZ" in prompt

    def test_create_batch_decision_prompt(self):
        """Test creating batch decision prompt."""
        from ai_service.models.schemas import DecisionRequest

        account = AccountInfo(
            account_id="acc_123",
            user_id="user_456",
            total_balance=100000.00,
            available_cash=50000.00,
            total_market_value=50000.00,
            total_unrealized_pnl=0.00,
            total_unrealized_pnl_percent=0.00,
        )

        stocks = [
            StockData(symbol="000001.SZ", name="平安银行", current_price=10.50),
            StockData(symbol="000002.SZ", name="万科A", current_price=15.20),
        ]

        request = DecisionRequest(
            account_info=account,
            stock_data=stocks,
            positions=[],
        )

        prompt = TradingPrompts.create_decision_prompt(request)

        assert "平安银行" in prompt
        assert "万科A" in prompt
        assert "000001.SZ" in prompt
        assert "000002.SZ" in prompt

    def test_system_prompt_contains_required_fields(self):
        """Test that system prompt contains required fields."""
        system_prompt = BasePrompts.get_system_prompt()

        assert "action" in system_prompt
        assert "symbol" in system_prompt
        assert "reasoning" in system_prompt
        assert "confidence_score" in system_prompt
        assert "risk_level" in system_prompt


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
