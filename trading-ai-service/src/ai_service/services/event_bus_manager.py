"""
EventBus Manager for Trading AI Service.

Manages the connection to the event bus, handles subscriptions and publishing.
This is a singleton class to ensure only one connection is maintained.
"""

import sys
from pathlib import Path
from typing import Dict, Any, Callable, Optional
from loguru import logger

# Add event-bus SDK to path
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "infra" / "event-bus" / "src"))

from ..core.config import settings
from ..core.exceptions import ProviderError


class EventBusManager:
    """
    Singleton manager for event bus operations.

    Handles:
    - Connection management to Redis event bus
    - Event subscription and consumption
    - Event publishing
    - Health checks
    """

    _instance: Optional["EventBusManager"] = None
    _initialized: bool = False

    def __new__(cls) -> "EventBusManager":
        """Ensure singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize the manager (only runs once due to singleton)."""
        if not hasattr(self, '_client'):
            self._client = None
            self._consumer = None
            self._producer = None
            self._handlers: Dict[str, list] = {}

    async def initialize(self) -> None:
        """
        Initialize the event bus connection.

        Connects to Redis and sets up consumer and producer.
        """
        if self._initialized:
            logger.debug("EventBusManager already initialized")
            return

        try:
            # Import here to avoid issues during testing
            from event_bus import EventBusClient, EventConsumer, EventProducer

            # Create client connection
            self._client = EventBusClient(
                host=getattr(settings, 'REDIS_HOST', 'localhost'),
                port=getattr(settings, 'REDIS_PORT', 6379),
            )
            await self._client.connect()

            # Create consumer
            self._consumer = EventConsumer(
                client=self._client,
                service_name="trading-ai-service",
                consumer_group="ai-decision-group"
            )

            # Create producer
            self._producer = EventProducer(
                client=self._client,
                service_name="trading-ai-service"
            )

            self._initialized = True
            logger.info("✅ EventBusManager initialized successfully")

        except Exception as e:
            logger.error(f"❌ Failed to initialize EventBusManager: {e}")
            self._initialized = False
            raise

    async def subscribe(
        self,
        event_type: str,
        handler: Callable[[Any], None]
    ) -> None:
        """
        Subscribe to an event type.

        Args:
            event_type: The event type to subscribe to
            handler: Callback function to handle events
        """
        if not self._initialized:
            raise ProviderError(
                message="EventBusManager not initialized",
                error_code="EVENT_BUS_NOT_INITIALIZED"
            )

        try:
            from event_bus import EventType

            # Convert string to EventType if needed
            if isinstance(event_type, str):
                event_type = EventType(event_type)

            # Register handler
            if event_type.value not in self._handlers:
                self._handlers[event_type.value] = []
            self._handlers[event_type.value].append(handler)

            # Subscribe via consumer
            self._consumer.subscribe(event_type, handler)
            logger.info(f"📩 Subscribed to event: {event_type.value}")

        except Exception as e:
            logger.error(f"❌ Failed to subscribe to {event_type}: {e}")
            raise

    async def publish(
        self,
        event_type: str,
        payload: Dict[str, Any],
        correlation_id: Optional[str] = None
    ) -> None:
        """
        Publish an event.

        Args:
            event_type: The type of event to publish
            payload: The event payload data
            correlation_id: Optional correlation ID for tracing
        """
        if not self._initialized or not self._producer:
            raise ProviderError(
                message="EventBusManager not initialized",
                error_code="EVENT_BUS_NOT_INITIALIZED"
            )

        try:
            from event_bus import EventType, EventSchema

            # Convert string to EventType if needed
            if isinstance(event_type, str):
                event_type = EventType(event_type)

            # Create event schema
            event = EventSchema(
                event_type=event_type,
                source="trading-ai-service",
                payload=payload,
                correlation_id=correlation_id
            )

            # Publish via producer
            self._producer.publish_event(event)
            logger.debug(f"📤 Published event: {event_type.value}")

        except Exception as e:
            logger.error(f"❌ Failed to publish event {event_type}: {e}")
            raise

    async def close(self) -> None:
        """Close the event bus connection."""
        if not self._initialized:
            return

        try:
            # Stop consumer
            if self._consumer:
                self._consumer.stop()
                self._consumer = None

            # Disconnect client
            if self._client:
                await self._client.disconnect()
                self._client = None

            self._producer = None
            self._initialized = False
            logger.info("✅ EventBusManager closed")

        except Exception as e:
            logger.error(f"❌ Error closing EventBusManager: {e}")
            raise

    async def health_check(self) -> bool:
        """
        Check if the event bus connection is healthy.

        Returns:
            True if connected, False otherwise
        """
        if not self._initialized or not self._client:
            return False

        try:
            return self._client.is_connected
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False

    @property
    def is_initialized(self) -> bool:
        """Check if the manager is initialized."""
        return self._initialized

    @property
    def client(self):
        """Get the event bus client."""
        return self._client

    @property
    def producer(self):
        """Get the event producer."""
        return self._producer
