"""
AI Decision Event Publisher for Trading AI Service.

Publishes AI trading decisions to the event bus for consumption by Backend service.
"""

import sys
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime
from loguru import logger

# Add event-bus SDK to path
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))

from .event_bus_manager import EventBusManager
from ..models.schemas import DecisionResult
from ..core.exceptions import ProviderError


class DecisionEventPublisher:
    """
    Publisher for AI decision events.

    Publishes trading decisions to the event bus so Backend can
    receive and process them asynchronously.
    """

    def __init__(self):
        """Initialize the decision event publisher."""
        self._event_bus = EventBusManager()

    async def publish_decision(
        self,
        account_id: str,
        decision: DecisionResult,
        context: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Publish a single AI decision event.

        Args:
            account_id: The account ID that made the decision
            decision: The decision result to publish
            context: Optional additional context (market conditions, triggers, etc.)

        Returns:
            True if published successfully, False otherwise

        Raises:
            ProviderError: If EventBusManager is not initialized
        """
        if not self._event_bus.is_initialized:
            raise ProviderError(
                message="EventBusManager not initialized",
                error_code="EVENT_BUS_NOT_INITIALIZED"
            )

        try:
            from event_bus import EventType

            # Build payload
            payload = {
                "account_id": account_id,
                "decision_id": decision.decision_id,
                "action": decision.action.value,
                "symbol": decision.symbol,
                "reasoning": decision.reasoning,
                "confidence": decision.confidence_score,
                "risk_level": decision.risk_level.value,
                "ai_provider": decision.ai_provider.value,
                "model_name": decision.model_name,
                "cost_usd": decision.cost_usd,
                "timestamp": datetime.utcnow().isoformat(),
            }

            # Add optional fields if present
            if decision.quantity is not None:
                payload["quantity"] = decision.quantity
            if decision.price_target is not None:
                payload["price_target"] = decision.price_target
            if decision.stop_loss is not None:
                payload["stop_loss"] = decision.stop_loss
            if decision.take_profit is not None:
                payload["take_profit"] = decision.take_profit
            if decision.expected_return is not None:
                payload["expected_return"] = decision.expected_return
            if decision.time_horizon is not None:
                payload["time_horizon"] = decision.time_horizon

            # Add context if provided
            if context:
                payload["context"] = context

            # Publish event
            await self._event_bus.publish(
                event_type=EventType.AI_DECISION_MADE.value,
                payload=payload,
                correlation_id=decision.decision_id
            )

            logger.info(
                f"📤 Published AI decision: {decision.decision_id} "
                f"for account {account_id}: {decision.action.value} {decision.symbol}"
            )

            return True

        except Exception as e:
            logger.error(f"❌ Failed to publish decision event: {e}")
            return False

    async def publish_batch_decisions(
        self,
        account_id: str,
        decisions: List[DecisionResult],
        context: Optional[Dict[str, Any]] = None
    ) -> List[bool]:
        """
        Publish multiple AI decision events.

        Args:
            account_id: The account ID that made the decisions
            decisions: List of decision results to publish
            context: Optional additional context shared across all decisions

        Returns:
            List of boolean results for each publish operation
        """
        results = []

        for decision in decisions:
            try:
                result = await self.publish_decision(
                    account_id=account_id,
                    decision=decision,
                    context=context
                )
                results.append(result)
            except Exception as e:
                logger.error(f"❌ Failed to publish decision {decision.decision_id}: {e}")
                results.append(False)

        logger.info(f"📤 Published {sum(results)}/{len(decisions)} batch decisions")

        return results

    async def publish_decision_with_confirmation(
        self,
        account_id: str,
        decision: DecisionResult,
        context: Optional[Dict[str, Any]] = None,
        timeout_ms: int = 5000
    ) -> Dict[str, Any]:
        """
        Publish a decision and wait for confirmation.

        Note: This is a placeholder for future implementation with
        request-reply pattern via event bus.

        Args:
            account_id: The account ID
            decision: The decision to publish
            context: Optional context
            timeout_ms: Timeout in milliseconds (not used currently)

        Returns:
            Dictionary with publish status and metadata
        """
        published = await self.publish_decision(
            account_id=account_id,
            decision=decision,
            context=context
        )

        return {
            "published": published,
            "decision_id": decision.decision_id,
            "account_id": account_id,
            "timestamp": datetime.utcnow().isoformat(),
            "confirmation_status": "pending",  # Would be updated with reply
        }
