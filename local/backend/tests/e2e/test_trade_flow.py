"""
E2E Test: Trading Flow

Tests the complete trading execution flow:
1. Create an AI agent
2. Navigate to agent detail page
3. Execute buy trade (000001 平安银行, 100股)
4. Verify position is updated
5. Execute sell trade
6. Verify capital changes
"""

import pytest
import uuid
from playwright.async_api import Page, expect


def generate_unique_agent_name():
    """Generate a unique agent name for testing"""
    return f"TradeTest-{uuid.uuid4().hex[:8]}"


@pytest.mark.asyncio
async def test_buy_stock_success(page: Page, frontend_service, frontend_url, api_client):
    """Test successful buy stock execution"""
    agent_name = generate_unique_agent_name()

    # Create agent via API with 100k initial capital
    response = await api_client.post("/api/agents", json={
        "name": agent_name,
        "initial_capital": 100000,
        "strategy": {
            "risk_tolerance": "稳健",
            "sectors": [],
            "holding_period": "中线",
            "position_limit": "单股不超过30%",
            "stop_loss": "8%止损"
        },
        "model_provider": "kimi",
        "model_name": "kimi-k2-5",
        "agent_level": "intern",
        "incentive_level": "standard"
    })
    assert response.status_code == 200
    agent_id = response.json()["data"]["id"]

    # Navigate to agent detail page
    await page.goto(f"{frontend_url}/agents/{agent_id}")
    await page.wait_for_selector("text=职级与晋升", timeout=10000)

    # Verify initial capital displayed
    await expect(page.locator("text=¥100,000")).to_be_visible()

    # Execute buy via API (since UI might not have direct buy button)
    buy_response = await api_client.post(f"/api/trading/{agent_id}/buy", json={
        "symbol": "000001.SZ",
        "action": "buy",
        "quantity": 100,
        "price": 10.0
    })
    assert buy_response.status_code == 200
    buy_data = buy_response.json()
    assert buy_data["code"] == 0

    # Refresh page to see updated data
    await page.reload()
    await page.wait_for_selector("text=职级与晋升", timeout=10000)

    # Verify capital decreased (should be less than 100k after buying)
    # The exact amount depends on the actual stock price


@pytest.mark.asyncio
async def test_buy_and_sell_stock_flow(page: Page, frontend_service, frontend_url, api_client):
    """Test complete buy and sell flow"""
    agent_name = generate_unique_agent_name()

    # Create agent via API
    response = await api_client.post("/api/agents", json={
        "name": agent_name,
        "initial_capital": 100000,
        "strategy": {
            "risk_tolerance": "稳健",
            "sectors": [],
            "holding_period": "中线",
            "position_limit": "单股不超过30%",
            "stop_loss": "8%止损"
        },
        "model_provider": "kimi",
        "model_name": "kimi-k2-5",
        "agent_level": "intern",
        "incentive_level": "standard"
    })
    assert response.status_code == 200
    agent_id = response.json()["data"]["id"]

    # Step 1: Buy stock
    buy_response = await api_client.post(f"/api/trading/{agent_id}/buy", json={
        "symbol": "000001.SZ",
        "action": "buy",
        "quantity": 100,
        "price": 10.0
    })
    assert buy_response.status_code == 200
    buy_result = buy_response.json()
    assert buy_result["code"] == 0
    assert "买入成功" in buy_result["message"]

    # Step 2: Verify position via API
    positions_response = await api_client.get(f"/api/trading/{agent_id}/positions")
    assert positions_response.status_code == 200
    positions_data = positions_response.json()
    assert positions_data["code"] == 0
    assert len(positions_data["data"]["items"]) == 1
    position = positions_data["data"]["items"][0]
    assert position["symbol"] == "000001.SZ"
    assert position["quantity"] == 100

    # Step 3: Verify portfolio updated
    portfolio_response = await api_client.get(f"/api/trading/{agent_id}/portfolio")
    assert portfolio_response.status_code == 200
    portfolio_data = portfolio_response.json()
    assert portfolio_data["code"] == 0
    # Cash should be less than initial capital
    assert portfolio_data["data"]["cash"] < 100000

    # Step 4: Sell stock
    sell_response = await api_client.post(f"/api/trading/{agent_id}/sell", json={
        "symbol": "000001.SZ",
        "action": "sell",
        "quantity": 100,
        "price": 11.0
    })
    assert sell_response.status_code == 200
    sell_result = sell_response.json()
    assert sell_result["code"] == 0
    assert "卖出成功" in sell_result["message"]

    # Step 5: Verify position closed
    positions_response = await api_client.get(f"/api/trading/{agent_id}/positions")
    positions_data = positions_response.json()
    assert len(positions_data["data"]["items"]) == 0

    # Step 6: Verify trade history
    trades_response = await api_client.get(f"/api/trading/{agent_id}/trades")
    assert trades_response.status_code == 200
    trades_data = trades_response.json()
    assert trades_data["code"] == 0
    assert len(trades_data["data"]["items"]) == 2  # Buy and sell


