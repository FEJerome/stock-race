"""
Unit tests for data models.
"""

import pytest
from datetime import datetime
from pydantic import ValidationError

from ai_service.models.schemas import (
    StockData,
    Position,
    AccountInfo,
    DecisionRequest,
    DecisionResult,
    DecisionAction,
    RiskLevel,
    AIProvider,
)


class TestStockData:
    """Test StockData model."""

    def test_create_valid_stock_data(self):
        """Test creating valid stock data."""
        stock = StockData(
            symbol="AAPL",
            name="Apple Inc.",
            current_price=175.25,
            open_price=174.50,
            high_price=176.80,
            low_price=173.20,
            volume=50000000,
            change=0.75,
            change_percent=0.43,
            market_cap=2750000000000.00,
            pe_ratio=28.5,
            dividend_yield=0.0055,
        )

        assert stock.symbol == "AAPL"
        assert stock.name == "Apple Inc."
        assert stock.current_price == 175.25
        assert stock.change_percent == 0.43

    def test_stock_data_with_technical_indicators(self):
        """Test stock data with technical indicators."""
        stock = StockData(
            symbol="AAPL",
            current_price=175.25,
            ma_5=174.80,
            ma_20=172.50,
            ma_60=168.75,
            rsi=58.5,
            macd=0.25,
            bollinger_upper=178.20,
            bollinger_lower=170.80,
        )

        assert stock.ma_5 == 174.80
        assert stock.rsi == 58.5
        assert stock.bollinger_upper == 178.20

    def test_stock_data_minimal(self):
        """Test stock data with minimal required fields."""
        stock = StockData(
            symbol="AAPL",
            current_price=175.25,
        )

        assert stock.symbol == "AAPL"
        assert stock.current_price == 175.25
        assert stock.name is None
        assert stock.timestamp is not None

    def test_stock_data_invalid_price(self):
        """Test stock data with invalid price."""
        with pytest.raises(ValidationError):
            StockData(
                symbol="AAPL",
                current_price=-100.00,  # Negative price
            )


class TestPosition:
    """Test Position model."""

    def test_create_valid_position(self):
        """Test creating valid position."""
        position = Position(
            symbol="AAPL",
            quantity=100,
            avg_cost=170.50,
            current_price=175.25,
        )

        # Derived fields should be calculated
        assert position.market_value == 17525.00
        assert position.unrealized_pnl == 475.00
        assert round(position.unrealized_pnl_percent, 2) == 2.79

    def test_position_with_negative_pnl(self):
        """Test position with negative P&L."""
        position = Position(
            symbol="AAPL",
            quantity=100,
            avg_cost=180.00,
            current_price=175.25,
        )

        assert position.unrealized_pnl == -475.00
        assert position.unrealized_pnl_percent < 0

    def test_position_zero_quantity(self):
        """Test position with zero quantity."""
        position = Position(
            symbol="AAPL",
            quantity=0,
            avg_cost=170.50,
            current_price=175.25,
        )

        assert position.market_value == 0
        assert position.unrealized_pnl == 0
        assert position.unrealized_pnl_percent == 0

    def test_position_invalid_quantity(self):
        """Test position with invalid quantity."""
        with pytest.raises(ValidationError):
            Position(
                symbol="AAPL",
                quantity=-100,  # Negative quantity
                avg_cost=170.50,
                current_price=175.25,
            )


class TestAccountInfo:
    """Test AccountInfo model."""

    def test_create_valid_account_info(self):
        """Test creating valid account info."""
        account = AccountInfo(
            account_id="acc_123456",
            user_id="user_789",
            total_balance=50000.00,
            available_cash=32475.00,
            total_market_value=17525.00,
            total_unrealized_pnl=475.00,
            total_unrealized_pnl_percent=2.79,
            risk_tolerance="medium",
            trading_strategy="growth",
        )

        assert account.account_id == "acc_123456"
        assert account.user_id == "user_789"
        assert account.total_balance == 50000.00
        assert account.risk_tolerance == "medium"

    def test_account_info_minimal(self):
        """Test account info with minimal required fields."""
        account = AccountInfo(
            account_id="acc_123456",
            user_id="user_789",
            total_balance=50000.00,
            available_cash=32475.00,
            total_market_value=17525.00,
            total_unrealized_pnl=475.00,
            total_unrealized_pnl_percent=2.79,
        )

        assert account.account_id == "acc_123456"
        assert account.risk_tolerance is None
        assert account.trading_strategy is None

    def test_account_info_invalid_balance(self):
        """Test account info with invalid balance."""
        with pytest.raises(ValidationError):
            AccountInfo(
                account_id="acc_123456",
                user_id="user_789",
                total_balance=-50000.00,  # Negative balance
                available_cash=32475.00,
                total_market_value=17525.00,
                total_unrealized_pnl=475.00,
                total_unrealized_pnl_percent=2.79,
            )


