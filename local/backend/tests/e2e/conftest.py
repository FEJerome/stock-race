"""
Playwright E2E Test Fixtures for Local AI Trading Platform

This module provides fixtures for end-to-end testing using:
- Real FastAPI backend service
- Real Vue.js frontend (built or dev server)
- Real SQLite database (isolated for tests)
- Playwright for browser automation
"""

import pytest
import pytest_asyncio
import asyncio
import subprocess
import time
import os
import signal
import sys
from typing import AsyncGenerator, Generator
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

from playwright.async_api import async_playwright, Page, Browser, BrowserContext
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import delete

from models.database import Base, AgentModel, TradeModel, PositionModel

# Test configuration
import socket

def get_free_port():
    """Get a free port on localhost"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('0.0.0.0', 0))
        return s.getsockname()[1]

TEST_BACKEND_PORT = get_free_port()
TEST_FRONTEND_PORT = get_free_port()
# Use in-memory database for E2E tests to avoid file locking issues
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def backend_url():
    """Backend URL for tests"""
    return f"http://localhost:{TEST_BACKEND_PORT}"


@pytest.fixture(scope="session")
def frontend_url():
    """Frontend URL for tests"""
    return f"http://localhost:{TEST_FRONTEND_PORT}"


@pytest_asyncio.fixture(scope="session")
async def test_database():
    """
    Create isolated test database for E2E tests.
    This database is shared across all E2E tests in the session.
    """
    # Create engine and tables (in-memory database)
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        future=True
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield TEST_DATABASE_URL

    # Cleanup
    await engine.dispose()


@pytest_asyncio.fixture(scope="session")
async def backend_service(test_database):
    """
    Start the FastAPI backend service for E2E tests.

    Uses subprocess to start uvicorn with test database.
    Yields control after service is healthy.
    """
    env = os.environ.copy()
    env["DATABASE_URL"] = test_database

    # Start backend server
    cmd = [
        sys.executable, "-m", "uvicorn",
        "main:create_app",
        "--host", "0.0.0.0",
        "--port", str(TEST_BACKEND_PORT),
        "--factory",
        "--log-level", "warning"
    ]

    process = subprocess.Popen(
        cmd,
        cwd=str(backend_dir),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Wait for server to be ready
    max_retries = 30
    for i in range(max_retries):
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"http://localhost:{TEST_BACKEND_PORT}/health",
                    timeout=2.0
                )
                if response.status_code == 200:
                    break
        except Exception:
            pass
        await asyncio.sleep(0.5)
    else:
        process.terminate()
        raise RuntimeError("Backend service failed to start")

    yield process

    # Cleanup
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


@pytest_asyncio.fixture(scope="session")
async def frontend_service(backend_service):
    """
    Start a static file server for the built frontend.

    Uses Python's built-in http.server to serve the built frontend files.
    Falls back to API-only tests if frontend is not built.
    """
    frontend_dir = backend_dir.parent / "frontend" / "dist"

    if not frontend_dir.exists():
        pytest.skip("Frontend build not found. Run 'npm run build' in frontend/")

    # Start static file server
    import http.server
    import socketserver
    import threading

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(frontend_dir), **kwargs)

        def log_message(self, format, *args):
            # Suppress logs
            pass

    # Create server in a separate thread
    server = socketserver.TCPServer(("0.0.0.0", TEST_FRONTEND_PORT), Handler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    # Wait for server to be ready
    max_retries = 10
    for i in range(max_retries):
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"http://localhost:{TEST_FRONTEND_PORT}",
                    timeout=2.0
                )
                if response.status_code == 200:
                    break
        except Exception:
            pass
        await asyncio.sleep(0.5)
    else:
        server.shutdown()
        raise RuntimeError("Frontend service failed to start")

    yield server

    # Cleanup
    server.shutdown()


@pytest_asyncio.fixture(scope="session")
async def browser():
    """
    Launch Playwright browser for E2E tests.
    Uses Chromium in headless mode by default.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,  # Set to False for debugging
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        yield browser
        await browser.close()


@pytest_asyncio.fixture
async def browser_context(browser):
    """
    Create a new browser context for each test.
    Provides isolated cookies, localStorage, etc.
    """
    context = await browser.new_context(
        viewport={"width": 1280, "height": 720},
        locale="zh-CN",
        timezone_id="Asia/Shanghai",
    )
    yield context
    await context.close()


@pytest_asyncio.fixture
async def page(browser_context):
    """
    Create a new page for each test.
    """
    page = await browser_context.new_page()
    yield page
    await page.close()


@pytest_asyncio.fixture
async def db_session(test_database) -> AsyncGenerator[AsyncSession, None]:
    """
    Create a fresh database session for each test with cleanup.
    """
    engine = create_async_engine(
        test_database,
        echo=False,
        future=True
    )

    async_session = async_sessionmaker(
        engine,
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

    await engine.dispose()


@pytest_asyncio.fixture
async def api_client(backend_service, backend_url):
    """
    Provide an HTTP client for direct API calls during tests.
    """
    import httpx
    async with httpx.AsyncClient(base_url=backend_url) as client:
        yield client


# Helper functions for tests

def generate_test_agent_name():
    """Generate unique test agent name"""
    import uuid
    return f"E2E Test Agent {uuid.uuid4().hex[:8]}"


async def wait_for_page_load(page: Page, timeout: int = 10000):
    """Wait for page to be fully loaded"""
    await page.wait_for_load_state("networkidle", timeout=timeout)


async def take_screenshot(page: Page, name: str):
    """Take a screenshot for debugging"""
    screenshot_dir = Path(__file__).parent / "screenshots"
    screenshot_dir.mkdir(exist_ok=True)
    await page.screenshot(path=str(screenshot_dir / f"{name}.png"))
