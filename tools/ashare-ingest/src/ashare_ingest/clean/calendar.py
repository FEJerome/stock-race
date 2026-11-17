"""Trading calendar expansion from the Baostock trade-dates raw file."""

from __future__ import annotations


def trading_days(trade_date_rows: list[dict[str, str]]) -> list[str]:
    """Return sorted YYYY-MM-DD dates whose ``is_trading_day`` flag is "1"."""
    days = [row["calendar_date"] for row in trade_date_rows if row.get("is_trading_day") == "1"]
    return sorted(days)


def operate_years(start: str, end: str) -> list[int]:
    """Dividend operate years covering the inclusive [start, end] range."""
    return list(range(int(start[:4]), int(end[:4]) + 1))
