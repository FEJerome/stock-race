import argparse
import hashlib
import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import pandas as pd

START = "2024-01-02"
END = "2024-12-31"


def now_iso():
    return datetime.now().astimezone().isoformat(timespec="milliseconds")


def jsonable(value):
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    if isinstance(value, (datetime, date, pd.Timestamp)):
        return value.isoformat()
    if hasattr(value, "item") and not isinstance(value, (str, bytes)):
        try:
            return jsonable(value.item())
        except (ValueError, TypeError):
            pass
    if isinstance(value, float) and pd.isna(value):
        return None
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    root = args.evidence.resolve()
    output = args.output.resolve()
    if output.exists():
        raise RuntimeError("review output must not already exist")
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    probes = {p["id"]: p for p in manifest["probes"]}

    def raw(probe_id):
        return pd.read_csv(root / probes[probe_id]["raw"]["path"], dtype=str, keep_default_na=False)

    def normalized(probe_id):
        path = (root / probes[probe_id]["raw"]["path"]).parent / "normalized.json"
        return json.loads(path.read_text(encoding="utf-8"))

    calendar = raw("bs-trade-calendar-2024")
    trade_dates = set(calendar.loc[
        (calendar["is_trading_day"] == "1")
        & (calendar["calendar_date"] >= START)
        & (calendar["calendar_date"] <= END),
        "calendar_date",
    ])
    calendar_dates = set(calendar["calendar_date"])

    stock = raw("bs-stock-daily-raw")
    stock_dates = set(stock["date"])
    stock_extra = {}
    for column in ("preclose", "tradestatus", "isST", "adjustflag"):
        stock_extra[column] = {
            "present": column in stock.columns,
            "blankRows": int((stock[column] == "").sum()) if column in stock else None,
            "uniqueValues": sorted(set(stock[column]))[:20] if column in stock else None,
        }
    stock_numeric = stock.copy()
    for column in ("close", "preclose"):
        stock_numeric[column] = pd.to_numeric(stock_numeric[column], errors="coerce")
    stock_numeric["previousClose"] = stock_numeric["close"].shift(1)
    preclose_diff = stock_numeric.iloc[1:].loc[
        (stock_numeric["preclose"] - stock_numeric["previousClose"]).abs() > 0.000001,
        ["date", "preclose", "previousClose"],
    ]

    fund_unit = raw("ak-fund-unit-nav")
    fund_cumulative = raw("ak-fund-cumulative-nav")
    unit_dates = set(fund_unit["净值日期"])
    cumulative_dates = set(fund_cumulative["净值日期"])
    fixed_unit_dates = {d for d in unit_dates if START <= d <= END}
    fund_dividends = raw("ak-fund-dividends")
    etf_dividends = raw("ak-etf-dividends")
    stock_dividends = raw("bs-stock-dividends-2024")
    adjust_factors = raw("bs-stock-adjust-factors-2024")

    etf_raw = raw("ak-etf-daily-raw")
    etf_qfq = raw("ak-etf-daily-qfq")
    raw_by_date = etf_raw.set_index("日期")
    qfq_by_date = etf_qfq.set_index("日期")
    shared_dates = sorted(set(raw_by_date.index) & set(qfq_by_date.index))
    differences = []
    for current_date in shared_dates:
        fields = {}
        for column in ("开盘", "最高", "最低", "收盘"):
            left = Decimal(raw_by_date.at[current_date, column])
            right = Decimal(qfq_by_date.at[current_date, column])
            if left != right:
                fields[column] = {"raw": str(left), "qfq": str(right)}
        if fields:
            differences.append({"date": current_date, "fields": fields})

    comparison_volume = []
    for comparison in manifest["comparisons"]:
        if comparison["label"] != "510300 raw OHLC":
            continue
        for current_date, values in comparison["dates"].items():
            if "volume" not in values:
                continue
            left_volume = Decimal(str(values["volume"]["left"]))
            right_volume = Decimal(str(values["volume"]["right"]))
            left_amount = Decimal(str(values["amount"]["left"]))
            right_amount = Decimal(str(values["amount"]["right"]))
            comparison_volume.append({
                "date": current_date,
                "akshareVolume": str(left_volume),
                "baostockVolume": str(right_volume),
                "baostockDividedByAkshare": str(right_volume / left_volume),
                "amountExactlyEqual": left_amount == right_amount,
            })

    result = {
        "generatedAt": now_iso(),
        "sourceManifestSha256": hashlib.sha256((root / "manifest.json").read_bytes()).hexdigest(),
        "identities": {
            "fund110011": normalized("ak-fund-identity").get("identity"),
            "index000300": normalized("ak-index-identity").get("rows"),
            "stock600519": normalized("bs-stock-basic").get("rows"),
            "etf510300": "both AKShare identity calls failed; see manifest",
        },
        "stockDaily": {
            "rowCount": len(stock),
            "microstructureFields": stock_extra,
            "calendar": {
                "tradingDatesInCalendar": len(trade_dates),
                "stockDates": len(stock_dates),
                "stockDatesMissingFromTradingCalendar": sorted(stock_dates - trade_dates),
                "tradingDatesMissingFromStockSeries": sorted(trade_dates - stock_dates),
                "allStockDatesInFullCalendar": not (stock_dates - calendar_dates),
            },
            "precloseVersusPreviousRawClose": {
                "mismatchCount": len(preclose_diff),
                "mismatches": preclose_diff.to_dict(orient="records"),
                "note": "Differences may be exchange-adjusted preclose around corporate actions; they are recorded, not silently corrected.",
            },
        },
        "fundNav": {
            "unitRows": len(fund_unit),
            "cumulativeRows": len(fund_cumulative),
            "latestUnitNavDate": max(unit_dates),
            "latestCumulativeNavDate": max(cumulative_dates),
            "unitAndCumulativeDatesIdentical": unit_dates == cumulative_dates,
            "unitOnlyDates": sorted(unit_dates - cumulative_dates),
            "cumulativeOnlyDates": sorted(cumulative_dates - unit_dates),
            "fixed2024Dates": len(fixed_unit_dates),
            "fixed2024DatesNotInBaostockTradingCalendar": sorted(fixed_unit_dates - trade_dates),
            "tradingDatesWithoutUnitNav": sorted(trade_dates - fixed_unit_dates),
            "publishedAtColumns": [c for c in fund_unit.columns if "publish" in c.lower() or "发布" in c],
            "limitation": "NAV date is not a publication timestamp.",
        },
        "events": {
            "fund110011AllDividends": fund_dividends.to_dict(orient="records"),
            "fund110011DividendCountIn2024": int(((fund_dividends["除息日"] >= START) & (fund_dividends["除息日"] <= END)).sum()),
            "etf510300DividendsIn2024": etf_dividends.loc[(etf_dividends["日期"] >= START) & (etf_dividends["日期"] <= END)].to_dict(orient="records"),
            "stock600519DividendsIn2024": stock_dividends.to_dict(orient="records"),
            "stock600519AdjustFactorsIn2024": adjust_factors.to_dict(orient="records"),
        },
        "etfAdjustment": {
            "rawRows": len(etf_raw),
            "qfqRows": len(etf_qfq),
            "sameDateSet": set(etf_raw["日期"]) == set(etf_qfq["日期"]),
            "rowsWithAnyOhlcDifference": len(differences),
            "firstDifference": differences[0] if differences else None,
            "lastDifference": differences[-1] if differences else None,
            "note": "A raw/qfq difference proves different returned series only; it does not independently prove adjustment correctness.",
        },
        "etfTwoDateVolumeAmount": comparison_volume,
    }
    output.write_text(json.dumps(jsonable(result), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "sha256": hashlib.sha256(output.read_bytes()).hexdigest()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
