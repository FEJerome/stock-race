import argparse
import hashlib
import importlib.metadata as importlib_metadata
import json
import math
import re
import sys
import time
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

import pandas as pd

START = "2024-01-02"
END = "2024-12-31"
START_COMPACT = "20240102"
END_COMPACT = "20241231"
COMPARE_DATES = (START, END)


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
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if value is pd.NA:
        return None
    return value


def dump_json(path, value):
    path.write_text(
        json.dumps(jsonable(value), ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def sha256_file(path):
    return sha256_bytes(path.read_bytes())


def sanitize_error(exc):
    text = f"{type(exc).__name__}: {exc}"[:4000]
    return re.sub(
        r"(?i)(token|api[_-]?key|authorization|cookie|password)(\s*[=:]\s*)([^\s,;]+)",
        r"\1\2<redacted>",
        text,
    )


def layer(status, detail=None):
    return {"status": status, "detail": detail}


def records(df):
    return jsonable(df.to_dict(orient="records"))


def process_identity_items(df, expected_code):
    required = {"item", "value"}
    missing = sorted(required - set(df.columns))
    values = {}
    if not missing:
        values = {str(row["item"]): row["value"] for _, row in df.iterrows()}
    actual_code = str(values.get("基金代码", "")).strip()
    return {
        "rows": values,
        "rowCount": len(df),
        "symbolOk": actual_code == expected_code,
        "actualCode": actual_code,
        "schemaOk": not missing and bool(values),
        "schemaErrors": [f"missing columns: {missing}"] if missing else [],
        "sourceEventTimes": {},
        "identity": values,
    }


def process_filtered_identity(df, code_column, expected_code, name_column=None):
    missing = sorted({code_column} - set(df.columns))
    if missing:
        return {
            "rows": [], "rowCount": len(df), "symbolOk": False,
            "schemaOk": False, "schemaErrors": [f"missing columns: {missing}"],
            "sourceEventTimes": {},
        }
    codes = df[code_column].astype(str).str.replace(r"\.0$", "", regex=True).str.zfill(6)
    matched = df.loc[codes == expected_code]
    result = {
        "rows": records(matched),
        "rowCount": len(df),
        "matchedCount": len(matched),
        "symbolOk": len(matched) == 1,
        "schemaOk": len(matched) == 1,
        "schemaErrors": [] if len(matched) == 1 else [f"expected one {expected_code}, got {len(matched)}"],
        "sourceEventTimes": {},
    }
    if name_column and name_column in matched.columns and len(matched) == 1:
        result["identityName"] = str(matched.iloc[0][name_column])
    return result


def process_ohlc(df, mapping, expected_code, start=START, end=END):
    required = set(mapping.values())
    missing = sorted(required - set(df.columns))
    errors = []
    if missing:
        return {
            "rows": [], "rowCount": len(df), "symbolOk": False,
            "schemaOk": False, "schemaErrors": [f"missing columns: {missing}"],
            "sourceEventTimes": {},
        }
    normalized = pd.DataFrame()
    for target, source in mapping.items():
        normalized[target] = df[source]
    normalized["date"] = pd.to_datetime(normalized["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    invalid_dates = int(normalized["date"].isna().sum())
    if invalid_dates:
        errors.append(f"invalid dates: {invalid_dates}")
    normalized = normalized.loc[(normalized["date"] >= start) & (normalized["date"] <= end)].copy()
    if normalized.empty:
        errors.append("no rows in fixed interval")
    if normalized["date"].duplicated().any():
        errors.append("duplicate dates")
    numeric_columns = [c for c in ("open", "high", "low", "close", "volume", "amount") if c in normalized]
    for column in numeric_columns:
        raw_nonblank = normalized[column].notna() & (normalized[column].astype(str).str.strip() != "")
        converted = pd.to_numeric(normalized[column], errors="coerce")
        invalid = raw_nonblank & converted.isna()
        if invalid.any():
            errors.append(f"invalid {column}: {int(invalid.sum())}")
        normalized[column] = converted
    if "code" in normalized:
        codes = set(normalized["code"].dropna().astype(str))
        symbol_ok = codes == {expected_code}
        if not symbol_ok:
            errors.append(f"codes: {sorted(codes)[:10]}")
    else:
        symbol_ok = True
    for column in ("open", "high", "low", "close"):
        if column in normalized:
            valid = normalized[column].dropna()
            if (valid < 0).any():
                errors.append(f"negative {column}")
    if all(c in normalized for c in ("open", "high", "low", "close")):
        complete = normalized.dropna(subset=["open", "high", "low", "close"])
        bad_high = complete["high"] < complete[["open", "close", "low"]].max(axis=1)
        bad_low = complete["low"] > complete[["open", "close", "high"]].min(axis=1)
        if bad_high.any() or bad_low.any():
            errors.append(f"OHLC bounds failures: {int((bad_high | bad_low).sum())}")
    return {
        "rows": records(normalized),
        "rowCount": len(df),
        "fixedIntervalRowCount": len(normalized),
        "symbolOk": symbol_ok and not normalized.empty,
        "schemaOk": not errors,
        "schemaErrors": errors,
        "sourceEventTimes": {
            "field": mapping["date"],
            "min": normalized["date"].min() if not normalized.empty else None,
            "max": normalized["date"].max() if not normalized.empty else None,
        },
    }


def process_nav(df, value_column):
    required = {"净值日期", value_column}
    missing = sorted(required - set(df.columns))
    if missing:
        return {
            "rows": [], "rowCount": len(df), "symbolOk": False,
            "schemaOk": False, "schemaErrors": [f"missing columns: {missing}"],
            "sourceEventTimes": {},
        }
    normalized = pd.DataFrame({
        "date": pd.to_datetime(df["净值日期"], errors="coerce").dt.strftime("%Y-%m-%d"),
        "value": pd.to_numeric(df[value_column], errors="coerce"),
    })
    errors = []
    if normalized["date"].isna().any() or normalized["value"].isna().any():
        errors.append("invalid NAV date/value")
    if normalized["date"].duplicated().any():
        errors.append("duplicate NAV dates")
    fixed = normalized.loc[(normalized["date"] >= START) & (normalized["date"] <= END)].copy()
    latest = normalized["date"].max() if not normalized.empty else None
    return {
        "rows": records(fixed),
        "rowCount": len(df),
        "fixedIntervalRowCount": len(fixed),
        "symbolOk": not fixed.empty,
        "schemaOk": not errors and not fixed.empty,
        "schemaErrors": errors,
        "latestVisibleNavDateAtCollection": latest,
        "publishedAtPresent": "publishedAt" in df.columns,
        "sourceEventTimes": {"field": "净值日期", "min": normalized["date"].min(), "max": latest},
    }


def process_dividend(df, date_column):
    required = {date_column}
    missing = sorted(required - set(df.columns))
    if missing:
        return {
            "rows": [], "rowCount": len(df), "symbolOk": False,
            "schemaOk": False, "schemaErrors": [f"missing columns: {missing}"],
            "sourceEventTimes": {},
        }
    result = df.copy()
    result[date_column] = pd.to_datetime(result[date_column], errors="coerce").dt.strftime("%Y-%m-%d")
    fixed = result.loc[(result[date_column] >= START) & (result[date_column] <= END)].copy()
    return {
        "rows": records(fixed),
        "rowCount": len(df),
        "fixedIntervalRowCount": len(fixed),
        "symbolOk": not fixed.empty,
        "schemaOk": result[date_column].notna().all(),
        "schemaErrors": [] if result[date_column].notna().all() else ["invalid event date"],
        "publishedAtPresent": "publishedAt" in df.columns,
        "sourceEventTimes": {"field": date_column, "min": result[date_column].min(), "max": result[date_column].max()},
    }


def process_calendar(df):
    required = {"calendar_date", "is_trading_day"}
    missing = sorted(required - set(df.columns))
    if missing:
        return {
            "rows": [], "rowCount": len(df), "symbolOk": False,
            "schemaOk": False, "schemaErrors": [f"missing columns: {missing}"],
            "sourceEventTimes": {},
        }
    result = df.copy()
    result["calendar_date"] = pd.to_datetime(result["calendar_date"], errors="coerce").dt.strftime("%Y-%m-%d")
    result["is_trading_day"] = pd.to_numeric(result["is_trading_day"], errors="coerce")
    valid_values = set(result["is_trading_day"].dropna().unique()).issubset({0, 1})
    by_date = dict(zip(result["calendar_date"], result["is_trading_day"]))
    value_checks = {
        "2024-01-01_is_non_trading": by_date.get("2024-01-01") == 0,
        "2024-01-02_is_trading": by_date.get("2024-01-02") == 1,
        "2024-01-06_is_non_trading": by_date.get("2024-01-06") == 0,
    }
    return {
        "rows": records(result), "rowCount": len(df), "symbolOk": not result.empty,
        "schemaOk": result["calendar_date"].notna().all() and valid_values,
        "schemaErrors": [] if valid_values else ["invalid is_trading_day"],
        "valueChecks": value_checks,
        "sourceEventTimes": {"field": "calendar_date", "min": result["calendar_date"].min(), "max": result["calendar_date"].max()},
    }


class Runner:
    def __init__(self, evidence, script_path):
        self.evidence = evidence
        self.script_path = script_path
        self.manifest = {
            "runId": evidence.parent.name,
            "startedAt": now_iso(),
            "python": sys.version,
            "script": {"path": str(script_path), "sha256": sha256_file(script_path)},
            "packages": self.package_versions(),
            "fixedInterval": {"start": START, "end": END},
            "comparisonDates": list(COMPARE_DATES),
            "probes": [],
            "connections": [],
            "comparisons": [],
            "notes": [
                "No retries or synthetic fallback. Each library call is recorded independently.",
                "Raw capture is the library-returned table serialized locally, not the upstream HTTP payload.",
                "No real-time quote ranking is performed.",
            ],
        }
        self.results = {}
        self.save()

    @staticmethod
    def package_versions():
        result = {}
        for package in ("akshare", "baostock", "pandas", "numpy", "requests"):
            try:
                result[package] = importlib_metadata.version(package)
            except importlib_metadata.PackageNotFoundError:
                result[package] = None
        return result

    def save(self):
        dump_json(self.evidence / "manifest.json", self.manifest)

    def call(self, probe_id, source, interface, category, asset, request, func, processor):
        started = now_iso()
        started_mono = time.monotonic()
        call_dir = self.evidence / "calls" / f"{len(self.manifest['probes']) + 1:02d}-{probe_id}"
        call_dir.mkdir(parents=True, exist_ok=False)
        entry = {
            "id": probe_id, "source": source, "interface": interface,
            "category": category, "asset": asset, "request": request,
            "libraryVersion": self.manifest["packages"].get(source),
            "startedAt": started, "endedAt": None,
            "layers": {
                "call": layer("pending"),
                "nonemptySymbols": layer("pending"),
                "schema": layer("pending"),
                "value": layer("unverified", "awaiting independent comparison or reference"),
            },
        }
        try:
            df = func()
            if not isinstance(df, pd.DataFrame):
                raise TypeError(f"expected DataFrame, got {type(df).__name__}")
            raw_bytes = df.to_csv(index=False).encode("utf-8")
            (call_dir / "raw.csv").write_bytes(raw_bytes)
            raw_meta = {
                "format": "library DataFrame to UTF-8 CSV",
                "columns": list(df.columns),
                "dtypes": {k: str(v) for k, v in df.dtypes.items()},
                "shape": list(df.shape),
                "responseMeta": getattr(df, "attrs", {}).get("responseMeta"),
                "rawHash": sha256_bytes(raw_bytes),
            }
            dump_json(call_dir / "raw-meta.json", raw_meta)
            processed = processor(df)
            dump_json(call_dir / "normalized.json", processed)
            self.results[probe_id] = processed
            entry["rowCount"] = len(df)
            entry["sourceEventTimes"] = processed.get("sourceEventTimes", {})
            entry["derived"] = {
                k: v for k, v in processed.items()
                if k in ("fixedIntervalRowCount", "latestVisibleNavDateAtCollection", "publishedAtPresent", "valueChecks", "matchedCount", "identityName")
            }
            entry["raw"] = {"path": str((call_dir / "raw.csv").relative_to(self.evidence)), "sha256": raw_meta["rawHash"]}
            entry["layers"]["call"] = layer("pass")
            entry["layers"]["nonemptySymbols"] = layer(
                "pass" if len(df) > 0 and processed.get("symbolOk") else "fail",
                {"rowCount": len(df), "symbolOk": processed.get("symbolOk")},
            )
            entry["layers"]["schema"] = layer(
                "pass" if processed.get("schemaOk") else "fail",
                processed.get("schemaErrors"),
            )
            if processed.get("valueChecks"):
                checks = processed["valueChecks"]
                entry["layers"]["value"] = layer("pass" if all(checks.values()) else "fail", checks)
        except Exception as exc:
            error = sanitize_error(exc)
            dump_json(call_dir / "error.json", {"error": error, "request": request})
            entry["error"] = error
            entry["layers"]["call"] = layer("fail", error)
            entry["layers"]["nonemptySymbols"] = layer("fail", "no usable result")
            entry["layers"]["schema"] = layer("fail", "no usable result")
            entry["layers"]["value"] = layer("unverified", "call failed")
        entry["endedAt"] = now_iso()
        entry["durationSeconds"] = round(time.monotonic() - started_mono, 6)
        self.manifest["probes"].append(entry)
        self.save()
        print(json.dumps({"id": probe_id, "layers": entry["layers"], "rowCount": entry.get("rowCount")}, ensure_ascii=False), flush=True)
        return entry

    def connection(self, source, action, func):
        started = now_iso()
        started_mono = time.monotonic()
        event = {"source": source, "action": action, "startedAt": started}
        try:
            response = func()
            event["response"] = {
                "error_code": getattr(response, "error_code", None),
                "error_msg": getattr(response, "error_msg", None),
            }
            event["success"] = event["response"]["error_code"] in (None, "0")
        except Exception as exc:
            event["success"] = False
            event["error"] = sanitize_error(exc)
        event["endedAt"] = now_iso()
        event["durationSeconds"] = round(time.monotonic() - started_mono, 6)
        self.manifest["connections"].append(event)
        self.save()
        return event["success"]

    def compare(self, left_id, right_id, label):
        comparison = {"label": label, "left": left_id, "right": right_id, "dates": {}}
        left = self.results.get(left_id, {}).get("rows", [])
        right = self.results.get(right_id, {}).get("rows", [])
        left_by_date = {row["date"]: row for row in left}
        right_by_date = {row["date"]: row for row in right}
        comparison_possible = bool(left and right)
        all_ohlc_match = comparison_possible
        missing_comparison_date = False
        for current_date in COMPARE_DATES:
            lrow = left_by_date.get(current_date)
            rrow = right_by_date.get(current_date)
            item = {"leftPresent": lrow is not None, "rightPresent": rrow is not None}
            if lrow and rrow:
                fields = {}
                for field in ("open", "high", "low", "close"):
                    try:
                        equal = Decimal(str(lrow[field])) == Decimal(str(rrow[field]))
                    except (InvalidOperation, KeyError):
                        equal = False
                    fields[field] = {"left": lrow.get(field), "right": rrow.get(field), "equal": equal}
                item["ohlc"] = fields
                item["allOhlcEqual"] = all(v["equal"] for v in fields.values())
                item["volume"] = {"left": lrow.get("volume"), "right": rrow.get("volume"), "unitVerified": False}
                item["amount"] = {"left": lrow.get("amount"), "right": rrow.get("amount")}
                all_ohlc_match = all_ohlc_match and item["allOhlcEqual"]
            else:
                missing_comparison_date = True
            comparison["dates"][current_date] = item
        if not comparison_possible or missing_comparison_date:
            comparison["status"] = "unverified"
        else:
            comparison["status"] = "pass" if all_ohlc_match else "fail"
        comparison["valueScope"] = "OHLC only on two fixed dates; volume/amount units not independently verified"
        self.manifest["comparisons"].append(comparison)
        for probe_id in (left_id, right_id):
            entry = next((p for p in self.manifest["probes"] if p["id"] == probe_id), None)
            if entry:
                entry["layers"]["value"] = layer(comparison["status"], {"comparison": label})
        self.save()


def bs_query(bs, method, **kwargs):
    response = getattr(bs, method)(**kwargs)
    meta = {
        "error_code": getattr(response, "error_code", None),
        "error_msg": getattr(response, "error_msg", None),
        "fields": getattr(response, "fields", None),
    }
    if meta["error_code"] != "0":
        raise RuntimeError(f"Baostock {method} error {meta['error_code']}: {meta['error_msg']}")
    df = response.get_data()
    df.attrs["responseMeta"] = meta
    return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", required=True, type=Path)
    args = parser.parse_args()
    evidence = args.evidence.resolve()
    if not evidence.is_dir() or any(evidence.iterdir()):
        raise RuntimeError("evidence directory must already exist and be empty")
    runner = Runner(evidence, Path(__file__).resolve())

    import akshare as ak
    import baostock as bs

    asset_fund = {"code": "110011", "expectedType": "ordinary open-end fund"}
    asset_etf = {"code": "510300", "expectedType": "exchange-traded equity ETF; T+1 requires separate rule evidence"}
    asset_index = {"code": "000300", "expectedType": "index; return series type must be explicit"}
    asset_stock = {"code": "sh.600519", "expectedType": "A-share stock"}

    fund_identity = runner.call(
        "ak-fund-identity", "akshare", "fund_individual_basic_info_xq", "current-metadata",
        asset_fund, {"symbol": "110011", "timeout": 20},
        lambda: ak.fund_individual_basic_info_xq(symbol="110011", timeout=20),
        lambda df: process_identity_items(df, "110011"),
    )
    if fund_identity["layers"]["nonemptySymbols"]["status"] != "pass":
        runner.call(
            "ak-fund-identity-alt", "akshare", "fund_open_fund_daily_em", "current-metadata-fund-list",
            asset_fund, {"filter": "基金代码=110011", "reason": "primary identity did not return a usable match"},
            lambda: ak.fund_open_fund_daily_em(),
            lambda df: process_filtered_identity(df, "基金代码", "110011", "基金名称"),
        )
    runner.call(
        "ak-fund-unit-nav", "akshare", "fund_open_fund_info_em", "historical-nav",
        asset_fund, {"symbol": "110011", "indicator": "单位净值走势", "sourceRange": "full returned history", "localFilter": [START, END]},
        lambda: ak.fund_open_fund_info_em(symbol="110011", indicator="单位净值走势"),
        lambda df: process_nav(df, "单位净值"),
    )
    runner.call(
        "ak-fund-cumulative-nav", "akshare", "fund_open_fund_info_em", "historical-nav",
        asset_fund, {"symbol": "110011", "indicator": "累计净值走势", "sourceRange": "full returned history", "localFilter": [START, END]},
        lambda: ak.fund_open_fund_info_em(symbol="110011", indicator="累计净值走势"),
        lambda df: process_nav(df, "累计净值"),
    )
    runner.call(
        "ak-fund-dividends", "akshare", "fund_open_fund_info_em", "corporate-action",
        asset_fund, {"symbol": "110011", "indicator": "分红送配详情", "localDateFilter": [START, END]},
        lambda: ak.fund_open_fund_info_em(symbol="110011", indicator="分红送配详情"),
        lambda df: process_dividend(df, "除息日"),
    )
    etf_identity = runner.call(
        "ak-etf-identity", "akshare", "fund_individual_basic_info_xq", "current-metadata",
        asset_etf, {"symbol": "510300", "timeout": 20},
        lambda: ak.fund_individual_basic_info_xq(symbol="510300", timeout=20),
        lambda df: process_identity_items(df, "510300"),
    )
    if etf_identity["layers"]["nonemptySymbols"]["status"] != "pass":
        runner.call(
            "ak-etf-identity-alt", "akshare", "fund_etf_spot_em", "current-metadata-etf-list",
            asset_etf, {"filter": "代码=510300", "reason": "primary identity did not return a usable match"},
            lambda: ak.fund_etf_spot_em(),
            lambda df: process_filtered_identity(df, "代码", "510300", "名称"),
        )
    etf_mapping = {"date": "日期", "open": "开盘", "high": "最高", "low": "最低", "close": "收盘", "volume": "成交量", "amount": "成交额"}
    runner.call(
        "ak-etf-daily-raw", "akshare", "fund_etf_hist_em", "historical-daily",
        asset_etf, {"symbol": "510300", "period": "daily", "start_date": START_COMPACT, "end_date": END_COMPACT, "adjust": ""},
        lambda: ak.fund_etf_hist_em(symbol="510300", period="daily", start_date=START_COMPACT, end_date=END_COMPACT, adjust=""),
        lambda df: process_ohlc(df, etf_mapping, "510300"),
    )
    runner.call(
        "ak-etf-daily-qfq", "akshare", "fund_etf_hist_em", "historical-daily-adjusted",
        asset_etf, {"symbol": "510300", "period": "daily", "start_date": START_COMPACT, "end_date": END_COMPACT, "adjust": "qfq"},
        lambda: ak.fund_etf_hist_em(symbol="510300", period="daily", start_date=START_COMPACT, end_date=END_COMPACT, adjust="qfq"),
        lambda df: process_ohlc(df, etf_mapping, "510300"),
    )
    runner.call(
        "ak-etf-dividends", "akshare", "fund_etf_dividend_sina", "corporate-action",
        asset_etf, {"symbol": "sh510300", "documentedField": "日期=除权除息日, 累计分红"},
        lambda: ak.fund_etf_dividend_sina(symbol="sh510300"),
        lambda df: process_dividend(df, "日期"),
    )
    runner.call(
        "ak-index-identity", "akshare", "index_stock_info", "reference-metadata",
        asset_index, {"filter": "index_code=000300"},
        lambda: ak.index_stock_info(),
        lambda df: process_filtered_identity(df, "index_code", "000300", "display_name"),
    )
    index_mapping = dict(etf_mapping)
    runner.call(
        "ak-index-daily", "akshare", "index_zh_a_hist", "historical-daily",
        asset_index, {"symbol": "000300", "period": "daily", "start_date": START_COMPACT, "end_date": END_COMPACT, "returnSeriesType": "not labeled by interface"},
        lambda: ak.index_zh_a_hist(symbol="000300", period="daily", start_date=START_COMPACT, end_date=END_COMPACT),
        lambda df: process_ohlc(df, index_mapping, "000300"),
    )
    stock_mapping = dict(etf_mapping)
    stock_mapping["code"] = "股票代码"
    runner.call(
        "ak-stock-daily-raw", "akshare", "stock_zh_a_hist", "historical-daily",
        asset_stock, {"symbol": "600519", "period": "daily", "start_date": START_COMPACT, "end_date": END_COMPACT, "adjust": "", "timeout": 20},
        lambda: ak.stock_zh_a_hist(symbol="600519", period="daily", start_date=START_COMPACT, end_date=END_COMPACT, adjust="", timeout=20),
        lambda df: process_ohlc(df, stock_mapping, "600519"),
    )

    login_ok = runner.connection("baostock", "login", bs.login)
    if login_ok:
        stock_fields = "date,code,open,high,low,close,preclose,volume,amount,adjustflag,turn,tradestatus,pctChg,isST"
        common_fields = "date,code,open,high,low,close,preclose,volume,amount,adjustflag"
        bs_stock_mapping = {"date": "date", "code": "code", "open": "open", "high": "high", "low": "low", "close": "close", "volume": "volume", "amount": "amount"}
        try:
            runner.call(
                "bs-stock-basic", "baostock", "query_stock_basic", "security-master",
                asset_stock, {"code": "sh.600519"},
                lambda: bs_query(bs, "query_stock_basic", code="sh.600519"),
                lambda df: process_filtered_identity(df, "code", "sh.600519", "code_name"),
            )
            runner.call(
                "bs-stock-daily-raw", "baostock", "query_history_k_data_plus", "historical-daily",
                asset_stock, {"code": "sh.600519", "start_date": START, "end_date": END, "frequency": "d", "adjustflag": "3", "fields": stock_fields},
                lambda: bs_query(bs, "query_history_k_data_plus", code="sh.600519", fields=stock_fields, start_date=START, end_date=END, frequency="d", adjustflag="3"),
                lambda df: process_ohlc(df, bs_stock_mapping, "sh.600519"),
            )
            runner.call(
                "bs-trade-calendar-2024", "baostock", "query_trade_dates", "trading-calendar",
                {"venue": "China exchange calendar", "expectedType": "trading dates"},
                {"start_date": "2024-01-01", "end_date": END},
                lambda: bs_query(bs, "query_trade_dates", start_date="2024-01-01", end_date=END),
                process_calendar,
            )
            runner.call(
                "bs-stock-dividends-2024", "baostock", "query_dividend_data", "corporate-action",
                asset_stock, {"code": "sh.600519", "year": "2024", "yearType": "operate"},
                lambda: bs_query(bs, "query_dividend_data", code="sh.600519", year="2024", yearType="operate"),
                lambda df: process_dividend(df, "dividOperateDate"),
            )
            runner.call(
                "bs-stock-adjust-factors-2024", "baostock", "query_adjust_factor", "corporate-action-adjustment",
                asset_stock, {"code": "sh.600519", "start_date": START, "end_date": END},
                lambda: bs_query(bs, "query_adjust_factor", code="sh.600519", start_date=START, end_date=END),
                lambda df: process_dividend(df, "dividOperateDate"),
            )
            runner.call(
                "bs-etf-daily-raw", "baostock", "query_history_k_data_plus", "historical-daily-cross-check",
                asset_etf, {"code": "sh.510300", "start_date": START, "end_date": END, "frequency": "d", "adjustflag": "3", "fields": common_fields},
                lambda: bs_query(bs, "query_history_k_data_plus", code="sh.510300", fields=common_fields, start_date=START, end_date=END, frequency="d", adjustflag="3"),
                lambda df: process_ohlc(df, bs_stock_mapping, "sh.510300"),
            )
            runner.call(
                "bs-index-daily-raw", "baostock", "query_history_k_data_plus", "historical-daily-cross-check",
                asset_index, {"code": "sh.000300", "start_date": START, "end_date": END, "frequency": "d", "adjustflag": "3", "fields": common_fields},
                lambda: bs_query(bs, "query_history_k_data_plus", code="sh.000300", fields=common_fields, start_date=START, end_date=END, frequency="d", adjustflag="3"),
                lambda df: process_ohlc(df, bs_stock_mapping, "sh.000300"),
            )
        finally:
            runner.connection("baostock", "logout", bs.logout)
    else:
        runner.manifest["baostockSkipped"] = "login failed; no subsequent Baostock queries attempted"

    runner.compare("ak-stock-daily-raw", "bs-stock-daily-raw", "600519 raw OHLC")
    runner.compare("ak-etf-daily-raw", "bs-etf-daily-raw", "510300 raw OHLC")
    runner.compare("ak-index-daily", "bs-index-daily-raw", "000300 index OHLC")

    unit = runner.results.get("ak-fund-unit-nav", {})
    cumulative = runner.results.get("ak-fund-cumulative-nav", {})
    runner.manifest["fundVisibility"] = {
        "collectedAt": now_iso(),
        "latestVisibleUnitNavDate": unit.get("latestVisibleNavDateAtCollection"),
        "latestVisibleCumulativeNavDate": cumulative.get("latestVisibleNavDateAtCollection"),
        "publishedAtAvailable": bool(unit.get("publishedAtPresent") or cumulative.get("publishedAtPresent")),
        "limitation": "latest navDate in the returned table is not a publication timestamp",
    }
    runner.manifest["finishedAt"] = now_iso()
    runner.save()
    manifest_hash = sha256_file(evidence / "manifest.json")
    (evidence / "manifest.sha256").write_text(manifest_hash + "  manifest.json\n", encoding="ascii")
    print(json.dumps({"finished": True, "manifest": str(evidence / "manifest.json"), "manifestSha256": manifest_hash}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
