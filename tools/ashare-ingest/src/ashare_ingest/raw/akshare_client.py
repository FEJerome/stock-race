"""AKShare fetch client (lazy import; defensive about interface renames)."""

from __future__ import annotations

from typing import Any

_SOURCE = "akshare/eastmoney"


def library_version() -> str:
    import importlib.metadata

    return importlib.metadata.version("akshare")


def _frame_to_rows(frame: Any) -> tuple[list[str], list[list[str]]]:
    header = [str(column) for column in frame.columns]
    rows: list[list[str]] = []
    for record in frame.itertuples(index=False):
        row: list[str] = []
        for value in record:
            try:
                if value is None or value != value:  # None or NaN
                    row.append("")
                    continue
            except TypeError:
                pass
            row.append(str(value))
        rows.append(row)
    return header, rows


def fetch_em_hist(symbol: str, start: str, end: str) -> tuple[list[str], list[list[str]]]:
    """Eastmoney daily bars, unadjusted (``adjust=""``). Volume unit: lots."""
    import akshare as ak

    if not hasattr(ak, "stock_zh_a_hist_em"):
        raise RuntimeError(
            "akshare.stock_zh_a_hist_em is missing (interface renamed again); "
            "pin and review the akshare version before retrying"
        )
    frame = ak.stock_zh_a_hist_em(
        symbol=symbol,
        period="daily",
        start_date=start.replace("-", ""),
        end_date=end.replace("-", ""),
        adjust="",
    )
    return _frame_to_rows(frame)


def fetch_dividend_detail(symbol: str) -> tuple[list[str], list[list[str]]]:
    import akshare as ak

    if not hasattr(ak, "stock_history_dividend_detail"):
        raise RuntimeError(
            "akshare.stock_history_dividend_detail is missing (interface renamed); "
            "pin and review the akshare version before retrying"
        )
    frame = ak.stock_history_dividend_detail(symbol=symbol, indicator="分红")
    return _frame_to_rows(frame)


__all__ = ["_SOURCE", "library_version", "fetch_em_hist", "fetch_dividend_detail"]
