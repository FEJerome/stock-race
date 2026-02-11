"""Unit tests for AI decision event publisher."""
import pytest
import sys
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from ai_service.services.decision_event_publisher import DecisionEventPublisher
from ai_service.services.event_bus_manager import EventBusManager
from ai_service.models.schemas import DecisionResult, DecisionAction, RiskLevel, AIProvider
from ai_service.core.exceptions import ProviderError


@pytest.fixture
def sample_decision_result():
    """Create a sample decision result."""
    return DecisionResult(
        decision_id="dec_123456",
        action=DecisionAction.BUY,
        symbol="000001.SZ",
        reasoning="技术指标突破，买入信号强烈",
        confidence_score=0.85,
        risk_level=RiskLevel.MEDIUM,
        ai_provider=AIProvider.OPENAI,
        model_name="gpt-4",
        cost_usd=0.002,
        quantity=100,
        price_target=15.5,
        stop_loss=14.0,
    )


class TestDecisionEventPublisher:
    """Test suite for DecisionEventPublisher."""

    def setup_method(self):
        """Reset singleton before each test."""
        EventBusManager._instance = None
        EventBusManager._initialized = False
        self.publisher = DecisionEventPublisher()

    def test_init(self):
        """Test publisher initialization."""
        assert self.publisher is not None
        assert self.publisher._event_bus is not None

    @pytest.mark.asyncio
    async def test_publish_decision_not_initialized(self, sample_decision_result):
        """Test publishing when event bus not initialized."""
        with pytest.raises(ProviderError, match="EventBusManager not initialized"):
            await self.publisher.publish_decision(
                account_id="acc_123",
                decision=sample_decision_result
            )

    @pytest.mark.asyncio
    @patch("ai_service.services.decision_event_publisher.EventBusManager")
    async def test_publish_decision_success(self, mock_manager_class, sample_decision_result):
        """Test successful decision publishing."""
        mock_manager = Mock()
        mock_manager.is_initialized = True
        mock_manager.publish = AsyncMock()
        mock_manager_class.return_value = mock_manager

        # Mock EventType
        with patch.dict('sys.modules', {'event_bus': Mock()}):
            import sys
            mock_event_bus = Mock()
            mock_event_bus.EventType.AI_DECISION_MADE = Mock()
            mock_event_bus.EventType.AI_DECISION_MADE.value = "ai:decision:made"
            sys.modules['event_bus'] = mock_event_bus

            publisher = DecisionEventPublisher()
            await publisher.publish_decision(
                account_id="acc_123",
                decision=sample_decision_result
            )

        mock_manager.publish.assert_called_once()
        call_args = mock_manager.publish.call_args
        # call_args is a tuple of (args, kwargs)
        assert call_args[0][0] == "ai:decision:made"  # First positional arg
        assert call_args[1]["correlation_id"] == "dec_123456"  # Keyword arg

    @pytest.mark.asyncio
    @patch("ai_service.services.decision_event_publisher.EventBusManager")
    async def test_publish_decision_payload_structure(self, mock_manager_class, sample_decision_result):
        """Test that published decision has correct payload structure."""
        mock_manager = Mock()
        mock_manager.is_initialized = True
        mock_manager.publish = AsyncMock()
        mock_manager_class.return_value = mock_manager

        # Mock EventType
        with patch.dict('sys.modules', {'event_bus': Mock()}):
            import sys
            mock_event_bus = Mock()
            mock_event_bus.EventType.AI_DECISION_MADE = Mock()
            mock_event_bus.EventType.AI_DECISION_MADE.value = "ai:decision:made"
            sys.modules['event_bus'] = mock_event_bus

            publisher = DecisionEventPublisher()
            await publisher.publish_decision(
                account_id="acc_123",
                decision=sample_decision_result
            )

        # Verify payload structure
        call_args = mock_manager.publish.call_args
        payload = call_args[1]["payload"]

        assert payload["account_id"] == "acc_123"
        assert payload["decision_id"] == "dec_123456"
        assert payload["action"] == "buy"
        assert payload["symbol"] == "000001.SZ"
        assert payload["reasoning"] == "技术指标突破，买入信号强烈"
        assert payload["confidence"] == 0.85
        assert payload["risk_level"] == "medium"
        assert payload["ai_provider"] == "openai"
        assert payload["model_name"] == "gpt-4"
        assert payload["cost_usd"] == 0.002
        assert payload["quantity"] == 100
        assert payload["price_target"] == 15.5
        assert payload["stop_loss"] == 14.0
        assert "timestamp" in payload

    @pytest.mark.asyncio
    @patch("ai_service.services.decision_event_publisher.EventBusManager")
    async def test_publish_decision_minimal(self, mock_manager_class):
        """Test publishing decision with minimal fields."""
        mock_manager = Mock()
        mock_manager.is_initialized = True
        mock_manager.publish = AsyncMock()
        mock_manager_class.return_value = mock_manager

        minimal_decision = DecisionResult(
            decision_id="dec_minimal",
            action=DecisionAction.HOLD,
            symbol="000002.SZ",
            reasoning="观望",
            confidence_score=0.5,
            risk_level=RiskLevel.LOW,
            ai_provider=AIProvider.DEEPSEEK,
            model_name="deepseek-chat",
        )

        # Mock EventType
        with patch.dict('sys.modules', {'event_bus': Mock()}):
            import sys
            mock_event_bus = Mock()
            mock_event_bus.EventType.AI_DECISION_MADE = Mock()
            mock_event_bus.EventType.AI_DECISION_MADE.value = "ai:decision:made"
            sys.modules['event_bus'] = mock_event_bus

            publisher = DecisionEventPublisher()
            await publisher.publish_decision(
                account_id="acc_456",
                decision=minimal_decision
            )

        call_args = mock_manager.publish.call_args
        payload = call_args[1]["payload"]

        assert payload["account_id"] == "acc_456"
        assert payload["decision_id"] == "dec_minimal"
        assert payload["action"] == "hold"
        assert payload["symbol"] == "000002.SZ"
        assert payload["quantity"] is None
        assert payload["price_target"] is None

    @pytest.mark.asyncio
    @patch("ai_service.services.decision_event_publisher.EventBusManager")
    async def test_publish_decision_sell_action(self, mock_manager_class):
        """Test publishing sell decision."""
        mock_manager = Mock()
        mock_manager.is_initialized = True
        mock_manager.publish = AsyncMock()
        mock_manager_class.return_value = mock_manager

        sell_decision = DecisionResult(
            decision_id="dec_sell",
            action=DecisionAction.SELL,
            symbol="000003.SZ",
            reasoning="止盈离场",
            confidence_score=0.75,
            risk_level=RiskLevel.HIGH,
            ai_provider=AIProvider.MOONSHOT,
            model_name="moonshot-v1-8k",
            quantity=50,
            take_profit=20.0,
        )

        # Mock EventType
        with patch.dict('sys.modules', {'event_bus': Mock()}):
            import sys
            mock_event_bus = Mock()
            mock_event_bus.EventType.AI_DECISION_MADE = Mock()
            mock_event_bus.EventType.AI_DECISION_MADE.value = "ai:decision:made"
            sys.modules['event_bus'] = mock_event_bus

            publisher = DecisionEventPublisher()
            await publisher.publish_decision(
                account_id="acc_789",
                decision=sell_decision
            )

        call_args = mock_manager.publish.call_args
        payload = call_args[1]["payload"]

        assert payload["action"] == "sell"
        assert payload["take_profit"] == 20.0

    @pytest.mark.asyncio
    @patch("ai_service.services.decision_event_publisher.EventBusManager")
    async def test_publish_batch_decisions(self, mock_manager_class):
        """Test publishing multiple decisions."""
        mock_manager = Mock()
        mock_manager.is_initialized = True
        mock_manager.publish = AsyncMock()
        mock_manager_class.return_value = mock_manager

        decisions = [
            DecisionResult(
                decision_id=f"dec_{i}",
                action=DecisionAction.BUY if i % 2 == 0 else DecisionAction.SELL,
                symbol=f"00000{i}.SZ",
                reasoning=f"Decision {i}",
                confidence_score=0.7 + i * 0.05,
                risk_level=RiskLevel.MEDIUM,
                ai_provider=AIProvider.OPENAI,
            )
            for i in range(3)
        ]

        # Mock EventType
        with patch.dict('sys.modules', {'event_bus': Mock()}):
            import sys
            mock_event_bus = Mock()
            mock_event_bus.EventType.AI_DECISION_MADE = Mock()
            mock_event_bus.EventType.AI_DECISION_MADE.value = "ai:decision:made"
            sys.modules['event_bus'] = mock_event_bus

            publisher = DecisionEventPublisher()
            results = await publisher.publish_batch_decisions(
                account_id="acc_batch",
                decisions=decisions
            )

        assert len(results) == 3
        assert mock_manager.publish.call_count == 3

    @pytest.mark.asyncio
    @patch("ai_service.services.decision_event_publisher.EventBusManager")
    async def test_publish_decision_with_context(self, mock_manager_class, sample_decision_result):
        """Test publishing decision with additional context."""
        mock_manager = Mock()
        mock_manager.is_initialized = True
        mock_manager.publish = AsyncMock()
        mock_manager_class.return_value = mock_manager

        # Mock EventType
        with patch.dict('sys.modules', {'event_bus': Mock()}):
            import sys
            mock_event_bus = Mock()
            mock_event_bus.EventType.AI_DECISION_MADE = Mock()
            mock_event_bus.EventType.AI_DECISION_MADE.value = "ai:decision:made"
            sys.modules['event_bus'] = mock_event_bus

            publisher = DecisionEventPublisher()
            context = {
                "market_condition": "bullish",
                "portfolio_allocation": 0.25,
                "trigger_event": "price_breakout"
            }

            await publisher.publish_decision(
                account_id="acc_123",
                decision=sample_decision_result,
                context=context
            )

        call_args = mock_manager.publish.call_args
        payload = call_args[0][1]

        assert payload["context"] == context
