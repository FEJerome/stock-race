import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

import pandas as pd


def load_helpers(path):
    spec = importlib.util.spec_from_file_location("probe_helpers", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--helpers", required=True, type=Path)
    parser.add_argument("--parent-evidence", required=True, type=Path)
    parser.add_argument("--evidence", required=True, type=Path)
    args = parser.parse_args()
    helpers_path = args.helpers.resolve()
    parent = args.parent_evidence.resolve()
    evidence = args.evidence.resolve()
    if not evidence.is_dir() or any(evidence.iterdir()):
        raise RuntimeError("supplement evidence directory must exist and be empty")
    h = load_helpers(helpers_path)
    runner = h.Runner(evidence, Path(__file__).resolve())
    runner.manifest["parentEvidence"] = {
        "path": str(parent),
        "manifestSha256": hashlib.sha256((parent / "manifest.json").read_bytes()).hexdigest(),
    }
    runner.manifest["helperScript"] = {
        "path": str(helpers_path),
        "sha256": hashlib.sha256(helpers_path.read_bytes()).hexdigest(),
    }
    runner.manifest["reason"] = [
        "110011 identity is QDII-混合, so it is not the ordinary open-end P0 sample.",
        "Failed AKShare history calls are not retried; each named same-library alternative is called once.",
        "Baostock query_stock_basic is used once each for ETF/index identity supplementation.",
    ]
    parent_manifest = json.loads((parent / "manifest.json").read_text(encoding="utf-8"))
    parent_probes = {p["id"]: p for p in parent_manifest["probes"]}
    runner.manifest["externalEvidenceReferences"] = []
    for probe_id in ("bs-stock-daily-raw", "bs-index-daily-raw"):
        probe = parent_probes[probe_id]
        normalized_path = (parent / probe["raw"]["path"]).parent / "normalized.json"
        runner.results[probe_id] = json.loads(normalized_path.read_text(encoding="utf-8"))
        runner.manifest["externalEvidenceReferences"].append({
            "id": probe_id,
            "normalizedPath": str(normalized_path),
            "rawSha256": probe["raw"]["sha256"],
        })
    runner.save()

    import akshare as ak
    import baostock as bs

    ordinary_fund = {"code": "000001", "expectedType": "ordinary open-end fund; namespace fund, not stock/index"}
    identity_entry = runner.call(
        "ak-alt-fund-identity", "akshare", "fund_individual_basic_info_xq", "current-metadata",
        ordinary_fund, {"symbol": "000001", "timeout": 20, "reason": "110011 is QDII"},
        lambda: ak.fund_individual_basic_info_xq(symbol="000001", timeout=20),
        lambda df: h.process_identity_items(df, "000001"),
    )
    identity = runner.results.get("ak-alt-fund-identity", {}).get("identity", {})
    identity_text = " ".join(str(identity.get(k, "")) for k in ("基金名称", "基金全称", "基金类型"))
    excluded = [term for term in ("QDII", "FOF", "货币", "封闭", "ETF", "LOF") if term.upper() in identity_text.upper()]
    accepted = (
        identity_entry["layers"]["nonemptySymbols"]["status"] == "pass"
        and identity.get("基金代码") == "000001"
        and bool(identity.get("基金类型"))
        and not excluded
    )
    runner.manifest["ordinaryFundClassification"] = {
        "acceptedForNavProbe": accepted,
        "excludedTermsFound": excluded,
        "identityText": identity_text,
        "rule": "matching fund identity plus fund_open_fund_info_em open-fund interface; this is not a legal product classification",
    }
    runner.save()
    if accepted:
        runner.call(
            "ak-alt-fund-unit-nav", "akshare", "fund_open_fund_info_em", "historical-nav",
            ordinary_fund, {"symbol": "000001", "indicator": "单位净值走势", "sourceRange": "full returned history", "localFilter": [h.START, h.END]},
            lambda: ak.fund_open_fund_info_em(symbol="000001", indicator="单位净值走势"),
            lambda df: h.process_nav(df, "单位净值"),
        )
        runner.call(
            "ak-alt-fund-cumulative-nav", "akshare", "fund_open_fund_info_em", "historical-nav",
            ordinary_fund, {"symbol": "000001", "indicator": "累计净值走势", "sourceRange": "full returned history", "localFilter": [h.START, h.END]},
            lambda: ak.fund_open_fund_info_em(symbol="000001", indicator="累计净值走势"),
            lambda df: h.process_nav(df, "累计净值"),
        )
        runner.call(
            "ak-alt-fund-dividends", "akshare", "fund_open_fund_info_em", "corporate-action",
            ordinary_fund, {"symbol": "000001", "indicator": "分红送配详情", "localDateFilter": [h.START, h.END]},
            lambda: ak.fund_open_fund_info_em(symbol="000001", indicator="分红送配详情"),
            lambda df: h.process_dividend(df, "除息日"),
        )
    else:
        runner.manifest["ordinaryFundSkipped"] = "identity did not meet the explicit ordinary-fund candidate rule"
        runner.save()

    daily_mapping = {"date": "date", "open": "open", "high": "high", "low": "low", "close": "close", "volume": "volume", "amount": "amount"}
    runner.call(
        "ak-alt-stock-daily-raw", "akshare", "stock_zh_a_daily", "historical-daily-alternative",
        {"code": "sh.600519", "expectedType": "A-share stock"},
        {"symbol": "sh600519", "start_date": h.START_COMPACT, "end_date": h.END_COMPACT, "adjust": "", "reason": "stock_zh_a_hist connection failed; no retry"},
        lambda: ak.stock_zh_a_daily(symbol="sh600519", start_date=h.START_COMPACT, end_date=h.END_COMPACT, adjust=""),
        lambda df: h.process_ohlc(df, daily_mapping, "600519"),
    )
    index_mapping = {"date": "date", "open": "open", "high": "high", "low": "low", "close": "close", "volume": "volume"}
    runner.call(
        "ak-alt-index-daily", "akshare", "stock_zh_index_daily", "historical-daily-alternative",
        {"code": "000300", "expectedType": "index; adjustment and return-series type not labeled"},
        {"symbol": "sh000300", "sourceRange": "full returned history", "localFilter": [h.START, h.END], "adjustmentSemantics": "no adjust parameter; unlabeled"},
        lambda: ak.stock_zh_index_daily(symbol="sh000300"),
        lambda df: h.process_ohlc(df, index_mapping, "000300"),
    )

    login_ok = runner.connection("baostock", "login", bs.login)
    if login_ok:
        try:
            runner.call(
                "bs-etf-basic", "baostock", "query_stock_basic", "security-master",
                {"code": "sh.510300", "expectedType": "ETF identity; T+1 not supplied by this interface"},
                {"code": "sh.510300"},
                lambda: h.bs_query(bs, "query_stock_basic", code="sh.510300"),
                lambda df: h.process_filtered_identity(df, "code", "sh.510300", "code_name"),
            )
            runner.call(
                "bs-index-basic", "baostock", "query_stock_basic", "security-master",
                {"code": "sh.000300", "expectedType": "index identity"},
                {"code": "sh.000300"},
                lambda: h.bs_query(bs, "query_stock_basic", code="sh.000300"),
                lambda df: h.process_filtered_identity(df, "code", "sh.000300", "code_name"),
            )
        finally:
            runner.connection("baostock", "logout", bs.logout)
    else:
        runner.manifest["baostockSkipped"] = "login failed; identity supplements not attempted"
        runner.save()

    runner.compare("ak-alt-stock-daily-raw", "bs-stock-daily-raw", "600519 raw OHLC via AKShare alternative")
    runner.compare("ak-alt-index-daily", "bs-index-daily-raw", "000300 index OHLC via AKShare alternative")
    unit = runner.results.get("ak-alt-fund-unit-nav", {})
    cumulative = runner.results.get("ak-alt-fund-cumulative-nav", {})
    available = bool(unit or cumulative)
    runner.manifest["alternativeFundVisibility"] = {
        "collectedAt": h.now_iso(),
        "latestVisibleUnitNavDate": unit.get("latestVisibleNavDateAtCollection"),
        "latestVisibleCumulativeNavDate": cumulative.get("latestVisibleNavDateAtCollection"),
        "publishedAtAvailable": bool(unit.get("publishedAtPresent") or cumulative.get("publishedAtPresent")) if available else None,
        "limitation": "latest navDate in the returned table is not a publication timestamp",
    }
    runner.manifest["finishedAt"] = h.now_iso()
    runner.save()
    manifest_hash = h.sha256_file(evidence / "manifest.json")
    (evidence / "manifest.sha256").write_text(manifest_hash + "  manifest.json\n", encoding="ascii")
    print(json.dumps({"finished": True, "manifestSha256": manifest_hash}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
