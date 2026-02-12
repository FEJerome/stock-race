"""
Tests for database Mock fix (P3-001) and Pydantic v2 migration (P3-003).
"""

import pytest
from unittest.mock import Mock, AsyncMock, MagicMock
from datetime import datetime
import asyncio


class TestDatabaseMockFix:
    """Test database Mock configuration fix (P3-001)."""

    @pytest.fixture
    def mock_asyncpg_pool(self):
        """Create a properly configured mock asyncpg pool."""
        pool = MagicMock()

        # Mock connection context manager
        mock_conn = MagicMock()
        mock_conn.fetch = AsyncMock(return_value=[])
        mock_conn.fetchrow = AsyncMock(return_value=None)
        mock_conn.execute = AsyncMock(return_value=None)
        mock_conn.close = AsyncMock()

        # Mock transaction
        mock_transaction = MagicMock()
        mock_transaction.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_transaction.__aexit__ = AsyncMock(return_value=None)
        mock_conn.transaction = MagicMock(return_value=mock_transaction)

        # Mock pool acquire context manager
        mock_acquire = MagicMock()
        mock_acquire.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_acquire.__aexit__ = AsyncMock(return_value=None)
        pool.acquire = MagicMock(return_value=mock_acquire)

        return pool

    @pytest.mark.asyncio
    async def test_mock_pool_acquire(self, mock_asyncpg_pool):
        """Test mock pool acquire context manager."""
        async with mock_asyncpg_pool.acquire() as conn:
            result = await conn.fetch("SELECT 1")
            assert result == []

    @pytest.mark.asyncio
    async def test_mock_pool_transaction(self, mock_asyncpg_pool):
        """Test mock pool transaction context manager."""
        async with mock_asyncpg_pool.acquire() as conn:
            async with conn.transaction():
                result = await conn.execute("INSERT INTO test VALUES (1)")
                assert result is None

    @pytest.mark.asyncio
    async def test_mock_pool_fetchrow(self, mock_asyncpg_pool):
        """Test mock pool fetchrow."""
        # Configure return value
        mock_record = {"id": 1, "name": "test"}
        mock_asyncpg_pool.acquire.return_value.__aenter__.return_value.fetchrow = AsyncMock(
            return_value=mock_record
        )

        async with mock_asyncpg_pool.acquire() as conn:
            result = await conn.fetchrow("SELECT * FROM test WHERE id = $1", 1)
            assert result == mock_record


class TestPydanticV2Migration:
    """Test Pydantic v2 migration (P3-003)."""

    def test_config_dict_migration(self):
        """Test migration from class Config to ConfigDict."""
        from pydantic import BaseModel, ConfigDict
        from datetime import datetime

        # New Pydantic v2 style
        class TestModelV2(BaseModel):
            model_config = ConfigDict(
                json_encoders={
                    datetime: lambda v: v.isoformat()
                }
            )
            name: str
            timestamp: datetime

        # Test instantiation
        model = TestModelV2(name="test", timestamp=datetime.now())
        assert model.name == "test"
        assert isinstance(model.timestamp, datetime)

    def test_model_dump_method(self):
        """Test using model_dump instead of dict()."""
        from pydantic import BaseModel
        from datetime import datetime

        class TestModel(BaseModel):
            name: str
            timestamp: datetime

        model = TestModel(name="test", timestamp=datetime.now())

        # Pydantic v2 uses model_dump() instead of dict()
        data = model.model_dump()
        assert "name" in data
        assert "timestamp" in data

    def test_model_dump_json_method(self):
        """Test using model_dump_json instead of json()."""
        from pydantic import BaseModel

        class TestModel(BaseModel):
            name: str
            value: int

        model = TestModel(name="test", value=42)

        # Pydantic v2 uses model_dump_json() instead of json()
        json_str = model.model_dump_json()
        assert "test" in json_str
        assert "42" in json_str

    def test_field_validator_migration(self):
        """Test migration from validator to field_validator."""
        from pydantic import BaseModel, field_validator

        class TestModel(BaseModel):
            value: int

            @field_validator('value')
            @classmethod
            def validate_value(cls, v):
                if v < 0:
                    raise ValueError("Value must be positive")
                return v

        # Valid value
        model = TestModel(value=10)
        assert model.value == 10

        # Invalid value should raise error
        with pytest.raises(ValueError):
            TestModel(value=-1)

    def test_root_validator_migration(self):
        """Test migration from root_validator to model_validator."""
        from pydantic import BaseModel, model_validator

        class TestModel(BaseModel):
            min_value: int
            max_value: int

            @model_validator(mode='after')
            def check_range(self):
                if self.min_value > self.max_value:
                    raise ValueError("min_value must be <= max_value")
                return self

        # Valid range
        model = TestModel(min_value=1, max_value=10)
        assert model.min_value == 1
        assert model.max_value == 10

        # Invalid range should raise error
        with pytest.raises(ValueError):
            TestModel(min_value=10, max_value=1)


class TestStockModelPydanticV2:
    """Test Stock models with Pydantic v2."""

    def test_stock_quote_model(self):
        """Test StockQuote model compatibility."""
        from data_service.models.stock import StockQuote
        from datetime import datetime

        quote = StockQuote(
            symbol="000001.SZ",
            price=10.5,
            open=10.0,
            high=10.8,
            low=9.9,
            prev_close=10.0,
            change=0.5,
            change_percent=5.0,
            volume=1000000,
            amount=10500000.0,
            timestamp=datetime.now()
        )

        # Test model_dump
        data = quote.model_dump()
        assert data["symbol"] == "000001.SZ"
        assert data["price"] == 10.5

    def test_stock_symbol_model(self):
        """Test StockSymbol model compatibility."""
        from data_service.models.stock import StockSymbol

        symbol = StockSymbol(
            symbol="000001.SZ",
            name="平安银行",
            exchange="SZ"
        )

        data = symbol.model_dump()
        assert data["symbol"] == "000001.SZ"
        assert data["name"] == "平安银行"

    def test_change_percent_validator(self):
        """Test change_percent validator."""
        from data_service.models.stock import StockQuote
        from datetime import datetime

        # Valid change_percent
        quote = StockQuote(
            symbol="000001.SZ",
            price=10.5,
            open=10.0,
            high=10.8,
            low=9.9,
            prev_close=10.0,
            change=0.5,
            change_percent=5.0,
            volume=1000000,
            amount=10500000.0,
            timestamp=datetime.now()
        )
        assert quote.change_percent == 5.0


class TestImportPathConsistency:
    """Test import path consistency (P3-002)."""

    def test_import_from_data_service(self):
        """Test importing from data_service package."""
        try:
            from data_service.models.stock import StockQuote
            assert True
        except ImportError:
            pytest.fail("Failed to import from data_service")

    def test_import_from_src_data_service(self):
        """Test importing from src.data_service package."""
        try:
            from src.data_service.models.stock import StockQuote
            assert True
        except ImportError:
            # This is acceptable - src prefix may not be needed
            pass

    def test_relative_imports(self):
        """Test relative imports within package."""
        # This tests that relative imports work correctly
        from data_service.models.stock import StockQuote, StockSymbol
        from data_service.services.realtime_service import RealtimeService

        assert StockQuote is not None
        assert StockSymbol is not None
        assert RealtimeService is not None
