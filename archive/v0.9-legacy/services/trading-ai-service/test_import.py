"""
Test script to verify AI service imports and basic functionality.
"""

import sys
import os

# Add src directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

try:
    # Test importing main modules
    from ai_service.core.config import Settings
    print("✅ Successfully imported Settings")

    from ai_service.models.schemas import StockData, Position, AccountInfo, DecisionRequest
    print("✅ Successfully imported data models")

    from ai_service.adapters.base import BaseAdapter, AdapterFactory
    print("✅ Successfully imported adapter base classes")

    from ai_service.prompts.trading_prompts import TradingPrompts
    print("✅ Successfully imported prompt templates")

    from ai_service.services.decision_service import DecisionService
    print("✅ Successfully imported decision service")

    from ai_service.api.endpoints.decision import router as decision_router
    print("✅ Successfully imported decision API endpoints")

    from ai_service.api.endpoints.health import router as health_router
    print("✅ Successfully imported health API endpoints")

    from ai_service.utils.logger import setup_logging
    print("✅ Successfully imported logger")

    from ai_service.utils.cache import CacheManager
    print("✅ Successfully imported cache manager")

    # Test creating instances
    print("\n📋 Testing instance creation:")

    # Test settings
    settings = Settings()
    print(f"  Settings: HOST={settings.HOST}, PORT={settings.PORT}")

    # Test data models
    stock = StockData(symbol="AAPL", current_price=175.25)
    print(f"  StockData: {stock.symbol} @ ${stock.current_price}")

    position = Position(symbol="AAPL", quantity=100, avg_cost=170.50, current_price=175.25)
    print(f"  Position: {position.symbol}, Market Value: ${position.market_value:,.2f}")

    account = AccountInfo(
        account_id="test_acc",
        user_id="test_user",
        total_balance=50000.00,
        available_cash=32475.00,
        total_market_value=17525.00,
        total_unrealized_pnl=475.00,
        total_unrealized_pnl_percent=2.79,
    )
    print(f"  AccountInfo: ID={account.account_id}, Balance: ${account.total_balance:,.2f}")

    print("\n🎉 All imports and basic functionality tests passed!")

except ImportError as e:
    print(f"❌ Import error: {e}")
    print(f"Python path: {sys.path}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error during test: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)