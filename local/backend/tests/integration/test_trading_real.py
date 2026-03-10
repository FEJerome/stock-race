"""
Real Trading Service Integration Tests

Tests trading operations with real market data and real database.
Uses actual SQLite database and real market data sources.
"""
import pytest
import pytest_asyncio
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select, delete

from models.database import Base, AgentModel, TradeModel, PositionModel
from services.trading_service import TradingService, TradingServiceAsync
from models.schemas import TradeCreate, TradeResponse


# Test database URL - file based for persistence testing
TEST_DATABASE_URL = "sqlite+aiosqlite:///./test_trading.db"


@pytest_asyncio.fixture(scope="module")
async def test_engine():
    """Create test database engine"""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        future=True
    )

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Cleanup - drop tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncSession:
    """Create a fresh database session for each test with cleanup"""
    async_session = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False
    )

    async with async_session() as session:
        yield session
        # Clean up all tables after each test
        await session.execute(delete(TradeModel))
        await session.execute(delete(PositionModel))
        await session.execute(delete(AgentModel))
        await session.commit()


@pytest_asyncio.fixture
async def test_agent(db_session: AsyncSession) -> AgentModel:
    """Create a test agent with sufficient capital"""
    agent = AgentModel(
        id=f"test-agent-{uuid.uuid4().hex[:8]}",
        name="Test Trader",
        initial_capital=1000000.0,  # 1M initial
        current_capital=1000000.0,
        strategy={
            "risk_tolerance": "稳健",
            "sectors": ["金融", "科技"],
            "holding_period": "中线",
            "position_limit": "单股不超过30%",
            "stop_loss": "8%止损"
        },
        model_provider="kimi",
        model_name="kimi-k2-5",
        agent_level="intern",
        incentive_level="standard",
        status="active",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db_session.add(agent)
    await db_session.commit()
    return agent


@pytest_asyncio.fixture
async def trading_service() -> TradingService:
    """Create trading service instance"""
    return TradingService()


@pytest.mark.asyncio
class TestTradingServiceBuy:
    """Tests for buy operations with real market data"""

    async def test_execute_buy_success(self, db_session, test_agent, trading_service):
        """Test successful buy execution with real market price"""
        symbol = "000001.SZ"  # 平安银行
        quantity = 100

        success, message, trade = await trading_service.execute_buy(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=quantity
        )

        print(f"\n[Buy Test] {message}")

        assert success, f"Buy failed: {message}"
        assert trade is not None
        assert trade.symbol == symbol
        assert trade.action == "buy"
        assert trade.quantity == quantity
        assert trade.price > 0, "Price should be fetched from real market"
        assert trade.total_amount > 0
        assert trade.agent_id == test_agent.id

        # Verify trade was saved to database
        result = await db_session.execute(
            select(TradeModel).where(TradeModel.id == trade.id)
        )
        saved_trade = result.scalar_one_or_none()
        assert saved_trade is not None
        assert saved_trade.symbol == symbol

    async def test_execute_buy_creates_position(self, db_session, test_agent, trading_service):
        """Test that buy creates a position record"""
        symbol = "000001.SZ"
        quantity = 200

        success, message, trade = await trading_service.execute_buy(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=quantity
        )

        assert success, f"Buy failed: {message}"

        # Verify position was created
        result = await db_session.execute(
            select(PositionModel).where(
                PositionModel.agent_id == test_agent.id,
                PositionModel.symbol == symbol
            )
        )
        position = result.scalar_one_or_none()

        assert position is not None, "Position should be created after buy"
        assert position.quantity == quantity
        assert position.avg_cost > 0
        assert position.symbol == symbol

        print(f"\n[Position Created] {symbol}: {position.quantity} shares @ ¥{position.avg_cost:.2f}")

    async def test_execute_buy_updates_capital(self, db_session, test_agent, trading_service):
        """Test that buy reduces available capital"""
        symbol = "000001.SZ"
        quantity = 100

        initial_capital = test_agent.current_capital

        success, message, trade = await trading_service.execute_buy(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=quantity
        )

        assert success

        # Refresh agent from database
        result = await db_session.execute(
            select(AgentModel).where(AgentModel.id == test_agent.id)
        )
        updated_agent = result.scalar_one()

        expected_cost = trade.price * quantity
        expected_remaining = initial_capital - expected_cost

        print(f"\n[Capital Update] Initial: ¥{initial_capital:.2f}")
        print(f"                 Cost: ¥{expected_cost:.2f}")
        print(f"                 Remaining: ¥{updated_agent.current_capital:.2f}")

        assert updated_agent.current_capital < initial_capital
        assert abs(updated_agent.current_capital - expected_remaining) < 0.01

    async def test_execute_buy_insufficient_funds(self, db_session, test_agent, trading_service):
        """Test buy fails when funds are insufficient"""
        # Set very low capital
        test_agent.current_capital = 100.0  # Only 100 yuan
        await db_session.commit()

        symbol = "000001.SZ"
        quantity = 100  # Need at least 1000+ yuan

        success, message, trade = await trading_service.execute_buy(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=quantity
        )

        print(f"\n[Insufficient Funds] {message}")

        assert not success
        assert "资金不足" in message or "insufficient" in message.lower()
        assert trade is None

    async def test_execute_buy_invalid_agent(self, db_session, trading_service):
        """Test buy fails with invalid agent ID"""
        success, message, trade = await trading_service.execute_buy(
            db=db_session,
            agent_id="non-existent-agent",
            symbol="000001.SZ",
            quantity=100
        )

        assert not success
        assert "不存在" in message or "not found" in message.lower()
        assert trade is None

    async def test_execute_buy_invalid_symbol(self, db_session, test_agent, trading_service):
        """Test buy fails with invalid stock symbol"""
        success, message, trade = await trading_service.execute_buy(
            db=db_session,
            agent_id=test_agent.id,
            symbol="INVALID999.XX",
            quantity=100
        )

        print(f"\n[Invalid Symbol] {message}")

        assert not success
        assert trade is None


@pytest.mark.asyncio
class TestTradingServiceSell:
    """Tests for sell operations with real market data"""

    async def test_execute_sell_success(self, db_session, test_agent, trading_service):
        """Test successful sell execution"""
        symbol = "000001.SZ"
        buy_quantity = 100

        # First buy some shares
        success, _, trade = await trading_service.execute_buy(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=buy_quantity
        )
        assert success, "Buy setup failed"

        # Then sell
        sell_quantity = 50
        success, message, sell_trade = await trading_service.execute_sell(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=sell_quantity
        )

        print(f"\n[Sell Test] {message}")

        assert success, f"Sell failed: {message}"
        assert sell_trade is not None
        assert sell_trade.symbol == symbol
        assert sell_trade.action == "sell"
        assert sell_trade.quantity == sell_quantity
        assert sell_trade.price > 0
        assert sell_trade.realized_pnl is not None

    async def test_execute_sell_no_position(self, db_session, test_agent, trading_service):
        """Test sell fails when no position exists"""
        symbol = "000001.SZ"

        success, message, trade = await trading_service.execute_sell(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=100
        )

        print(f"\n[No Position] {message}")

        assert not success
        assert "没有" in message or "no" in message.lower() or "持仓" in message
        assert trade is None

    async def test_execute_sell_insufficient_position(self, db_session, test_agent, trading_service):
        """Test sell fails when trying to sell more than owned"""
        symbol = "000001.SZ"

        # Buy 100 shares
        await trading_service.execute_buy(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=100
        )

        # Try to sell 200 shares
        success, message, trade = await trading_service.execute_sell(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=200
        )

        print(f"\n[Insufficient Position] {message}")

        assert not success
        assert "不足" in message or "insufficient" in message.lower()
        assert trade is None

    async def test_execute_sell_updates_position(self, db_session, test_agent, trading_service):
        """Test that partial sell updates position correctly"""
        symbol = "000001.SZ"

        # Buy 100 shares
        await trading_service.execute_buy(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=100
        )

        # Sell 30 shares
        await trading_service.execute_sell(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=30
        )

        # Check position
        result = await db_session.execute(
            select(PositionModel).where(
                PositionModel.agent_id == test_agent.id,
                PositionModel.symbol == symbol
            )
        )
        position = result.scalar_one()

        assert position.quantity == 70, f"Expected 70 shares, got {position.quantity}"
        print(f"\n[Position Updated] Remaining: {position.quantity} shares")

    async def test_execute_sell_removes_position(self, db_session, test_agent, trading_service):
        """Test that selling all shares removes position"""
        symbol = "000001.SZ"

        # Buy 100 shares
        await trading_service.execute_buy(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=100
        )

        # Sell all 100 shares
        await trading_service.execute_sell(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=100
        )

        # Check position is deleted
        result = await db_session.execute(
            select(PositionModel).where(
                PositionModel.agent_id == test_agent.id,
                PositionModel.symbol == symbol
            )
        )
        position = result.scalar_one_or_none()

        assert position is None, "Position should be deleted when all shares sold"

    async def test_execute_sell_increases_capital(self, db_session, test_agent, trading_service):
        """Test that sell increases available capital"""
        symbol = "000001.SZ"

        # Buy shares
        await trading_service.execute_buy(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=100
        )

        # Get capital after buy
        result = await db_session.execute(
            select(AgentModel).where(AgentModel.id == test_agent.id)
        )
        agent_after_buy = result.scalar_one()
        capital_after_buy = agent_after_buy.current_capital

        # Sell shares
        await trading_service.execute_sell(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=100
        )

        # Get capital after sell
        result = await db_session.execute(
            select(AgentModel).where(AgentModel.id == test_agent.id)
        )
        agent_after_sell = result.scalar_one()
        capital_after_sell = agent_after_sell.current_capital

        print(f"\n[Capital Change] After Buy: ¥{capital_after_buy:.2f}")
        print(f"                After Sell: ¥{capital_after_sell:.2f}")
        print(f"                Difference: ¥{capital_after_sell - capital_after_buy:.2f}")

        assert capital_after_sell > capital_after_buy


@pytest.mark.asyncio
class TestTradingServicePositions:
    """Tests for position queries with real market data"""

    async def test_get_positions_empty(self, db_session, test_agent, trading_service):
        """Test getting positions when none exist"""
        positions = await trading_service.get_positions(db_session, test_agent.id)

        assert positions == []

    async def test_get_positions_with_holdings(self, db_session, test_agent, trading_service):
        """Test getting positions with actual holdings"""
        symbols = ["000001.SZ", "600000.SH"]

        # Buy shares in multiple stocks
        for symbol in symbols:
            await trading_service.execute_buy(
                db=db_session,
                agent_id=test_agent.id,
                symbol=symbol,
                quantity=100
            )

        # Get positions
        positions = await trading_service.get_positions(db_session, test_agent.id)

        assert len(positions) == len(symbols)

        for pos in positions:
            assert pos.agent_id == test_agent.id
            assert pos.symbol in symbols
            assert pos.quantity == 100
            assert pos.avg_cost > 0
            assert pos.current_price is not None  # Should be fetched from market
            assert pos.market_value is not None
            print(f"\n[Position] {pos.symbol}: {pos.quantity} shares @ ¥{pos.current_price:.2f} = ¥{pos.market_value:.2f}")

    async def test_get_positions_updates_prices(self, db_session, test_agent, trading_service):
        """Test that position prices are updated with current market data"""
        symbol = "000001.SZ"

        # Buy shares
        await trading_service.execute_buy(
            db=db_session,
            agent_id=test_agent.id,
            symbol=symbol,
            quantity=100
        )

        # Get positions (should fetch current market price)
        positions = await trading_service.get_positions(db_session, test_agent.id)

        assert len(positions) == 1
        pos = positions[0]

        assert pos.current_price > 0, "Current price should be fetched from market"
        assert pos.market_value == pos.quantity * pos.current_price
        assert pos.unrealized_pnl is not None

        print(f"\n[Position P&L] Unrealized: ¥{pos.unrealized_pnl:.2f} ({pos.unrealized_pnl_pct:.2f}%)")


@pytest.mark.asyncio
class TestTradingServiceTrades:
    """Tests for trade history queries"""

    async def test_get_trades_empty(self, db_session, test_agent, trading_service):
        """Test getting trades when none exist"""
        trades = await trading_service.get_trades(db_session, test_agent.id)

        assert trades == []

    async def test_get_trades_ordered(self, db_session, test_agent, trading_service):
        """Test that trades are returned in descending order"""
        symbol = "000001.SZ"

        # Execute multiple trades
        for i in range(3):
            await trading_service.execute_buy(
                db=db_session,
                agent_id=test_agent.id,
                symbol=symbol,
                quantity=100
            )

        trades = await trading_service.get_trades(db_session, test_agent.id, limit=10)

        assert len(trades) == 3

        # Check descending order
        for i in range(len(trades) - 1):
            assert trades[i].timestamp >= trades[i + 1].timestamp

    async def test_get_trades_limit(self, db_session, test_agent, trading_service):
        """Test trade limit parameter"""
        symbol = "000001.SZ"

        # Execute 5 trades
        for i in range(5):
            await trading_service.execute_buy(
                db=db_session,
                agent_id=test_agent.id,
                symbol=symbol,
                quantity=100
            )

        # Get only 3
        trades = await trading_service.get_trades(db_session, test_agent.id, limit=3)

        assert len(trades) == 3


@pytest.mark.asyncio
class TestTradingServicePortfolio:
    """Tests for portfolio summary with real market data"""

    async def test_get_portfolio_summary_no_positions(self, db_session, test_agent, trading_service):
        """Test portfolio summary with no positions"""
        summary = await trading_service.get_portfolio_summary(db_session, test_agent.id)

        assert summary is not None
        assert summary["agent_id"] == test_agent.id
        assert summary["cash"] == test_agent.current_capital
        assert summary["position_value"] == 0
        assert summary["total_value"] == test_agent.current_capital
        assert summary["positions_count"] == 0

    async def test_get_portfolio_summary_with_positions(self, db_session, test_agent, trading_service):
        """Test portfolio summary with actual positions"""
        # Buy shares
        await trading_service.execute_buy(
            db=db_session,
            agent_id=test_agent.id,
            symbol="000001.SZ",
            quantity=100
        )

        summary = await trading_service.get_portfolio_summary(db_session, test_agent.id)

        assert summary is not None
        assert summary["agent_id"] == test_agent.id
        assert summary["cash"] < test_agent.initial_capital  # Cash should be reduced
        assert summary["position_value"] > 0  # Should have position value
        assert summary["total_value"] > 0
        assert summary["positions_count"] == 1

        print(f"\n[Portfolio Summary]")
        print(f"  Cash: ¥{summary['cash']:.2f}")
        print(f"  Position Value: ¥{summary['position_value']:.2f}")
        print(f"  Total Value: ¥{summary['total_value']:.2f}")
        print(f"  Total Return: ¥{summary['total_return']:.2f} ({summary['total_return_pct']:.2f}%)")

    async def test_get_portfolio_summary_invalid_agent(self, db_session, trading_service):
        """Test portfolio summary for non-existent agent"""
        summary = await trading_service.get_portfolio_summary(db_session, "invalid-agent")

        assert summary is None


@pytest.mark.asyncio
class TestTradingServiceAsync:
    """Tests for TradingServiceAsync wrapper"""

    async def test_async_wrapper_get_agent(self, db_session, test_agent):
        """Test async wrapper get_agent method"""
        service = TradingServiceAsync(db_session)

        agent = await service.get_agent(test_agent.id)

        assert agent is not None
        assert agent.id == test_agent.id
        assert agent.name == test_agent.name

    async def test_async_wrapper_get_position(self, db_session, test_agent, trading_service):
        """Test async wrapper get_position method"""
        # First create a position
        await trading_service.execute_buy(
            db=db_session,
            agent_id=test_agent.id,
            symbol="000001.SZ",
            quantity=100
        )

        service = TradingServiceAsync(db_session)
        position = await service.get_position(test_agent.id, "000001.SZ")

        assert position is not None
        assert position.symbol == "000001.SZ"
        assert position.quantity == 100

    async def test_async_wrapper_portfolio_summary(self, db_session, test_agent):
        """Test async wrapper portfolio summary"""
        service = TradingServiceAsync(db_session)

        summary = await service.get_portfolio_summary(test_agent.id)

        assert summary is not None
        assert summary["total_capital"] == test_agent.initial_capital


@pytest.mark.asyncio
class TestTradingServiceMultipleStocks:
    """Tests for trading multiple stocks"""

    async def test_trade_multiple_stocks(self, db_session, test_agent, trading_service):
        """Test trading multiple different stocks"""
        stocks = [
            ("000001.SZ", 100),  # 平安银行
            ("600000.SH", 200),  # 浦发银行
            ("000858.SZ", 50),   # 五粮液
        ]

        trades_executed = []

        for symbol, qty in stocks:
            success, message, trade = await trading_service.execute_buy(
                db=db_session,
                agent_id=test_agent.id,
                symbol=symbol,
                quantity=qty
            )

            if success:
                trades_executed.append((symbol, trade))
                print(f"\n[Multi-Stock] Bought {qty} shares of {symbol} @ ¥{trade.price:.2f}")

        # Should have at least one successful trade
        assert len(trades_executed) > 0, "No trades were executed"

        # Check positions
        positions = await trading_service.get_positions(db_session, test_agent.id)
        assert len(positions) == len(trades_executed)

        # Check portfolio
        summary = await trading_service.get_portfolio_summary(db_session, test_agent.id)
        assert summary["positions_count"] == len(trades_executed)
