"""Shared constants for the ashare-ingest importer."""

from decimal import Decimal

from . import __version__

TOOL_VERSION = f"ashare-ingest@{__version__}"
ADJUSTMENT_FORMULA_VERSION = "adjustment-formula@1"

PRICE_SCALE = 6
QUANTITY_SCALE = 6
DIGEST_PLACEHOLDER = "sha256:" + "0" * 64

# Cross-source reconciliation tolerances (plan section 8).
VOLUME_TOLERANCE_SHARES = Decimal("100")  # 1 lot rounding tail between share/lot units
AMOUNT_TOLERANCE_YUAN = Decimal("0.5")
PRECLOSE_TOLERANCE_YUAN = Decimal("0.005")

# Conservative serial fetch pacing (plan section 3.1).
MIN_INTERVAL_WITHIN_STOCK_SECONDS = 1.0
MIN_INTERVAL_BETWEEN_STOCKS_SECONDS = 3.0
MAX_CALL_RETRIES = 3

SNAPSHOT_VERSION = "1.0.0"
OBSERVATION_KIND = "ohlcv"
VOLUME_UNIT = "share"
ADJUSTMENT_RAW = "raw"

USAGE_RESTRICTION = (
    "AKShare 数据仅学术研究用途；Baostock 数据许可未确认；"
    "本快照仅供本地模拟研究，不得公开分发"
)

# Calendar assumption recorded into the import manifest (plan section 5.6):
# Shanghai/Shenzhen share the exchange calendar in practice; the Baostock
# (Shanghai-exchange) calendar is the single calendar source for this importer.
CALENDAR_ASSUMPTION_NOTE = (
    "沪深两市交易日历实践中一致；导入器以 Baostock（上交所口径）日历为唯一日历源。"
    "若未来接入北交所或日历分叉证据出现，需按市场分拆 calendarRef。"
)
