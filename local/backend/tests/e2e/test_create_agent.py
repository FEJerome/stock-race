"""
E2E Test: AI Agent Creation Flow

Tests the complete flow of creating an AI trading agent through the UI:
1. Navigate to agents page
2. Click "Create AI" button
3. Fill in agent details (name, initial capital)
4. Configure five-dimension strategy
5. Submit the form
6. Verify agent appears in the list
"""

import pytest
import uuid
from playwright.async_api import Page, expect


def generate_unique_agent_name():
    """Generate a unique agent name for testing"""
    return f"TestAgent-{uuid.uuid4().hex[:8]}"


@pytest.mark.asyncio
async def test_navigate_to_agents_page(page: Page, frontend_service, frontend_url):
    """Test navigating to the agents page"""
    await page.goto(f"{frontend_url}/agents")

    # Wait for page to load
    await page.wait_for_selector("text=AI 交易员管理", timeout=10000)

    # Verify page elements
    await expect(page.locator("h2")).to_contain_text("AI 交易员管理")
    await expect(page.locator("button:has-text('创建 AI 交易员')")).to_be_visible()


@pytest.mark.asyncio
async def test_open_create_agent_modal(page: Page, frontend_service, frontend_url):
    """Test opening the create agent modal"""
    await page.goto(f"{frontend_url}/agents")
    await page.wait_for_selector("text=AI 交易员管理", timeout=10000)

    # Click create button
    await page.click("button:has-text('创建 AI 交易员')")

    # Wait for modal to appear
    await page.wait_for_selector("text=创建 AI 交易员", timeout=5000)

    # Verify modal elements
    await expect(page.locator("text=名称 *")).to_be_visible()
    await expect(page.locator("text=初始资金 *")).to_be_visible()
    await expect(page.locator("text=策略配置")).to_be_visible()


@pytest.mark.asyncio
async def test_create_agent_with_valid_data(page: Page, frontend_service, frontend_url):
    """Test creating an agent with valid data"""
    agent_name = generate_unique_agent_name()

    await page.goto(f"{frontend_url}/agents")
    await page.wait_for_selector("text=AI 交易员管理", timeout=10000)

    # Open create modal
    await page.click("button:has-text('创建 AI 交易员')")
    await page.wait_for_selector("text=创建 AI 交易员", timeout=5000)

    # Fill in basic info
    await page.fill("input[type='text']", agent_name)

    # Fill in initial capital (10万)
    await page.fill("input[type='number']", "100000")

    # Configure strategy - Risk tolerance
    await page.select_option("select >> nth=0", "稳健")

    # Configure strategy - Holding period
    await page.select_option("select >> nth=1", "中线")

    # Fill position limit
    position_limit_input = page.locator("input[type='text']").nth(0)
    await position_limit_input.fill("单股不超过30%")

    # Fill stop loss
    stop_loss_input = page.locator("input[type='text']").nth(1)
    await stop_loss_input.fill("8%止损")

    # Submit form
    await page.click("button[type='submit']")

    # Wait for modal to close and agent to appear in list
    await page.wait_for_timeout(2000)

    # Verify agent appears in the list
    await expect(page.locator(f"text={agent_name}")).to_be_visible()


@pytest.mark.asyncio
async def test_create_agent_with_full_strategy_config(page: Page, frontend_service, frontend_url):
    """Test creating an agent with full strategy configuration"""
    agent_name = generate_unique_agent_name()

    await page.goto(f"{frontend_url}/agents")
    await page.wait_for_selector("text=AI 交易员管理", timeout=10000)

    # Open create modal
    await page.click("button:has-text('创建 AI 交易员')")
    await page.wait_for_selector("text=创建 AI 交易员", timeout=5000)

    # Fill in name
    await page.fill("input[type='text']", agent_name)

    # Fill in initial capital
    await page.fill("input[type='number']", "500000")

    # Select level
    await page.select_option("select >> nth=0", "manager")

    # Select incentive level
    await page.select_option("select >> nth=1", "active")

    # Select model
    await page.select_option("select >> nth=2", "kimi-k2-5")

    # Configure strategy - Risk tolerance
    await page.select_option("select >> nth=3", "积极")

    # Configure strategy - Holding period
    await page.select_option("select >> nth=4", "长线")

    # Select sectors (checkboxes)
    await page.check("text=科技")
    await page.check("text=金融")
    await page.check("text=医药")

    # Fill position limit
    position_limit_input = page.locator("input[type='text']").nth(0)
    await position_limit_input.fill("单股不超过25%")

    # Fill stop loss
    stop_loss_input = page.locator("input[type='text']").nth(1)
    await stop_loss_input.fill("10%止损")

    # Fill market scope
    market_scope_input = page.locator("input[type='text']").nth(2)
    await market_scope_input.fill("主板+创业板+科创板")

    # Submit form
    await page.click("button[type='submit']")

    # Wait for modal to close
    await page.wait_for_timeout(2000)

    # Verify agent appears with correct level badge
    await expect(page.locator(f"text={agent_name}")).to_be_visible()
    await expect(page.locator("text=经理").first).to_be_visible()


