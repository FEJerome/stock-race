"""
Database connection management for AI Service.
"""

from typing import Optional, Any
import asyncpg
from loguru import logger

from .config import settings


class Database:
    """Database connection manager."""

    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self.is_connected = False

    async def connect(self) -> None:
        """Connect to PostgreSQL database."""
        try:
            self.pool = await asyncpg.create_pool(
                host=settings.DB_HOST,
                port=settings.DB_PORT,
                database=settings.DB_NAME,
                user=settings.DB_USER,
                password=settings.DB_PASSWORD,
                min_size=5,
                max_size=20,
                command_timeout=60,
            )
            self.is_connected = True
            logger.info(
                f"Connected to PostgreSQL at {settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
            )
        except Exception as e:
            logger.error(f"Failed to connect to PostgreSQL: {e}")
            self.is_connected = False

    async def disconnect(self) -> None:
        """Disconnect from PostgreSQL."""
        if self.pool:
            await self.pool.close()
            self.is_connected = False
            logger.info("Disconnected from PostgreSQL")

    async def execute(self, query: str, *args) -> str:
        """Execute a query."""
        if not self.is_connected or not self.pool:
            raise ConnectionError("Database not connected")

        async with self.pool.acquire() as connection:
            return await connection.execute(query, *args)

    async def fetch(self, query: str, *args) -> list:
        """Fetch rows from a query."""
        if not self.is_connected or not self.pool:
            raise ConnectionError("Database not connected")

        async with self.pool.acquire() as connection:
            return await connection.fetch(query, *args)

    async def fetchrow(self, query: str, *args) -> Optional[dict]:
        """Fetch a single row from a query."""
        if not self.is_connected or not self.pool:
            raise ConnectionError("Database not connected")

        async with self.pool.acquire() as connection:
            return await connection.fetchrow(query, *args)

    async def fetchval(self, query: str, *args) -> Optional[Any]:
        """Fetch a single value from a query."""
        if not self.is_connected or not self.pool:
            raise ConnectionError("Database not connected")

        async with self.pool.acquire() as connection:
            return await connection.fetchval(query, *args)


# Global database instance
database = Database()


async def init_db() -> None:
    """Initialize database connection."""
    await database.connect()

    # Create tables if they don't exist
    await create_tables()


async def create_tables() -> None:
    """Create necessary database tables."""
    try:
        # Decision logs table
        await database.execute("""
            CREATE TABLE IF NOT EXISTS decision_logs (
                id SERIAL PRIMARY KEY,
                decision_id VARCHAR(255) UNIQUE NOT NULL,
                account_id VARCHAR(255) NOT NULL,
                user_id VARCHAR(255) NOT NULL,

                -- Decision details
                action VARCHAR(50) NOT NULL,
                symbol VARCHAR(50) NOT NULL,
                quantity INTEGER,
                price_target DECIMAL(15, 4),
                stop_loss DECIMAL(15, 4),
                take_profit DECIMAL(15, 4),

                -- Analysis
                reasoning TEXT NOT NULL,
                technical_analysis TEXT,
                fundamental_analysis TEXT,
                risk_assessment TEXT,

                -- Metrics
                confidence_score DECIMAL(5, 4) NOT NULL,
                risk_level VARCHAR(50) NOT NULL,
                expected_return DECIMAL(10, 4),
                time_horizon VARCHAR(50),

                -- Metadata
                ai_provider VARCHAR(50) NOT NULL,
                model_name VARCHAR(100) NOT NULL,
                processing_time_ms INTEGER,
                cost_usd DECIMAL(10, 4),

                -- Raw data
                request_data JSONB,
                response_data JSONB,

                -- Timestamps
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create indexes
        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_decision_logs_account_id
            ON decision_logs(account_id)
        """)

        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_decision_logs_user_id
            ON decision_logs(user_id)
        """)

        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_decision_logs_symbol
            ON decision_logs(symbol)
        """)

        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_decision_logs_created_at
            ON decision_logs(created_at DESC)
        """)

        # API usage logs table
        await database.execute("""
            CREATE TABLE IF NOT EXISTS api_usage_logs (
                id SERIAL PRIMARY KEY,
                provider VARCHAR(50) NOT NULL,
                model_name VARCHAR(100) NOT NULL,
                endpoint VARCHAR(255),

                -- Request details
                request_tokens INTEGER,
                response_tokens INTEGER,
                total_tokens INTEGER,

                -- Cost and performance
                cost_usd DECIMAL(10, 4),
                processing_time_ms INTEGER NOT NULL,
                success BOOLEAN NOT NULL,

                -- Error details
                error_type VARCHAR(100),
                error_message TEXT,

                -- Metadata
                request_id VARCHAR(255),
                account_id VARCHAR(255),

                -- Timestamps
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create indexes for API usage logs
        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_api_usage_logs_provider
            ON api_usage_logs(provider)
        """)

        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at
            ON api_usage_logs(created_at DESC)
        """)

        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Failed to create database tables: {e}")
        raise