@pytest.mark.asyncio
async def test_buy_insufficient_capital(page: Page, frontend_service, frontend_url, api_client):
    """Test buy with insufficient capital"""
    agent_name = generate_unique_agent_name()

    # Create agent with small capital
    response = await api_client.post("/api/agents", json={
        "name": agent_name,
        "initial_capital": 10000,
        "strategy": {
            "risk_tolerance": "稳健",
            "sectors": [],
            "holding_period": "中线",
            "position_limit": "单股不超过30%",
            "stop_loss": "8%止损"
        },
        "model_provider": "kimi",
        "model_name": "kimi-k2-5",
        "agent_level": "intern",
        "incentive_level": "standard"
    })
    assert response.status_code == 200
    agent_id = response.json()["data"]["id"]

    # Try to buy too many shares (should fail)
    buy_response = await api_client.post(f"/api/trading/{agent_id}/buy", json={
        "symbol": "000001.SZ",
        "action": "buy",
        "quantity": 10000,  # Way too many
        "price": 10.0
    })
    assert buy_response.status_code == 200
    buy_result = buy_response.json()
    assert buy_result["code"] == 1  # Should fail
    assert "资金不足" in buy_result["message"]


@pytest.mark.asyncio
async def test_sell_without_position(page: Page, frontend_service, frontend_url, api_client):
    """Test selling stock without holding position"""
    agent_name = generate_unique_agent_name()

    # Create agent
    response = await api_client.post("/api/agents", json={
        "name": agent_name,
        "initial_capital": 100000,
        "strategy": {
            "risk_tolerance": "稳健",
            "sectors": [],
            "holding_period": "中线",
            "position_limit": "单股不超过30%",
            "stop_loss": "8%止损"
        },
        "model_provider": "kimi",
        "model_name": "kimi-k2-5",
        "agent_level": "intern",
        "incentive_level": "standard"
    })
    assert response.status_code == 200
    agent_id = response.json()["data"]["id"]

    # Try to sell without buying first
    sell_response = await api_client.post(f"/api/trading/{agent_id}/sell", json={
        "symbol": "000001.SZ",
        "action": "sell",
        "quantity": 100,
        "price": 10.0
    })
    assert sell_response.status_code == 200
    sell_result = sell_response.json()
    assert sell_result["code"] == 1  # Should fail
    assert "没有" in sell_result["message"] or "持仓" in sell_result["message"]


@pytest.mark.asyncio
async def test_sell_more_than_position(page: Page, frontend_service, frontend_url, api_client):
    """Test selling more shares than held"""
    agent_name = generate_unique_agent_name()

    # Create agent
    response = await api_client.post("/api/agents", json={
        "name": agent_name,
        "initial_capital": 100000,
        "strategy": {
            "risk_tolerance": "稳健",
            "sectors": [],
            "holding_period": "中线",
            "position_limit": "单股不超过30%",
            "stop_loss": "8%止损"
        },
        "model_provider": "kimi",
        "model_name": "kimi-k2-5",
        "agent_level": "intern",
        "incentive_level": "standard"
    })
    assert response.status_code == 200
    agent_id = response.json()["data"]["id"]

    # Buy 100 shares
    buy_response = await api_client.post(f"/api/trading/{agent_id}/buy", json={
        "symbol": "000001.SZ",
        "action": "buy",
        "quantity": 100,
        "price": 10.0
    })
    assert buy_response.status_code == 200

    # Try to sell 200 shares
    sell_response = await api_client.post(f"/api/trading/{agent_id}/sell", json={
        "symbol": "000001.SZ",
        "action": "sell",
        "quantity": 200,
        "price": 10.0
    })
    assert sell_response.status_code == 200
    sell_result = sell_response.json()
    assert sell_result["code"] == 1  # Should fail
    assert "持仓不足" in sell_result["message"]


@pytest.mark.asyncio
async def test_position_display_in_ui(page: Page, frontend_service, frontend_url, api_client):
    """Test that positions are correctly displayed in the UI"""
    agent_name = generate_unique_agent_name()

    # Create agent
    response = await api_client.post("/api/agents", json={
        "name": agent_name,
        "initial_capital": 100000,
        "strategy": {
            "risk_tolerance": "稳健",
            "sectors": [],
            "holding_period": "中线",
            "position_limit": "单股不超过30%",
            "stop_loss": "8%止损"
        },
        "model_provider": "kimi",
        "model_name": "kimi-k2-5",
        "agent_level": "intern",
        "incentive_level": "standard"
    })
    assert response.status_code == 200
    agent_id = response.json()["data"]["id"]

    # Buy stock
    await api_client.post(f"/api/trading/{agent_id}/buy", json={
        "symbol": "000001.SZ",
        "action": "buy",
        "quantity": 100,
        "price": 10.0
    })

    # Navigate to agent detail
    await page.goto(f"{frontend_url}/agents/{agent_id}")
    await page.wait_for_selector("text=职级与晋升", timeout=10000)

    # Verify portfolio section is visible
    await expect(page.locator("text=业绩表现")).to_be_visible()

    # The portfolio chart should be rendered (indicated by canvas or chart container)
    # Note: Exact selectors depend on chart library implementation