@pytest.mark.asyncio
async def test_create_agent_validation(page: Page, frontend_service, frontend_url):
    """Test form validation when creating an agent"""
    await page.goto(f"{frontend_url}/agents")
    await page.wait_for_selector("text=AI 交易员管理", timeout=10000)

    # Open create modal
    await page.click("button:has-text('创建 AI 交易员')")
    await page.wait_for_selector("text=创建 AI 交易员", timeout=5000)

    # Try to submit with empty name
    await page.click("button[type='submit']")

    # Form should still be visible (validation prevents submission)
    await expect(page.locator("text=创建 AI 交易员")).to_be_visible()

    # Fill name but leave capital empty
    await page.fill("input[type='text']", "Test Agent")
    await page.fill("input[type='number']", "")

    # Try to submit
    await page.click("button[type='submit']")

    # Form should still be visible
    await expect(page.locator("text=创建 AI 交易员")).to_be_visible()


@pytest.mark.asyncio
async def test_cancel_create_agent(page: Page, frontend_service, frontend_url):
    """Test canceling agent creation"""
    await page.goto(f"{frontend_url}/agents")
    await page.wait_for_selector("text=AI 交易员管理", timeout=10000)

    # Open create modal
    await page.click("button:has-text('创建 AI 交易员')")
    await page.wait_for_selector("text=创建 AI 交易员", timeout=5000)

    # Fill some data
    await page.fill("input[type='text']", "Test Agent")

    # Click cancel
    await page.click("button:has-text('取消')")

    # Modal should close
    await page.wait_for_timeout(500)

    # Verify modal is closed
    modal = page.locator("text=创建 AI 交易员").first
    await expect(modal).not_to_be_visible()


@pytest.mark.asyncio
async def test_agent_list_displays_correct_info(page: Page, frontend_service, frontend_url, api_client):
    """Test that agent list displays correct information"""
    agent_name = generate_unique_agent_name()

    # Create agent via API first
    response = await api_client.post("/api/agents", json={
        "name": agent_name,
        "initial_capital": 200000,
        "strategy": {
            "risk_tolerance": "稳健",
            "sectors": ["科技"],
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

    # Navigate to agents page
    await page.goto(f"{frontend_url}/agents")
    await page.wait_for_selector("text=AI 交易员管理", timeout=10000)

    # Verify agent is displayed with correct info
    await expect(page.locator(f"text={agent_name}")).to_be_visible()
    await expect(page.locator("text=¥200,000").first).to_be_visible()
    await expect(page.locator("text=实习生").first).to_be_visible()
    await expect(page.locator("text=运行中").first).to_be_visible()


@pytest.mark.asyncio
async def test_agent_detail_navigation(page: Page, frontend_service, frontend_url, api_client):
    """Test navigating to agent detail page"""
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

    # Navigate to agents page
    await page.goto(f"{frontend_url}/agents")
    await page.wait_for_selector("text=AI 交易员管理", timeout=10000)

    # Click on agent name to go to detail
    await page.click(f"text={agent_name}")

    # Wait for detail page to load
    await page.wait_for_selector("text=职级与晋升", timeout=10000)

    # Verify detail page elements
    await expect(page.locator("h2")).to_contain_text(agent_name)
    await expect(page.locator("text=策略配置")).to_be_visible()
    await expect(page.locator("text=业绩表现")).to_be_visible()
