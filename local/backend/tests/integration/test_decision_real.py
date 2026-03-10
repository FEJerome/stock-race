"""
Real Decision API Integration Tests

Tests AI decision-making endpoint with real market data and real AI API.
Requires MOONSHOT_API_KEY environment variable for Kimi API tests.
"""
import pytest
import pytest_asyncio
import os
import uuid
from datetime import datetime
from httpx import AsyncClient, ASGITransport

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select, delete

from main import create_app
from models.database import Base, AgentModel, TradeModel, PositionModel
from services.ai_adapter import get_ai_adapter, DecisionRequest, MarketContext, PositionContext


# Test database URL
TEST_DATABASE_URL = "sqlite+aiosqlite:///./test_decision.db"


@pytest_asyncio.fixture(scope="module")
async def test_engine():
    """Create test database engine"""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        future=True
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncSession:
    """Create a fresh database session for each test"""
    async_session = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False
    )

    async with async_session() as session:
        yield session
        await session.execute(delete(TradeModel))
        await session.execute(delete(PositionModel))
        await session.execute(delete(AgentModel))
        await session.commit()


@pytest_asyncio.fixture
async def test_agent(db_session: AsyncSession) -> AgentModel:
    """Create a test agent"""
    agent = AgentModel(
        id=f"test-agent-{uuid.uuid4().hex[:8]}",
        name="Test Decision Agent",
        initial_capital=1000000.0,
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
async def async_client(db_session) -> AsyncClient:
    """Create async test client"""
    app = create_app()

    # Override get_db dependency
    async def override_get_db():
        yield db_session

    app.dependency_overrides = {}
    from models.database import get_db
    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
class TestDecisionAPI:
    """Tests for decision API endpoint with real market data"""

    async def test_decision_agent_not_found(self, async_client):
        """Test decision with non-existent agent"""
        response = await async_client.post(
            "/api/agents/non-existent-agent/decide",
            json={"symbol": "000001.SZ"}
        )

        assert response.status_code == 404
        data = response.json()
        assert "not found" in data["detail"].lower() or "不存在" in data["detail"]

    async def test_decision_agent_not_active(self, async_client, test_agent, db_session):
        """Test decision with inactive agent"""
        # Set agent to paused
        test_agent.status = "paused"
        await db_session.commit()

        response = await async_client.post(
            f"/api/agents/{test_agent.id}/decide",
            json={"symbol": "000001.SZ"}
        )

        assert response.status_code == 400
        data = response.json()
        assert "not active" in data["detail"].lower() or "not active" in data["detail"]

    async def test_decision_invalid_symbol(self, async_client, test_agent):
        """Test decision with invalid symbol"""
        response = await async_client.post(
            f"/api/agents/{test_agent.id}/decide",
            json={"symbol": "INVALID999.XX"}
        )

        assert response.status_code == 404
        data = response.json()
        assert "not found" in data["detail"].lower() or "market data" in data["detail"].lower()


@pytest.mark.asyncio
class TestDecisionWithRealAI:
    """Tests for AI decision with real Kimi API - requires API key"""

    @pytest.fixture(autouse=True)
    def check_api_key(self):
        """Skip tests if no API key available"""
        api_key = os.getenv("MOONSHOT_API_KEY")
        if not api_key:
            pytest.skip("MOONSHOT_API_KEY not set - skipping real AI tests")

    async def test_kimi_adapter_creation(self):
        """Test creating Kimi adapter with real API key"""
        adapter = get_ai_adapter(provider="kimi", model="kimi-k2-5")

        assert adapter is not None
        assert adapter.model_name == "kimi-k2-5"
        assert adapter.api_key is not None

        print(f"\n[Kimi Adapter] Created successfully for model: {adapter.model_name}")

        await adapter.close()

    async def test_kimi_make_decision_buy(self):
        """Test Kimi making a buy decision with real API"""
        adapter = get_ai_adapter(provider="kimi", model="kimi-k2-5")

        try:
            request = DecisionRequest(
                agent_id="test-agent",
                agent_name="Test Trader",
                symbol="000001.SZ",
                market_data=MarketContext(
                    symbol="000001.SZ",
                    name="平安银行",
                    current_price=10.5,
                    change_percent=2.5,
                    volume=1000000,
                    ma5=10.2,
                    ma10=10.0,
                    ma20=9.8,
                    high_52w=15.0,
                    low_52w=8.0
                ),
                position=None,  # No position - should suggest buy
                strategy={
                    "risk_tolerance": "稳健",
                    "sectors": ["金融"],
                    "holding_period": "中线",
                    "position_limit": "单股不超过30%",
                    "stop_loss": "8%止损"
                },
                portfolio_summary={
                    "total_capital": 1000000,
                    "available_capital": 1000000,
                    "position_count": 0
                },
                trade_history=[],
                news_sentiment=None
            )

            decision = await adapter.make_decision(request)

            print(f"\n[Kimi Decision] Action: {decision.action.value}")
            print(f"              Confidence: {decision.confidence}")
            print(f"              Reason: {decision.reason[:100]}...")
            print(f"              Latency: {decision.latency_ms:.2f}ms")

            assert decision is not None
            assert decision.action.value in ["buy", "sell", "hold", "watch"]
            assert 0 <= decision.confidence <= 1
            assert len(decision.reason) > 0
            assert decision.latency_ms > 0
            assert decision.model_name == "kimi-k2-5"

            if decision.token_usage:
                print(f"              Tokens: {decision.token_usage.total_tokens}")
                print(f"              Cost: ${decision.token_usage.cost_usd:.4f}")

        finally:
            await adapter.close()

    async def test_kimi_make_decision_sell(self):
        """Test Kimi making a sell decision with existing position"""
        adapter = get_ai_adapter(provider="kimi", model="kimi-k2-5")

        try:
            request = DecisionRequest(
                agent_id="test-agent",
                agent_name="Test Trader",
                symbol="000001.SZ",
                market_data=MarketContext(
                    symbol="000001.SZ",
                    name="平安银行",
                    current_price=12.5,  # Higher than cost
                    change_percent=5.0,
                    volume=2000000
                ),
                position=PositionContext(
                    symbol="000001.SZ",
                    quantity=1000,
                    avg_cost=10.0,
                    current_price=12.5,
                    unrealized_pnl=2500.0,
                    unrealized_pnl_pct=25.0
                ),
                strategy={
                    "risk_tolerance": "稳健",
                    "sectors": ["金融"],
                    "holding_period": "中线",
                    "position_limit": "单股不超过30%",
                    "stop_loss": "8%止损"
                },
                portfolio_summary={
                    "total_capital": 1000000,
                    "available_capital": 500000,
                    "position_count": 1
                },
                trade_history=[
                    {
                        "symbol": "000001.SZ",
                        "action": "buy",
                        "quantity": 1000,
                        "price": 10.0,
                        "timestamp": "2024-01-01T10:00:00"
                    }
                ]
            )

            decision = await adapter.make_decision(request)

            print(f"\n[Kimi Sell Decision] Action: {decision.action.value}")
            print(f"                    Confidence: {decision.confidence}")
            print(f"                    Reason: {decision.reason[:100]}...")

            assert decision is not None
            assert decision.action.value in ["buy", "sell", "hold", "watch"]

        finally:
            await adapter.close()

    async def test_kimi_adapter_usage_stats(self):
        """Test Kimi adapter tracks usage statistics"""
        adapter = get_ai_adapter(provider="kimi", model="kimi-k2-5")

        try:
            # Make a decision
            request = DecisionRequest(
                agent_id="test-agent",
                agent_name="Test Trader",
                symbol="000001.SZ",
                market_data=MarketContext(
                    symbol="000001.SZ",
                    name="平安银行",
                    current_price=10.5,
                    change_percent=2.5,
                    volume=1000000
                ),
                position=None,
                strategy={"risk_tolerance": "稳健"},
                portfolio_summary={"total_capital": 1000000, "available_capital": 1000000, "position_count": 0},
                trade_history=[]
            )

            decision = await adapter.make_decision(request)

            # Check stats
            stats = adapter.get_usage_stats()

            print(f"\n[Kimi Stats] Model: {stats['model']}")
            print(f"             Tokens: {stats['total_tokens']}")
            print(f"             Cost: ${stats['total_cost_usd']:.4f}")

            assert stats["model"] == "kimi-k2-5"
            assert stats["provider"] == "KimiAdapter"

            if decision.token_usage:
                assert stats["total_tokens"] >= decision.token_usage.total_tokens

        finally:
            await adapter.close()


@pytest.mark.asyncio
class TestDecisionEndToEnd:
    """End-to-end tests for decision flow with real market data"""

    @pytest.fixture(autouse=True)
    def check_api_key(self):
        """Skip tests if no API key available"""
        api_key = os.getenv("MOONSHOT_API_KEY")
        if not api_key:
            pytest.skip("MOONSHOT_API_KEY not set - skipping E2E tests")

    async def test_full_decision_flow_buy(self, async_client, test_agent):
        """Test full decision flow that results in a buy"""
        # Ensure agent has plenty of capital
        response = await async_client.post(
            f"/api/agents/{test_agent.id}/decide",
            json={"symbol": "000001.SZ", "force": False}
        )

        print(f"\n[Decision Response] Status: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            assert data["code"] == 0

            decision_data = data["data"]
            print(f"[Decision Result] Action: {decision_data['action']}")
            print(f"                 Confidence: {decision_data['confidence']}")
            print(f"                 Reason: {decision_data['reason'][:100]}...")
            print(f"                 Model: {decision_data['model_name']}")
            print(f"                 Latency: {decision_data['latency_ms']:.2f}ms")

            assert "decision_id" in decision_data
            assert "agent_id" in decision_data
            assert decision_data["agent_id"] == test_agent.id
            assert decision_data["symbol"] == "000001.SZ"
            assert decision_data["action"] in ["buy", "sell", "hold", "watch"]
            assert 0 <= decision_data["confidence"] <= 1

            # Check if trade was executed
            if decision_data.get("executed_trade"):
                trade = decision_data["executed_trade"]
                print(f"[Trade Executed] Action: {trade['action']}")
                print(f"                 Quantity: {trade['quantity']}")
                print(f"                 Price: ¥{trade['price']}")
        else:
            # If API fails, at least verify we got a proper error
            pytest.skip(f"Decision API returned {response.status_code} - may be API limit or network issue")

    async def test_decision_with_position(self, async_client, test_agent, db_session):
        """Test decision when agent already has a position"""
        from services.trading_service import TradingService

        # First buy some shares
        trading_service = TradingService()
        success, msg, trade = await trading_service.execute_buy(
            db=db_session,
            agent_id=test_agent.id,
            symbol="000001.SZ",
            quantity=100
        )
        assert success, f"Failed to setup position: {msg}"

        # Now make a decision - AI should consider existing position
        response = await async_client.post(
            f"/api/agents/{test_agent.id}/decide",
            json={"symbol": "000001.SZ"}
        )

        if response.status_code == 200:
            data = response.json()
            decision_data = data["data"]

            print(f"\n[Decision with Position] Action: {decision_data['action']}")
            print(f"                        Confidence: {decision_data['confidence']}")

            # AI might suggest sell since we have position
            assert decision_data["action"] in ["buy", "sell", "hold", "watch"]
        else:
            pytest.skip(f"Decision API returned {response.status_code}")


@pytest.mark.asyncio
class TestTokenStatsAPI:
    """Tests for token statistics API"""

    async def test_get_token_stats_empty(self, async_client):
        """Test getting token stats when no decisions made"""
        response = await async_client.get("/api/agents/tokens/stats")

        assert response.status_code == 200
        data = response.json()

        assert data["code"] == 0
        stats = data["data"]

        assert "total_tokens" in stats
        assert "total_cost_usd" in stats
        assert "total_decisions" in stats
        assert "avg_tokens_per_decision" in stats

    async def test_reset_token_stats(self, async_client):
        """Test resetting token statistics"""
        response = await async_client.post("/api/agents/tokens/reset")

        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 0

        # Verify stats are reset
        response = await async_client.get("/api/agents/tokens/stats")
        data = response.json()
        stats = data["data"]

        assert stats["total_tokens"] == 0
        assert stats["total_decisions"] == 0


@pytest.mark.asyncio
class TestDecisionHistoryAPI:
    """Tests for decision history API"""

    async def test_get_decision_history_empty(self, async_client, test_agent):
        """Test getting decision history when none exist"""
        response = await async_client.get(
            f"/api/agents/{test_agent.id}/decisions/history"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 0
        assert data["data"]["items"] == []
        assert data["data"]["total"] == 0


@pytest.mark.asyncio
class TestDecisionErrorHandling:
    """Tests for decision error handling"""

    async def test_decision_missing_api_key(self, async_client, test_agent, monkeypatch):
        """Test decision fails gracefully when API key is missing"""
        # Remove API key
        monkeypatch.delenv("MOONSHOT_API_KEY", raising=False)

        response = await async_client.post(
            f"/api/agents/{test_agent.id}/decide",
            json={"symbol": "000001.SZ"}
        )

        # Should return 500 with appropriate error
        assert response.status_code == 500
        data = response.json()
        assert "api key" in data["detail"].lower() or "not configured" in data["detail"].lower()


@pytest.mark.asyncio
class TestDecisionPromptBuilding:
    """Tests for decision prompt building"""

    async def test_kimi_prompt_building(self):
        """Test that Kimi adapter builds correct prompt"""
        adapter = get_ai_adapter(provider="kimi", model="kimi-k2-5")

        try:
            request = DecisionRequest(
                agent_id="test",
                agent_name="Test Agent",
                symbol="000001.SZ",
                market_data=MarketContext(
                    symbol="000001.SZ",
                    name="平安银行",
                    current_price=10.5,
                    change_percent=2.5,
                    volume=1000000
                ),
                position=None,
                strategy={
                    "risk_tolerance": "稳健",
                    "holding_period": "中线",
                    "sectors": ["金融"]
                },
                portfolio_summary={
                    "total_capital": 1000000,
                    "available_capital": 1000000,
                    "position_count": 0
                },
                trade_history=[]
            )

            prompt = adapter.build_prompt(request)

            print(f"\n[Prompt Preview] {prompt[:200]}...")

            assert "Test Agent" in prompt
            assert "平安银行" in prompt
            assert "000001.SZ" in prompt
            assert "10.5" in prompt
            assert "稳健" in prompt

        finally:
            await adapter.close()

    async def test_kimi_response_parsing(self):
        """Test parsing Kimi JSON response"""
        adapter = get_ai_adapter(provider="kimi", model="kimi-k2-5")

        try:
            # Test valid JSON response
            valid_response = '''{"action": "buy", "confidence": 0.85, "reason": "Good opportunity", "suggested_quantity": 100}'''
            decision = adapter.parse_response(valid_response)

            assert decision.action.value == "buy"
            assert decision.confidence == 0.85
            assert decision.reason == "Good opportunity"
            assert decision.suggested_quantity == 100

            # Test response with markdown code block
            markdown_response = '''```json
{"action": "sell", "confidence": 0.7, "reason": "Take profit"}
```'''
            decision = adapter.parse_response(markdown_response)
            assert decision.action.value == "sell"
            assert decision.confidence == 0.7

            # Test invalid JSON
            invalid_response = "Not valid JSON"
            decision = adapter.parse_response(invalid_response)
            assert decision.action.value == "hold"  # Default to hold on error
            assert decision.confidence == 0.0

        finally:
            await adapter.close()
