# Local 形态测试策略文档

本文档定义 Local 版本的单元测试规范和集成测试场景。

> **适用范围**：Local 形态（FastAPI + Vue 3 + SQLite）
> **版本**：v1.0
> **最后更新**：2026-03-09

---

## 目录

- [1. 测试架构](#1-测试架构)
- [2. 单元测试规范](#2-单元测试规范)
- [3. 集成测试场景](#3-集成测试场景)
- [4. 性能测试基准](#4-性能测试基准)
- [5. 测试数据准备](#5-测试数据准备)

---

## 1. 测试架构

### 1.1 目录结构

```
local/
├── backend/
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py              # pytest 全局配置
│   │   ├── unit/                    # 单元测试
│   │   │   ├── test_models.py       # 数据模型测试
│   │   │   ├── test_services/       # 服务层测试
│   │   │   │   ├── test_trading_engine.py
│   │   │   │   ├── test_ai_adapter.py
│   │   │   │   └── test_market_collector.py
│   │   │   └── test_adapters/       # 适配器测试
│   │   │       ├── test_sqlite_storage.py
│   │   │       └── test_datasources.py
│   │   ├── integration/             # 集成测试
│   │   │   ├── test_api/            # API 集成测试
│   │   │   │   ├── test_agent_api.py
│   │   │   │   ├── test_trade_api.py
│   │   │   │   └── test_market_api.py
│   │   │   ├── test_workflows/      # 业务流程测试
│   │   │   │   ├── test_create_agent_flow.py
│   │   │   │   ├── test_trade_flow.py
│   │   │   │   └── test_promotion_flow.py
│   │   │   └── test_websocket.py    # WebSocket 测试
│   │   └── fixtures/                # 测试数据
│   │       ├── agents.py
│   │       ├── trades.py
│   │       └── quotes.py
│   └── pytest.ini                   # pytest 配置
└── frontend/
    └── tests/
        ├── unit/
        └── e2e/
```

### 1.2 技术栈

| 类型 | 工具 | 用途 |
|------|------|------|
| 后端测试 | pytest | 单元/集成测试框架 |
| 异步测试 | pytest-asyncio | async/await 支持 |
| HTTP 测试 | httpx | API 测试客户端 |
| 数据库 | pytest-sqlite | SQLite 测试支持 |
| Mock | unittest.mock | 依赖模拟 |
| 覆盖率 | pytest-cov | 代码覆盖率统计 |
| 前端测试 | Vitest | Vue 组件测试 |
| E2E 测试 | Playwright | 端到端测试 |

### 1.3 pytest 配置

```ini
# pytest.ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts =
    -v
    --tb=short
    --cov=src
    --cov-report=term-missing
    --cov-report=html
    --asyncio-mode=auto
markers =
    unit: 单元测试
    integration: 集成测试
    slow: 慢测试（需要外部服务）
    websocket: WebSocket 测试
```

---

## 2. 单元测试规范

### 2.1 测试命名规范

| 被测对象 | 测试文件命名 | 测试函数命名 |
|---------|------------|------------|
| 类 | `test_{class_name}.py` | `test_{method_name}_{scenario}` |
| 函数 | `test_{module_name}.py` | `test_{function_name}_{scenario}` |

**示例**：
- `TradingEngine.execute_trade()` → `test_execute_trade_insufficient_funds`
- `AIAdapter.decide()` → `test_decide_success_response`

### 2.2 测试覆盖率要求

| 模块 | 覆盖率要求 | 重点关注 |
|------|-----------|---------|
| core/domain/models | 95% | 模型验证、序列化 |
| services/trading_engine | 90% | 交易逻辑、边界条件 |
| services/ai_adapter | 85% | 容错、重试、熔断 |
| adapters/storage | 90% | CRUD、事务 |
| adapters/datasource | 80% | 数据解析、错误处理 |
| api/* | 85% | 请求校验、错误响应 |

### 2.3 核心模块测试示例

#### TradingEngine 测试

```python
# tests/unit/services/test_trading_engine.py
import pytest
from decimal import Decimal
from datetime import datetime, time

from services.trading_engine import TradingEngine
from core.domain.models import Trade, Position, Agent
from core.domain.enums import DecisionAction


class TestTradingEngine:
    """交易引擎单元测试"""

    @pytest.fixture
    def engine(self, db_session):
        """测试用的交易引擎实例"""
        return TradingEngine(db_session)

    @pytest.fixture
    def active_agent(self, db_session):
        """创建一个活跃的交易AI"""
        agent = Agent(
            id="test-agent-001",
            name="测试AI",
            initial_capital=Decimal("500000"),
            current_capital=Decimal("500000"),
            status="active"
        )
        db_session.add(agent)
        db_session.commit()
        return agent

    class TestExecuteTrade:
        """交易执行测试"""

        async def test_buy_success(self, engine, active_agent):
            """测试正常买入"""
            # Arrange
            trade = Trade(
                agent_id=active_agent.id,
                symbol="000001.SZ",
                action=DecisionAction.BUY,
                quantity=100,
                price=Decimal("13.20")
            )

            # Act
            result = await engine.execute_trade(trade)

            # Assert
            assert result.success is True
            assert result.trade_id is not None
            assert active_agent.current_capital == Decimal("498680")  # 500000 - 1320

        async def test_buy_insufficient_funds(self, engine, active_agent):
            """测试资金不足"""
            # Arrange
            trade = Trade(
                agent_id=active_agent.id,
                symbol="000001.SZ",
                action=DecisionAction.BUY,
                quantity=100000,  # 远超可用资金
                price=Decimal("13.20")
            )

            # Act & Assert
            with pytest.raises(InsufficientFundsError) as exc:
                await engine.execute_trade(trade)
            assert exc.value.code == "2002"

        async def test_sell_success(self, engine, active_agent, db_session):
            """测试正常卖出"""
            # Arrange - 先创建持仓
            position = Position(
                agent_id=active_agent.id,
                symbol="000001.SZ",
                quantity=1000,
                avg_cost=Decimal("12.50")
            )
            db_session.add(position)
            db_session.commit()

            trade = Trade(
                agent_id=active_agent.id,
                symbol="000001.SZ",
                action=DecisionAction.SELL,
                quantity=500,
                price=Decimal("13.20")
            )

            # Act
            result = await engine.execute_trade(trade)

            # Assert
            assert result.success is True
            assert result.realized_pnl == Decimal("350")  # (13.20 - 12.50) * 500
            # 持仓剩余500股
            position = await engine.get_position(active_agent.id, "000001.SZ")
            assert position.quantity == 500

        async def test_sell_insufficient_position(self, engine, active_agent):
            """测试持仓不足"""
            # Arrange - 无持仓
            trade = Trade(
                agent_id=active_agent.id,
                symbol="000001.SZ",
                action=DecisionAction.SELL,
                quantity=100,
                price=Decimal("13.20")
            )

            # Act & Assert
            with pytest.raises(InsufficientPositionError) as exc:
                await engine.execute_trade(trade)
            assert exc.value.code == "2003"

        async def test_position_limit_exceeded(self, engine, active_agent, db_session):
            """测试超出仓位限制"""
            # Arrange - 已有高仓位
            position = Position(
                agent_id=active_agent.id,
                symbol="000001.SZ",
                quantity=12000,  # 约30%仓位
                avg_cost=Decimal("12.50")
            )
            db_session.add(position)
            db_session.commit()

            strategy = {"position_limit": "30%"}

            trade = Trade(
                agent_id=active_agent.id,
                symbol="000001.SZ",
                action=DecisionAction.BUY,
                quantity=1000,  # 会超出30%限制
                price=Decimal("13.20")
            )

            # Act & Assert
            with pytest.raises(PositionLimitExceededError) as exc:
                await engine.execute_trade(trade, strategy)
            assert exc.value.code == "2004"

        async def test_non_trading_hours(self, engine, active_agent):
            """测试非交易时间"""
            # Arrange - 模拟收盘后时间
            with freeze_time("2026-03-09T20:00:00"):
                trade = Trade(
                    agent_id=active_agent.id,
                    symbol="000001.SZ",
                    action=DecisionAction.BUY,
                    quantity=100,
                    price=Decimal("13.20")
                )

                # Act & Assert
                with pytest.raises(NonTradingHoursError) as exc:
                    await engine.execute_trade(trade)
                assert exc.value.code == "2001"

        async def test_transaction_atomicity(self, engine, active_agent, db_session, monkeypatch):
            """测试事务原子性 - 中间失败回滚"""
            # Arrange - 模拟中间步骤失败
            def mock_fail(*args, **kwargs):
                raise Exception("模拟失败")

            monkeypatch.setattr(engine, "_update_position", mock_fail)

            trade = Trade(
                agent_id=active_agent.id,
                symbol="000001.SZ",
                action=DecisionAction.BUY,
                quantity=100,
                price=Decimal("13.20")
            )

            # Act
            with pytest.raises(Exception):
                await engine.execute_trade(trade)

            # Assert - 验证资金未变动（事务回滚）
            db_session.refresh(active_agent)
            assert active_agent.current_capital == Decimal("500000")


    class TestCalculateMetrics:
        """收益指标计算测试"""

        async def test_total_return_calculation(self, engine, active_agent):
            """测试总收益率计算"""
            # Arrange - 设置初始和当前资金
            active_agent.initial_capital = Decimal("100000")
            active_agent.current_capital = Decimal("125000")

            # Act
            metrics = await engine.calculate_metrics(active_agent.id)

            # Assert
            assert metrics.total_return == Decimal("0.25")  # 25%

        async def test_sharpe_ratio_calculation(self, engine, active_agent, db_session):
            """测试夏普比率计算"""
            # Arrange - 创建历史收益率数据
            returns = [0.01, -0.005, 0.015, 0.008, -0.002]
            for ret in returns:
                trade = Trade(
                    agent_id=active_agent.id,
                    realized_pnl=ret * float(active_agent.current_capital),
                    timestamp=datetime.now()
                )
                db_session.add(trade)
            db_session.commit()

            # Act
            metrics = await engine.calculate_metrics(active_agent.id)

            # Assert
            # 夏普比率 = (平均收益 - 无风险利率) / 标准差
            assert metrics.sharpe_ratio > 0  # 正收益应为正夏普

        async def test_max_drawdown_calculation(self, engine, active_agent):
            """测试最大回撤计算"""
            # Arrange - 模拟净值曲线
            equity_curve = [
                Decimal("100000"),  # 初始
                Decimal("110000"),  # +10%
                Decimal("105000"),  # -4.5%
                Decimal("115000"),  # +9.5%
                Decimal("95000"),   # -17.4% (最大回撤)
                Decimal("102000"),  # +7.4%
            ]

            # Act
            max_dd = engine._calculate_max_drawdown(equity_curve)

            # Assert
            # 从115000跌到95000，回撤 = (115000-95000)/115000 = 17.39%
            assert abs(max_dd - Decimal("0.1739")) < Decimal("0.001")
```

#### AIAdapter 测试

```python
# tests/unit/services/test_ai_adapter.py
import pytest
from unittest.mock import Mock, AsyncMock, patch

from services.ai_adapter import AIAdapter, AIAdapterConfig
from core.domain.models import Decision, DecisionContext


class TestAIAdapter:
    """AI适配器单元测试"""

    @pytest.fixture
    def config(self):
        return AIAdapterConfig(
            timeout=30,
            max_retries=2,
            token_budget_per_day=1000000
        )

    @pytest.fixture
    def adapter(self, config):
        return AIAdapter(config)

    class TestDecide:
        """决策调用测试"""

        async def test_successful_decision(self, adapter):
            """测试正常决策返回"""
            # Arrange
            context = DecisionContext(
                strategy={"risk_tolerance": "稳健"},
                portfolio={"cash": 500000},
                market={"watchlist": []}
            )

            # Mock DeepSeek API 响应
            mock_response = {
                "choices": [{
                    "message": {
                        "content": '{"action": "buy", "symbol": "000001.SZ", "confidence": 0.75}'
                    }
                }],
                "usage": {"prompt_tokens": 3000, "completion_tokens": 200}
            }

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value.json = AsyncMock(return_value=mock_response)
                mock_post.return_value.status_code = 200

                # Act
                decision = await adapter.decide(context)

                # Assert
                assert decision.action == "buy"
                assert decision.symbol == "000001.SZ"
                assert decision.confidence == 0.75

        async def test_timeout_retry(self, adapter):
            """测试超时重试"""
            # Arrange
            context = DecisionContext()

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                # 第一次调用超时，第二次成功
                mock_post.side_effect = [
                    TimeoutError(),  # 第一次
                    Mock(             # 第二次
                        status_code=200,
                        json=AsyncMock(return_value={
                            "choices": [{"message": {"content": '{"action": "hold"}'}}],
                            "usage": {"prompt_tokens": 3000, "completion_tokens": 100}
                        }])
                    )
                ]

                # Act
                decision = await adapter.decide(context)

                # Assert
                assert mock_post.call_count == 2  # 重试了一次
                assert decision.action == "hold"

        async def test_max_retries_exceeded(self, adapter):
            """测试重试次数用尽"""
            # Arrange
            context = DecisionContext()

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.side_effect = TimeoutError()  # 始终超时

                # Act & Assert
                with pytest.raises(AIAdapterError) as exc:
                    await adapter.decide(context)
                assert exc.value.code == "4001"
                assert mock_post.call_count == 3  # 初始1次 + 重试2次

        async def test_invalid_json_response(self, adapter):
            """测试无效JSON响应"""
            # Arrange
            context = DecisionContext()

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value.json = AsyncMock(return_value={
                    "choices": [{"message": {"content": "不是有效的JSON"}}]
                })
                mock_post.return_value.status_code = 200

                # Act & Assert
                with pytest.raises(AIAdapterError) as exc:
                    await adapter.decide(context)
                assert "JSON解析失败" in str(exc.value)

        async def test_token_budget_exceeded(self, adapter):
            """测试Token预算超限"""
            # Arrange
            adapter.daily_token_usage = 999999  # 接近上限
            context = DecisionContext()

            # Act & Assert
            with pytest.raises(TokenBudgetExceededError) as exc:
                await adapter.decide(context)
            assert exc.value.code == "4002"

    class TestCircuitBreaker:
        """熔断器测试"""

        async def test_circuit_opens_after_failures(self, adapter):
            """测试熔断器开启"""
            # Arrange - 连续失败
            context = DecisionContext()

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.side_effect = Exception("API Error")

                # 连续失败10次
                for _ in range(10):
                    with pytest.raises(AIAdapterError):
                        await adapter.decide(context)

            # Assert - 熔断器应开启
            assert adapter.circuit_breaker.state == CircuitState.OPEN

            # 再次调用应直接失败，不再请求API
            with pytest.raises(AIAdapterError) as exc:
                await adapter.decide(context)
            assert "熔断器开启" in str(exc.value)
            assert mock_post.call_count == 10  # 没有新的调用

        async def test_circuit_half_open_recovery(self, adapter):
            """测试熔断器半开恢复"""
            # Arrange - 先熔断，再恢复
            adapter.circuit_breaker.state = CircuitState.OPEN
            adapter.circuit_breaker.last_failure_time = time.time() - 301  # 5分钟前

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value.json = AsyncMock(return_value={
                    "choices": [{"message": {"content": '{"action": "hold"}'}}],
                    "usage": {"prompt_tokens": 3000, "completion_tokens": 100}
                })
                mock_post.return_value.status_code = 200

                # Act - 恢复后的调用
                decision = await adapter.decide(DecisionContext())

                # Assert - 半开状态成功，应关闭熔断器
                assert decision.action == "hold"
                assert adapter.circuit_breaker.state == CircuitState.CLOSED
```

#### DataSourceRouter 测试

```python
# tests/unit/adapters/test_datasources.py
import pytest
from unittest.mock import Mock, AsyncMock

from adapters.datasource.router import DataSourceRouter
from adapters.datasource.sina import SinaDataSource
from adapters.datasource.tencent import TencentDataSource


class TestDataSourceRouter:
    """数据源路由器测试"""

    @pytest.fixture
    def router(self):
        return DataSourceRouter()

    class TestFetchQuotes:
        """行情获取测试"""

        async def test_primary_source_success(self, router):
            """测试主数据源成功"""
            # Arrange
            symbols = ["000001.SZ"]

            # Mock 新浪成功返回
            router.sources["sina"].fetch_batch = AsyncMock(return_value={
                "000001.SZ": {"price": 13.20, "change": 0.15}
            })

            # Act
            results = await router.fetch_quotes(symbols)

            # Assert
            assert "000001.SZ" in results
            assert results["000001.SZ"]["price"] == 13.20

        async def test_failover_to_backup(self, router):
            """测试主数据源失败切换到备份"""
            # Arrange
            symbols = ["000001.SZ"]

            # Mock 新浪失败，腾讯成功
            router.sources["sina"].fetch_batch = AsyncMock(side_effect=Exception("Sina Error"))
            router.sources["tencent"].fetch_batch = AsyncMock(return_value={
                "000001.SZ": {"price": 13.21, "change": 0.16}
            })

            # Act
            results = await router.fetch_quotes(symbols)

            # Assert
            assert "000001.SZ" in results
            assert results["000001.SZ"]["price"] == 13.21

        async def test_data_quality_validation(self, router):
            """测试数据质量验证"""
            # Arrange
            symbols = ["000001.SZ"]

            # Mock 返回异常数据（价格异常）
            router.sources["sina"].fetch_batch = AsyncMock(return_value={
                "000001.SZ": {"price": -100, "change": 0.15}  # 负价格，异常
            })
            router.sources["tencent"].fetch_batch = AsyncMock(return_value={
                "000001.SZ": {"price": 13.20, "change": 0.15}  # 正常数据
            })

            # Act
            results = await router.fetch_quotes(symbols)

            # Assert - 应该使用腾讯的数据
            assert results["000001.SZ"]["price"] == 13.20

        async def test_circuit_breaker(self, router):
            """测试数据源熔断"""
            # Arrange
            symbols = ["000001.SZ"]

            # 连续失败10次
            router.sources["sina"].fetch_batch = AsyncMock(side_effect=Exception("Error"))

            for _ in range(10):
                try:
                    await router.fetch_quotes(symbols)
                except:
                    pass

            # Assert - 新浪应被熔断
            assert router.circuit_breakers["sina"].state == CircuitState.OPEN

        async def test_cached_fallback(self, router):
            """测试缓存兜底"""
            # Arrange
            symbols = ["000001.SZ"]

            # 所有数据源都失败，但有缓存
            for source in ["sina", "tencent", "eastmoney"]:
                router.sources[source].fetch_batch = AsyncMock(side_effect=Exception("Error"))

            # Mock 缓存返回
            router._get_cached_quote = AsyncMock(return_value={
                "price": 13.20, "change": 0.15, "cached": True
            })

            # Act
            results = await router.fetch_quotes(symbols)

            # Assert
            assert "000001.SZ" in results
            assert results["000001.SZ"].get("cached") is True

    class TestDynamicWeightAdjustment:
        """动态权重调整测试"""

        async def test_weight_adjustment_based_on_success_rate(self, router):
            """测试基于成功率的权重调整"""
            # Arrange - 新浪成功率低，腾讯高
            router.health_status["sina"] = Mock(
                success_rate=0.5,  # 50%成功率
                avg_latency_ms=500
            )
            router.health_status["tencent"] = Mock(
                success_rate=0.95,  # 95%成功率
                avg_latency_ms=200
            )

            initial_sina_weight = router.weights["sina"]
            initial_tencent_weight = router.weights["tencent"]

            # Act
            await router._dynamic_weight_adjustment()

            # Assert - 腾讯权重应增加，新浪应减少
            assert router.weights["tencent"] > initial_tencent_weight
            assert router.weights["sina"] < initial_sina_weight
```

---

## 3. 集成测试场景

### 3.1 API 集成测试

```python
# tests/integration/test_api/test_agent_api.py
import pytest
from httpx import AsyncClient


class TestAgentAPI:
    """AI交易员 API 集成测试"""

    @pytest.fixture
    async def client(self):
        """测试客户端"""
        from main import app
        async with AsyncClient(app=app, base_url="http://test") as client:
            yield client

    async def test_create_agent_full_flow(self, client):
        """测试创建AI完整流程"""
        # 1. 创建AI
        response = await client.post("/api/agents", json={
            "name": "测试AI",
            "initial_capital": 500000,
            "strategy": {
                "risk_tolerance": "稳健",
                "sectors": ["科技"],
                "holding_period": "中期",
                "position_limit": "30%",
                "stop_loss": "8%",
                "market_scope": "主板+创业板"
            }
        })
        assert response.status_code == 200
        agent_id = response.json()["data"]["id"]

        # 2. 查询列表
        response = await client.get("/api/agents")
        assert response.status_code == 200
        agents = response.json()["data"]["items"]
        assert any(a["id"] == agent_id for a in agents)

        # 3. 查询详情
        response = await client.get(f"/api/agents/{agent_id}")
        assert response.status_code == 200
        assert response.json()["data"]["name"] == "测试AI"

        # 4. 删除
        response = await client.delete(f"/api/agents/{agent_id}")
        assert response.status_code == 200

        # 5. 确认删除
        response = await client.get(f"/api/agents/{agent_id}")
        assert response.status_code == 404

    async def test_trade_execution_flow(self, client):
        """测试交易执行流程"""
        # 1. 创建AI
        agent_response = await client.post("/api/agents", json={
            "name": "交易测试AI",
            "initial_capital": 500000
        })
        agent_id = agent_response.json()["data"]["id"]

        # 2. 执行买入
        trade_response = await client.post("/api/trades", json={
            "agent_id": agent_id,
            "symbol": "000001.SZ",
            "action": "buy",
            "quantity": 100
        })
        assert trade_response.status_code == 200
        trade_id = trade_response.json()["data"]["trade_id"]

        # 3. 查询持仓
        portfolio_response = await client.get(f"/api/portfolio/{agent_id}")
        assert portfolio_response.status_code == 200
        positions = portfolio_response.json()["data"]["positions"]
        assert len(positions) == 1
        assert positions[0]["symbol"] == "000001.SZ"

        # 4. 查询交易历史
        trades_response = await client.get(f"/api/trades?agent_id={agent_id}")
        assert trades_response.status_code == 200
        trades = trades_response.json()["data"]["items"]
        assert any(t["trade_id"] == trade_id for t in trades)

        # 5. 执行卖出
        sell_response = await client.post("/api/trades", json={
            "agent_id": agent_id,
            "symbol": "000001.SZ",
            "action": "sell",
            "quantity": 100
        })
        assert sell_response.status_code == 200

        # 6. 验证持仓清空
        portfolio_response = await client.get(f"/api/portfolio/{agent_id}")
        positions = portfolio_response.json()["data"]["positions"]
        assert len(positions) == 0
```

### 3.2 业务流程测试

```python
# tests/integration/test_workflows/test_trade_flow.py
import pytest
from datetime import datetime, timedelta


class TestTradeFlow:
    """交易业务流程测试"""

    async def test_end_to_end_trade_with_ai_decision(self, client, mock_market_data):
        """端到端测试：AI决策→用户确认→交易执行→持仓更新"""
        # 1. 创建AI
        agent = await create_test_agent(client)

        # 2. 获取AI决策（Mock AI响应买入）
        with mock_ai_decision({
            "action": "buy",
            "symbol": "000001.SZ",
            "quantity": 500,
            "confidence": 0.75
        }):
            decision_response = await client.post(f"/api/agents/{agent.id}/decide")

        decision = decision_response.json()["data"]
        assert decision["action"] == "buy"

        # 3. 执行交易（模拟用户确认）
        trade_response = await client.post("/api/trades", json={
            "agent_id": agent.id,
            "symbol": decision["symbol"],
            "action": decision["action"],
            "quantity": decision["quantity"]
        })
        assert trade_response.status_code == 200

        # 4. 验证持仓更新
        portfolio = await get_portfolio(client, agent.id)
        position = next(p for p in portfolio["positions"] if p["symbol"] == "000001.SZ")
        assert position["quantity"] == 500

        # 5. 验证Token统计
        token_stats = await get_token_stats(client, agent.id)
        assert token_stats["total_cost"] > 0

    async def test_position_limit_enforcement(self, client):
        """测试仓位限制执行"""
        # 创建AI，设置30%仓位限制
        agent = await create_test_agent(client, strategy={
            "position_limit": "30%"
        })

        # 先买入25%仓位
        await client.post("/api/trades", json={
            "agent_id": agent.id,
            "symbol": "000001.SZ",
            "action": "buy",
            "quantity": 10000  # 约25%仓位
        })

        # 尝试再买10%，应失败
        response = await client.post("/api/trades", json={
            "agent_id": agent.id,
            "symbol": "000001.SZ",
            "action": "buy",
            "quantity": 4000  # 再加10%会超30%
        })
        assert response.status_code == 400
        assert response.json()["code"] == "2004"

    async def test_stop_loss_execution(self, client, mock_price_change):
        """测试止损执行"""
        # 创建AI，设置8%止损
        agent = await create_test_agent(client, strategy={
            "stop_loss": "8%"
        })

        # 买入股票，成本10元
        await client.post("/api/trades", json={
            "agent_id": agent.id,
            "symbol": "000001.SZ",
            "action": "buy",
            "quantity": 1000
        })

        # Mock 股价跌到9元（跌10%）
        with mock_price_change("000001.SZ", 9.0):
            # AI 应建议卖出（止损）
            decision = await client.post(f"/api/agents/{agent.id}/decide")
            assert decision.json()["data"]["action"] == "sell"

            # 执行卖出
            await client.post("/api/trades", json={
                "agent_id": agent.id,
                "symbol": "000001.SZ",
                "action": "sell",
                "quantity": 1000
            })

        # 验证持仓清空
        portfolio = await get_portfolio(client, agent.id)
        assert len(portfolio["positions"]) == 0
```

### 3.3 WebSocket 测试

```python
# tests/integration/test_websocket.py
import pytest
import asyncio
import websockets
import json


class TestWebSocket:
    """WebSocket 集成测试"""

    @pytest.fixture
    async def websocket(self):
        """WebSocket 连接"""
        async with websockets.connect("ws://localhost:8000/ws/market") as ws:
            yield ws

    async def test_heartbeat_mechanism(self, websocket):
        """测试心跳机制"""
        # 等待服务端ping
        message = await asyncio.wait_for(websocket.recv(), timeout=20)
        data = json.loads(message)
        assert data["type"] == "ping"

        # 回复pong
        await websocket.send(json.dumps({
            "type": "pong",
            "timestamp": data["timestamp"]
        }))

    async def test_subscribe_and_receive_quotes(self, websocket):
        """测试订阅和接收行情"""
        # 订阅股票
        await websocket.send(json.dumps({
            "action": "subscribe",
            "symbols": ["000001.SZ"]
        }))

        # 等待行情推送
        message = await asyncio.wait_for(websocket.recv(), timeout=10)
        data = json.loads(message)

        if data["type"] == "ping":
            # 先回复心跳
            await websocket.send(json.dumps({
                "type": "pong",
                "timestamp": data["timestamp"]
            }))
            # 再次等待行情
            message = await asyncio.wait_for(websocket.recv(), timeout=10)
            data = json.loads(message)

        assert data["type"] == "quote_update"
        assert any(q["symbol"] == "000001.SZ" for q in data["data"])

    async def test_reconnect_data_recovery(self, websocket):
        """测试重连数据恢复"""
        # 订阅股票
        await websocket.send(json.dumps({
            "action": "subscribe",
            "symbols": ["000001.SZ"]
        }))

        # 等待接收一些数据
        await asyncio.sleep(2)

        # 模拟断开重连
        await websocket.close()
        await asyncio.sleep(1)

        # 重新连接
        async with websockets.connect("ws://localhost:8000/ws/market") as new_ws:
            # 重新订阅
            await new_ws.send(json.dumps({
                "action": "subscribe",
                "symbols": ["000001.SZ"]
            }))

            # 应收到批量补偿数据
            message = await asyncio.wait_for(new_ws.recv(), timeout=5)
            data = json.loads(message)

            if data["type"] == "batch_update":
                assert "data" in data
                assert len(data["data"]) > 0
```

---

## 4. 性能测试基准

### 4.1 API 性能指标

| 指标 | 目标值 | 测试方法 |
|------|--------|---------|
| API 响应时间（P95） | < 200ms | 压测1000次请求 |
| 交易执行时间 | < 500ms | 包含数据库写入 |
| AI 决策调用 | < 5s | 包含LLM响应 |
| 数据库查询 | < 50ms | 单表查询 |

### 4.2 WebSocket 性能指标

| 指标 | 目标值 | 测试方法 |
|------|--------|---------|
| 推送延迟 | < 1s | 行情更新到推送 |
| 重连时间 | < 3s | 断开到恢复 |
| 内存占用 | < 100MB | 单连接 |

### 4.3 性能测试脚本

```python
# tests/performance/test_api_performance.py
import asyncio
import time
import statistics
from httpx import AsyncClient
import pytest


class TestAPIPerformance:
    """API 性能测试"""

    async def test_agent_list_response_time(self, client):
        """测试AI列表接口响应时间"""
        times = []

        for _ in range(100):
            start = time.time()
            response = await client.get("/api/agents")
            elapsed = (time.time() - start) * 1000  # ms
            times.append(elapsed)
            assert response.status_code == 200

        p95 = statistics.quantiles(times, n=20)[18]  # 95分位
        avg = statistics.mean(times)

        print(f"\nAgent List API:")
        print(f"  Average: {avg:.2f}ms")
        print(f"  P95: {p95:.2f}ms")

        assert p95 < 200, f"P95 response time {p95}ms exceeds 200ms"

    async def test_concurrent_trades(self, client):
        """测试并发交易执行"""
        agent = await create_test_agent(client)

        async def execute_trade(n):
            start = time.time()
            response = await client.post("/api/trades", json={
                "agent_id": agent.id,
                "symbol": f"{n:06d}.SZ",
                "action": "buy",
                "quantity": 100
            })
            elapsed = (time.time() - start) * 1000
            return response.status_code == 200, elapsed

        # 10个并发交易
        start = time.time()
        results = await asyncio.gather(*[execute_trade(i) for i in range(10)])
        total_time = (time.time() - start) * 1000

        success_count = sum(1 for success, _ in results if success)
        times = [t for _, t in results]

        print(f"\nConcurrent Trades (10):")
        print(f"  Success: {success_count}/10")
        print(f"  Total time: {total_time:.2f}ms")
        print(f"  Avg per trade: {statistics.mean(times):.2f}ms")

        assert success_count == 10
        assert total_time < 3000, "Concurrent trades too slow"
```

---

## 5. 测试数据准备

### 5.1 测试数据工厂

```python
# tests/fixtures/agents.py
import pytest
from uuid import uuid4
from decimal import Decimal

from core.domain.models import Agent, Strategy
from core.domain.enums import AgentLevel, IncentiveLevel


class AgentFactory:
    """AI交易员测试数据工厂"""

    @staticmethod
    def create(
        name="测试AI",
        initial_capital=500000,
        agent_level=AgentLevel.INTERN,
        incentive_level=IncentiveLevel.STANDARD,
        **kwargs
    ):
        return Agent(
            id=str(uuid4()),
            name=name,
            initial_capital=Decimal(str(initial_capital)),
            current_capital=Decimal(str(initial_capital)),
            strategy=StrategyFactory.create(),
            agent_level=agent_level,
            incentive_level=incentive_level,
            status="active",
            **kwargs
        )

    @staticmethod
    def batch_create(count=5):
        return [AgentFactory.create(name=f"测试AI-{i}") for i in range(count)]


class StrategyFactory:
    """策略测试数据工厂"""

    @staticmethod
    def create(
        risk_tolerance="稳健",
        sectors=None,
        holding_period="中期",
        position_limit="30%",
        stop_loss="8%",
        market_scope="主板+创业板"
    ):
        return Strategy(
            risk_tolerance=risk_tolerance,
            sectors=sectors or ["科技", "消费"],
            holding_period=holding_period,
            position_limit=position_limit,
            stop_loss=stop_loss,
            market_scope=market_scope
        )
```

### 5.2 Mock 数据

```python
# tests/fixtures/quotes.py
MOCK_QUOTES = {
    "000001.SZ": {
        "symbol": "000001.SZ",
        "name": "平安银行",
        "price": 13.20,
        "open": 13.00,
        "high": 13.35,
        "low": 12.95,
        "prev_close": 13.05,
        "change": 0.15,
        "change_percent": 1.15,
        "volume": 1520000,
        "amount": 20060000
    },
    "000002.SZ": {
        "symbol": "000002.SZ",
        "name": "万科A",
        "price": 15.80,
        "open": 15.60,
        "high": 15.95,
        "low": 15.50,
        "prev_close": 15.75,
        "change": 0.05,
        "change_percent": 0.32,
        "volume": 850000,
        "amount": 13430000
    }
}

MOCK_AI_DECISIONS = {
    "buy": {
        "action": "buy",
        "symbol": "000001.SZ",
        "quantity": 500,
        "confidence": 0.75,
        "reason": "银行股估值修复，技术面突破"
    },
    "hold": {
        "action": "hold",
        "symbol": None,
        "quantity": None,
        "confidence": 0.60,
        "reason": "持仓表现平稳，继续观察"
    },
    "sell": {
        "action": "sell",
        "symbol": "000001.SZ",
        "quantity": 500,
        "confidence": 0.80,
        "reason": "触及止损线，严格执行止损"
    }
}
```

---

## 6. CI/CD 集成

### 6.1 GitHub Actions 配置

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'

    - name: Install dependencies
      run: |
        pip install -r requirements.txt
        pip install -r requirements-test.txt

    - name: Run unit tests
      run: |
        pytest tests/unit -v --cov=src --cov-report=xml

    - name: Run integration tests
      run: |
        pytest tests/integration -v --cov=src --cov-append

    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml
```

---

*本文档与 IMPLEMENTATION_PLAN.md 测试任务关联*
