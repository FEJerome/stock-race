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


async def _add_missing_columns() -> None:
    """Add missing columns to existing decision_logs table for AI service compatibility."""
    try:
        # For now, just log that we're using existing table structure
        logger.info("Using existing decision_logs table structure. AI service will adapt to existing columns.")

        # We could add compatibility columns here if needed, but for now
        # we'll assume the AI service doesn't need to write to this table
        pass
    except Exception as e:
        logger.error(f"Failed to add missing columns: {e}")
        raise


async def create_tables() -> None:
    """Create necessary database tables for AI service."""
    try:
        logger.info("Checking database tables for AI service...")

        # For now, AI service doesn't need to create its own tables
        # It uses existing tables or logs to files/Redis
        # We'll just ensure the database connection works

        # Check if we can connect and query
        test_result = await database.fetchval("SELECT 1")
        if test_result == 1:
            logger.info("Database connection test successful")
        else:
            logger.warning("Database connection test returned unexpected result")

        logger.info("Database setup completed (no tables created for AI service)")

    except Exception as e:
        logger.warning(f"Database table creation skipped or failed: {e}")
        # Don't raise error, AI service can work without database tables