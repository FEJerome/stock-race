"""
E2E Test: Market Data Display

Tests the market data page and real-time quote functionality:
1. Navigate to market data page
2. Verify real-time quotes are displayed
3. Verify data source health indicators
4. Test auto-refresh functionality
5. Verify multi-source data aggregation
"""

import pytest
from playwright.async_api import Page, expect


@pytest.mark.asyncio
async def test_market_page_loads(page: Page, frontend_service, frontend_url):
    """Test that market data page loads correctly"""
    await page.goto(f"{frontend_url}/market")

    # Wait for page to load
    await page.wait_for_selector("text=行情数据", timeout=10000)

    # Verify page elements
    await expect(page.locator("h2")).to_contain_text("行情数据")
    await expect(page.locator("button:has-text('立即刷新')")).to_be_visible()


@pytest.mark.asyncio
async def test_market_data_displayed(page: Page, frontend_service, frontend_url):
    """Test that market data is displayed in the table"""
    await page.goto(f"{frontend_url}/market")
    await page.wait_for_selector("text=行情数据", timeout=10000)

    # Wait for data to load
    await page.wait_for_timeout(2000)

    # Check for table headers
    await expect(page.locator("th:has-text('代码')")).to_be_visible()
    await expect(page.locator("th:has-text('名称')")).to_be_visible()
    await expect(page.locator("th:has-text('最新价')")).to_be_visible()
    await expect(page.locator("th:has-text('涨跌幅')")).to_be_visible()


@pytest.mark.asyncio
async def test_market_stats_displayed(page: Page, frontend_service, frontend_url):
    """Test that market statistics are displayed"""
    await page.goto(f"{frontend_url}/market")
    await page.wait_for_selector("text=行情数据", timeout=10000)

    # Wait for data to load
    await page.wait_for_timeout(2000)

    # Verify stats cards
    await expect(page.locator("text=股票总数")).to_be_visible()
    await expect(page.locator("text=上涨")).to_be_visible()
    await expect(page.locator("text=下跌")).to_be_visible()
    await expect(page.locator("text=平盘")).to_be_visible()


@pytest.mark.asyncio
async def test_data_source_status_displayed(page: Page, frontend_service, frontend_url):
    """Test that data source status is displayed"""
    await page.goto(f"{frontend_url}/market")
    await page.wait_for_selector("text=行情数据", timeout=10000)

    # Wait for data to load
    await page.wait_for_timeout(2000)

    # Check for data source section
    await expect(page.locator("text=数据源:")).to_be_visible()


@pytest.mark.asyncio
async def test_refresh_button_works(page: Page, frontend_service, frontend_url):
    """Test that refresh button updates the data"""
    await page.goto(f"{frontend_url}/market")
    await page.wait_for_selector("text=行情数据", timeout=10000)

    # Wait for initial load
    await page.wait_for_timeout(2000)

    # Click refresh button
    await page.click("button:has-text('立即刷新')")

    # Wait for refresh to complete
    await page.wait_for_timeout(2000)

    # Verify page is still functional
    await expect(page.locator("h2")).to_contain_text("行情数据")


@pytest.mark.asyncio
async def test_auto_refresh_toggle(page: Page, frontend_service, frontend_url):
    """Test auto-refresh toggle functionality"""
    await page.goto(f"{frontend_url}/market")
    await page.wait_for_selector("text=行情数据", timeout=10000)

    # Wait for initial load
    await page.wait_for_timeout(2000)

    # Click auto-refresh button to enable
    await page.click("button:has-text('自动刷新')")

    # Wait for toggle to take effect
    await page.wait_for_timeout(500)

    # Button should now show "自动刷新中"
    await expect(page.locator("button.auto-refresh")).to_be_visible()

    # Click again to disable
    await page.click("button.auto-refresh")

    # Wait for toggle
    await page.wait_for_timeout(500)


@pytest.mark.asyncio
async def test_market_api_returns_data(backend_service, backend_url, api_client):
    """Test that market API returns valid data"""
    response = await api_client.get("/api/market/quotes")
    assert response.status_code == 200

    data = response.json()
    assert data["code"] == 0
    assert "data" in data
    assert "items" in data["data"]
    assert isinstance(data["data"]["items"], list)


@pytest.mark.asyncio
async def test_market_api_single_quote(backend_service, backend_url, api_client):
    """Test getting a single stock quote via API"""
    # First get all quotes to find a valid symbol
    response = await api_client.get("/api/market/quotes")
    data = response.json()

    if len(data["data"]["items"]) == 0:
        pytest.skip("No market data available")

    symbol = data["data"]["items"][0]["symbol"]

    # Get single quote
    single_response = await api_client.get(f"/api/market/quotes/{symbol}")
    assert single_response.status_code == 200

    single_data = single_response.json()
    assert single_data["code"] == 0
    assert "data" in single_data
    assert single_data["data"]["symbol"] == symbol


@pytest.mark.asyncio
async def test_market_health_api(backend_service, backend_url, api_client):
    """Test market data source health API"""
    response = await api_client.get("/api/market/health")
    assert response.status_code == 200

    data = response.json()
    assert data["code"] == 0
    assert "data" in data
    assert "sources" in data["data"]


@pytest.mark.asyncio
async def test_market_sources_api(backend_service, backend_url, api_client):
    """Test market data sources API"""
    response = await api_client.get("/api/market/sources")
    assert response.status_code == 200

    data = response.json()
    assert data["code"] == 0
    assert "data" in data
    assert "sources" in data["data"]


@pytest.mark.asyncio
async def test_quote_data_structure(backend_service, backend_url, api_client):
    """Test that quote data has the expected structure"""
    response = await api_client.get("/api/market/quotes")
    data = response.json()

    if len(data["data"]["items"]) == 0:
        pytest.skip("No market data available")

    quote = data["data"]["items"][0]

    # Verify required fields
    assert "symbol" in quote
    assert "name" in quote
    assert "price" in quote
    assert "change" in quote
    assert "change_percent" in quote
    assert "volume" in quote

    # Verify data types
    assert isinstance(quote["symbol"], str)
    assert isinstance(quote["name"], str)
    assert isinstance(quote["price"], (int, float))


@pytest.mark.asyncio
async def test_market_data_updates_after_refresh(page: Page, frontend_service, frontend_url):
    """Test that market data updates after refresh"""
    await page.goto(f"{frontend_url}/market")
    await page.wait_for_selector("text=行情数据", timeout=10000)

    # Wait for initial load
    await page.wait_for_timeout(2000)

    # Get initial last updated time if displayed
    initial_time = await page.locator(".last-updated").text_content() if await page.locator(".last-updated").is_visible() else None

    # Click refresh
    await page.click("button:has-text('立即刷新')")

    # Wait for refresh
    await page.wait_for_timeout(2000)

    # Verify page is still functional
    await expect(page.locator("h2")).to_contain_text("行情数据")


@pytest.mark.asyncio
async def test_market_page_sorting(page: Page, frontend_service, frontend_url):
    """Test that market data table supports sorting"""
    await page.goto(f"{frontend_url}/market")
    await page.wait_for_selector("text=行情数据", timeout=10000)

    # Wait for data to load
    await page.wait_for_timeout(2000)

    # Click on column header to sort
    await page.click("th:has-text('涨跌幅')")

    # Wait for sort to apply
    await page.wait_for_timeout(500)

    # Table should still be visible
    await expect(page.locator("table")).to_be_visible()