class TestDecisionRequest:
    """Test DecisionRequest model."""

    def test_create_valid_decision_request(
        self,
        sample_account_info,
        sample_position,
        sample_stock_data,
    ):
        """Test creating valid decision request."""
        request = DecisionRequest(
            account_info=AccountInfo(**sample_account_info),
            positions=[Position(**sample_position)],
            stock_data=[StockData(**sample_stock_data)],
            ai_provider=AIProvider.OPENAI,
        )

        assert request.account_info.account_id == "acc_123456"
        assert len(request.positions) == 1
        assert len(request.stock_data) == 1
        assert request.ai_provider == AIProvider.OPENAI
        assert request.temperature is None  # Default
        assert request.include_technical_analysis is True  # Default

    def test_decision_request_with_custom_prompt(self):
        """Test decision request with custom prompt."""
        request = DecisionRequest(
            account_info=AccountInfo(
                account_id="acc_123456",
                user_id="user_789",
                total_balance=50000.00,
                available_cash=32475.00,
                total_market_value=17525.00,
                total_unrealized_pnl=475.00,
                total_unrealized_pnl_percent=2.79,
            ),
            stock_data=[StockData(symbol="AAPL", current_price=175.25)],
            ai_provider=AIProvider.DEEPSEEK,
            custom_prompt="Focus on technical analysis only",
            include_fundamental_analysis=False,
        )

        assert request.ai_provider == AIProvider.DEEPSEEK
        assert request.custom_prompt == "Focus on technical analysis only"
        assert request.include_fundamental_analysis is False

    def test_decision_request_empty_positions(self):
        """Test decision request with empty positions."""
        request = DecisionRequest(
            account_info=AccountInfo(
                account_id="acc_123456",
                user_id="user_789",
                total_balance=50000.00,
                available_cash=50000.00,
                total_market_value=0.00,
                total_unrealized_pnl=0.00,
                total_unrealized_pnl_percent=0.00,
            ),
            positions=[],
            stock_data=[StockData(symbol="AAPL", current_price=175.25)],
            ai_provider=AIProvider.OPENAI,
        )

        assert len(request.positions) == 0
        assert request.account_info.total_market_value == 0.00

    def test_decision_request_missing_stock_data(self):
        """Test decision request with missing stock data."""
        with pytest.raises(ValidationError):
            DecisionRequest(
                account_info=AccountInfo(
                    account_id="acc_123456",
                    user_id="user_789",
                    total_balance=50000.00,
                    available_cash=32475.00,
                    total_market_value=17525.00,
                    total_unrealized_pnl=475.00,
                    total_unrealized_pnl_percent=2.79,
                ),
                stock_data=[],  # Empty stock data
                ai_provider=AIProvider.OPENAI,
            )


class TestDecisionResult:
    """Test DecisionResult model."""

    def test_create_valid_decision_result(self):
        """Test creating valid decision result."""
        result = DecisionResult(
            decision_id="dec_123456",
            action=DecisionAction.BUY,
            symbol="AAPL",
            reasoning="Strong technical indicators and fundamentals",
            confidence_score=0.75,
            risk_level=RiskLevel.MEDIUM,
            ai_provider=AIProvider.OPENAI,
            model_name="gpt-3.5-turbo",
        )

        assert result.decision_id == "dec_123456"
        assert result.action == DecisionAction.BUY
        assert result.symbol == "AAPL"
        assert result.confidence_score == 0.75
        assert result.risk_level == RiskLevel.MEDIUM
        assert result.timestamp is not None

    def test_decision_result_with_optional_fields(self):
        """Test decision result with optional fields."""
        result = DecisionResult(
            decision_id="dec_123456",
            action=DecisionAction.BUY,
            symbol="AAPL",
            quantity=50,
            price_target=185.00,
            stop_loss=168.00,
            reasoning="Analysis complete",
            technical_analysis="Price above moving averages",
            fundamental_analysis="Strong financials",
            risk_assessment="Medium risk",
            confidence_score=0.75,
            risk_level=RiskLevel.MEDIUM,
            expected_return=5.6,
            time_horizon="1-3 months",
            ai_provider=AIProvider.OPENAI,
            model_name="gpt-3.5-turbo",
            processing_time_ms=1250,
            cost_usd=0.0025,
        )

        assert result.quantity == 50
        assert result.price_target == 185.00
        assert result.stop_loss == 168.00
        assert result.expected_return == 5.6
        assert result.processing_time_ms == 1250
        assert result.cost_usd == 0.0025

    def test_decision_result_invalid_confidence(self):
        """Test decision result with invalid confidence score."""
        with pytest.raises(ValidationError):
            DecisionResult(
                decision_id="dec_123456",
                action=DecisionAction.BUY,
                symbol="AAPL",
                reasoning="Test",
                confidence_score=1.5,  # > 1.0
                risk_level=RiskLevel.MEDIUM,
                ai_provider=AIProvider.OPENAI,
                model_name="gpt-3.5-turbo",
            )

    def test_decision_result_negative_confidence(self):
        """Test decision result with negative confidence score."""
        with pytest.raises(ValidationError):
            DecisionResult(
                decision_id="dec_123456",
                action=DecisionAction.BUY,
                symbol="AAPL",
                reasoning="Test",
                confidence_score=-0.5,  # < 0.0
                risk_level=RiskLevel.MEDIUM,
                ai_provider=AIProvider.OPENAI,
                model_name="gpt-3.5-turbo",
            )