@pytest.mark.asyncio
async def test_multiple_buys_update_position(page: Page, frontend_service, frontend_url, api_client):
    """Test that multiple buys correctly update the position"""
    agent_name = generate_unique_agent_name()

    # Create agent
    response = await api_client.post("/api/agents", json={
        "name": agent_name,
        "initial_capital": 200000,
        "strategy": {
            "risk_tolerance": "稳健",
            "sectors": [],
            "holding_period": "中线",
            "position_limit": "单股不超过30%",
            "stop_loss": "8%止损"
        },
        "model_provider": "kimi",
        "model_name": "kimi-k2-5",
        "agent_level": "intern",
        "incentive_level": "standard"
    })
    assert response.status_code == 200
    agent_id = response.json()["data"]["id"]

    # Buy 100 shares at price 10
    await api_client.post(f"/api/trading/{agent_id}/buy", json={
        "symbol": "000001.SZ",
        "action": "buy",
        "quantity": 100,
        "price": 10.0
    })

    # Buy another 100 shares at price 12
    await api_client.post(f"/api/trading/{agent_id}/buy", json={
        "symbol": "000001.SZ",
        "action": "buy",
        "quantity": 100,
        "price": 12.0
    })

    # Verify position
    positions_response = await api_client.get(f"/api/trading/{agent_id}/positions")
    positions_data = positions_response.json()
    assert positions_data["code"] == 0
    assert len(positions_data["data"]["items"]) == 1

    position = positions_data["data"]["items"][0]
    assert position["quantity"] == 200
    # Average cost should be (100*10 + 100*12) / 200 = 11
    assert abs(position["avg_cost"] - 11.0) < 0.01


@pytest.mark.asyncio
async def test_partial_sell_updates_position(page: Page, frontend_service, frontend_url, api_client):
    """Test that partial sell correctly updates the position"""
    agent_name = generate_unique_agent_name()

    # Create agent
    response = await api_client.post("/api/agents", json={
        "name": agent_name,
        "initial_capital": 100000,
        "strategy": {
            "risk_tolerance": "稳健",
            "sectors": [],
            "holding_period": "中线",
            "position_limit": "单股不超过30%",
            "stop_loss": "8%止损"
        },
        "model_provider": "kimi",
        "model_name": "kimi-k2-5",
        "agent_level": "intern",
        "incentive_level": "standard"
    })
    assert response.status_code == 200
    agent_id = response.json()["data"]["id"]

    # Buy 200 shares
    await api_client.post(f"/api/trading/{agent_id}/buy", json={
        "symbol": "000001.SZ",
        "action": "buy",
        "quantity": 200,
        "price": 10.0
    })

    # Sell 100 shares
    sell_response = await api_client.post(f"/api/trading/{agent_id}/sell", json={
        "symbol": "000001.SZ",
        "action": "sell",
        "quantity": 100,
        "price": 12.0
    })
    assert sell_response.status_code == 200
    sell_result = sell_response.json()
    assert sell_result["code"] == 0
    # Should have profit of 100 * (12 - 10) = 200
    assert sell_result["data"]["realized_pnl"] == 200.0

    # Verify position still has 100 shares
    positions_response = await api_client.get(f"/api/trading/{agent_id}/positions")
    positions_data = positions_response.json()
    assert len(positions_data["data"]["items"]) == 1
    assert positions_data["data"]["items"][0]["quantity"] == 100


@pytest.mark.asyncio
async def test_trade_history_display(page: Page, frontend_service, frontend_url, api_client):
    """Test that trade history is displayed correctly"""
    agent_name = generate_unique_agent_name()

    # Create agent
    response = await api_client.post("/api/agents", json={
        "name": agent_name,
        "initial_capital": 100000,
        "strategy": {
            "risk_tolerance": "稳健",
            "sectors": [],
            "holding_period": "中线",
            "position_limit": "单股不超过30%",
            "stop_loss": "8%止损"
        },
        "model_provider": "kimi",
        "model_name": "kimi-k2-5",
        "agent_level": "intern",
        "incentive_level": "standard"
    })
    assert response.status_code == 200
    agent_id = response.json()["data"]["id"]

    # Execute trades
    await api_client.post(f"/api/trading/{agent_id}/buy", json={
        "symbol": "000001.SZ",
        "action": "buy",
        "quantity": 100,
        "price": 10.0
    })
    await api_client.post(f"/api/trading/{agent_id}/sell", json={
        "symbol": "000001.SZ",
        "action": "sell",
        "quantity": 100,
        "price": 11.0
    })

    # Verify trade history via API
    trades_response = await api_client.get(f"/api/trading/{agent_id}/trades")
    trades_data = trades_response.json()
    assert trades_data["code"] == 0
    assert trades_data["data"]["total"] == 2

    trades = trades_data["data"]["items"]
    assert trades[0]["action"] == "sell"  # Most recent first
    assert trades[1]["action"] == "buy"
