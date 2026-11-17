"""ashare-ingest CLI: fetch (online, opt-in) / build (offline) / verify-real (offline)."""

from __future__ import annotations

import argparse
import json
import secrets
import sys
import time
from datetime import datetime
from pathlib import Path

from . import __version__
from .clean.adjust import apply_signal_prices, compute_daily_factors
from .clean.calendar import operate_years, trading_days
from .clean.corporate_actions import map_corporate_actions
from .clean.reconcile import blocking_issues_from_report, reconcile_all
from .clean.sessions import build_sessions
from .clean.snapshot_build import (
    SourceRef,
    build_import_manifest,
    build_prepared_snapshot,
    dump_json_bytes,
    write_prepared_snapshot,
)
from .codes import normalize_code
from .config import (
    MIN_INTERVAL_BETWEEN_STOCKS_SECONDS,
    MIN_INTERVAL_WITHIN_STOCK_SECONDS,
    TOOL_VERSION,
)
from .raw import akshare_client, baostock_client
from .raw.archive import ManifestRecorder, read_csv, write_csv

SELECTION_RATIONALE = (
    "官方验收样本（Issue #46）；演示样本由当下幸存者构成，已知幸存者偏差，"
    "选股理由与日期记录于 import-manifest"
)


def _range_tag(start: str, end: str) -> str:
    if start.endswith("-01-01") and end.endswith("-12-31"):
        return f"{start[:4]}-{end[:4]}"
    return f"{start}_{end}"


class _Throttle:
    def __init__(self) -> None:
        self._last = 0.0

    def wait(self, minimum: float) -> None:
        elapsed = time.monotonic() - self._last
        if elapsed < minimum:
            time.sleep(minimum - elapsed)
        self._last = time.monotonic()


def cmd_fetch(args: argparse.Namespace) -> int:
    data_root = Path(args.data_root)
    raw_root = data_root / "raw"
    raw_root.mkdir(parents=True, exist_ok=True)
    run_id = datetime.now().astimezone().strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(2)
    run_dir = raw_root / run_id
    run_dir.mkdir(parents=True, exist_ok=False)

    codes = [normalize_code(item) for item in args.codes.split(",")]
    start, end = args.start, args.end
    tag = _range_tag(start, end)
    recorder = ManifestRecorder(import_run_id=run_id, tool_version=TOOL_VERSION)
    throttle = _Throttle()

    def capture(name: str, source: str, interface: str, library_version: str,
                params: dict, fetch) -> tuple[Path | None, int]:
        throttle.wait(MIN_INTERVAL_WITHIN_STOCK_SECONDS)
        began = time.monotonic()
        try:
            header, rows = fetch()
            target = write_csv(run_dir, f"{name}.csv", header, rows)
            recorder.record(
                name=name, source=source, interface=interface,
                library_version=library_version, params=params,
                raw_path=target, rows=len(rows), call="pass",
                notes=f"elapsed {time.monotonic() - began:.2f}s",
            )
            return target, len(rows)
        except Exception as error:  # noqa: BLE001 - evidence must record failures verbatim
            recorder.record(
                name=name, source=source, interface=interface,
                library_version=library_version, params=params,
                raw_path=None, rows=None, call="fail", error=str(error),
                notes=f"elapsed {time.monotonic() - began:.2f}s",
            )
            return None, 0

    bs = baostock_client.login()
    bs_version = baostock_client.library_version()
    ak_version = akshare_client.library_version()
    failed_stocks: list[str] = []
    try:
        # Market-level calendar: one fetch per run (identical for every stock).
        calendar_path, _rows = capture(
            f"bs-trade-dates-{tag}", baostock_client._SOURCE, "query_trade_dates", bs_version,
            {"start": start, "end": end},
            lambda: baostock_client.fetch_trade_dates(bs, start, end),
        )
        if calendar_path is None:
            raise RuntimeError("market calendar fetch failed; aborting run (see manifest)")

        for index, code in enumerate(codes):
            if index > 0:
                throttle.wait(MIN_INTERVAL_BETWEEN_STOCKS_SECONDS)
            stock_failed = False

            def stock_capture(name: str, interface: str, params: dict, fetch) -> Path | None:
                nonlocal stock_failed
                if stock_failed:
                    return None
                path, _rows = capture(name, baostock_client._SOURCE, interface, bs_version, params, fetch)
                if path is None:
                    stock_failed = True
                return path

            digits = code.digits
            stock_capture(
                f"bs-{digits}-{tag}-raw", "query_history_k_data_plus",
                {"code": code.baostock, "start": start, "end": end, "frequency": "d", "adjustflag": "3"},
                lambda c=code: baostock_client.fetch_kdata(bs, c.baostock, start, end, "3"),
            )
            stock_capture(
                f"bs-{digits}-{tag}-qfq", "query_history_k_data_plus",
                {"code": code.baostock, "start": start, "end": end, "frequency": "d", "adjustflag": "2"},
                lambda c=code: baostock_client.fetch_kdata(bs, c.baostock, start, end, "2"),
            )
            for year in operate_years(start, end):
                stock_capture(
                    f"bs-{digits}-dividend-{year}-operate", "query_dividend_data",
                    {"code": code.baostock, "year": year, "yearType": "operate"},
                    lambda c=code, y=year: baostock_client.fetch_dividend_operate(bs, c.baostock, y),
                )
            basic_json = run_dir / f"bs-{digits}-basic.json"
            if not stock_failed:
                throttle.wait(MIN_INTERVAL_WITHIN_STOCK_SECONDS)
                began = time.monotonic()
                try:
                    header, rows = baostock_client.fetch_stock_basic(bs, code.baostock)
                    basic_json.write_text(
                        json.dumps({"header": header, "rows": rows}, ensure_ascii=True, indent=2),
                        encoding="utf-8",
                    )
                    recorder.record(
                        name=f"bs-{digits}-basic", source=baostock_client._SOURCE,
                        interface="query_stock_basic", library_version=bs_version,
                        params={"code": code.baostock}, raw_path=basic_json, rows=len(rows),
                        call="pass", notes=f"elapsed {time.monotonic() - began:.2f}s",
                    )
                except Exception as error:  # noqa: BLE001
                    recorder.record(
                        name=f"bs-{digits}-basic", source=baostock_client._SOURCE,
                        interface="query_stock_basic", library_version=bs_version,
                        params={"code": code.baostock}, raw_path=None, rows=None,
                        call="fail", error=str(error), notes=f"elapsed {time.monotonic() - began:.2f}s",
                    )
                    stock_failed = True
            # AKShare cross-check source (recorded even on failure, then abort stock).
            if not stock_failed:
                path, _rows = capture(
                    f"ak-em-{digits}-{tag}-raw", akshare_client._SOURCE, "stock_zh_a_hist_em", ak_version,
                    {"symbol": digits, "start": start, "end": end, "adjust": ""},
                    lambda c=code: akshare_client.fetch_em_hist(c.akshare, start, end),
                )
                if path is None:
                    stock_failed = True
            if not stock_failed:
                path, _rows = capture(
                    f"ak-{digits}-dividend-detail", akshare_client._SOURCE, "stock_history_dividend_detail", ak_version,
                    {"symbol": digits, "indicator": "分红"},
                    lambda c=code: akshare_client.fetch_dividend_detail(c.akshare),
                )
                if path is None:
                    stock_failed = True
            if stock_failed:
                failed_stocks.append(digits)
                print(f"[fetch] stock {digits}: aborted after failed call (see manifest)", file=sys.stderr)
    finally:
        baostock_client.logout(bs)
        manifest_path = recorder.save(run_dir)
        print(f"[fetch] run id: {run_id}")
        print(f"[fetch] manifest: {manifest_path}")
    if failed_stocks:
        print(f"[fetch] FAILED stocks: {','.join(failed_stocks)}", file=sys.stderr)
        return 1
    return 0


def _stock_digits_from_manifest(run_dir: Path) -> list[str]:
    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    digits: set[str] = set()
    for call in manifest["calls"]:
        name = call.get("name") or ""
        for prefix in ("bs-", "ak-em-", "ak-"):
            if name.startswith(prefix) and name[len(prefix):len(prefix) + 6].isdigit():
                digits.add(name[len(prefix):len(prefix) + 6])
                break
    return sorted(digits)


def _read_stock_raw(run_dir: Path, digits: str, start: str, end: str) -> dict:
    tag = _range_tag(start, end)
    data: dict = {"dividend_rows": []}
    data["bs_raw_header"], data["bs_raw"] = read_csv(run_dir / f"bs-{digits}-{tag}-raw.csv")
    data["bs_qfq_header"], data["bs_qfq"] = read_csv(run_dir / f"bs-{digits}-{tag}-qfq.csv")
    for path in sorted(run_dir.glob(f"bs-{digits}-dividend-*-operate.csv")):
        _header, rows = read_csv(path)
        data["dividend_rows"].extend(rows)
    basic_payload = json.loads((run_dir / f"bs-{digits}-basic.json").read_text(encoding="utf-8"))
    basic_rows = basic_payload["rows"]
    data["basic"] = dict(zip(basic_payload["header"], basic_rows[0])) if basic_rows else {}
    data["ak_header"], data["ak_raw"] = read_csv(run_dir / f"ak-em-{digits}-{tag}-raw.csv")
    data["ak_dividend_header"], data["ak_dividend"] = read_csv(run_dir / f"ak-{digits}-dividend-detail.csv")
    return data


def cmd_build(args: argparse.Namespace) -> int:
    data_root = Path(args.data_root)
    run_dir = Path(args.raw_dir)
    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    run_id = manifest["importRunId"]

    calendar_header, calendar_rows = read_csv(
        next(run_dir.glob(f"bs-trade-dates-{_range_tag(args.start, args.end)}.csv"))
    )
    calendar = trading_days(calendar_rows)
    calendar_days = [day for day in calendar if args.start <= day <= args.end]
    session_dates = set(calendar_days)

    reports_dir = data_root / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    prepared_dir = data_root / "prepared"
    prepared_dir.mkdir(parents=True, exist_ok=True)

    report_lines: list[str] = [
        f"# Reconcile report — run {run_id}",
        "",
        f"- generated: {datetime.now().astimezone().strftime('%Y-%m-%dT%H:%M:%S%z')}",
        f"- range: {args.start} .. {args.end} ({len(calendar_days)} trading days)",
        "- method: full per-day dual-source comparison; no averaging, no shortcuts",
        "",
    ]
    blocked_any = False

    for digits in _stock_digits_from_manifest(run_dir):
        code = normalize_code(digits)
        raw = _read_stock_raw(run_dir, digits, args.start, args.end)
        basic = raw["basic"]
        ipo_date = (basic.get("ipoDate") or "").strip()
        out_date = (basic.get("outDate") or "").strip()
        status = "delisted" if (basic.get("status") or "") == "0" else "active"

        session_result = build_sessions(
            calendar_days, raw["bs_raw"], ipo_date=ipo_date, out_date=out_date,
        )
        actions, action_issues = map_corporate_actions(
            raw["dividend_rows"],
            range_start=args.start, range_end=args.end, session_dates=session_dates,
        )
        factors, factor_issues = compute_daily_factors(actions, session_result.sessions, range_end=args.end)

        report = reconcile_all(
            asset_id=code.asset_id,
            bs_rows=raw["bs_raw"], qfq_rows=raw["bs_qfq"], ak_rows=raw["ak_raw"],
            ak_dividend_rows=raw["ak_dividend"], actions=actions,
            sessions=session_result.sessions, factors=factors,
            range_start=args.start, range_end=args.end,
        )

        issues = list(session_result.issues) + action_issues + factor_issues
        issues.extend(blocking_issues_from_report(report))
        blocking = [issue for issue in issues if issue.blocking]
        conclusion = "BLOCKED" if blocking or not report.passed else "PASS"

        trading_count = sum(1 for s in session_result.sessions if s.status == "trading")
        report_lines += [
            f"## {code.asset_id} ({basic.get('code_name', digits)})",
            "",
            f"- sessions: {len(session_result.sessions)} total / {trading_count} trading / "
            f"{len(session_result.suspended_dates)} suspended / "
            f"{len(session_result.sessions) - trading_count - len(session_result.suspended_dates)} missing",
            f"- corporate actions: {len(actions)} entry(ies); factors on {sorted(factors)}",
            f"- conclusion: **{conclusion}**",
            "",
            "| check | result | detail |",
            "|---|---|---|",
        ]
        for check in report.checks:
            mark = "PASS" if check.passed else "FAIL"
            report_lines.append(f"| {check.name} | {mark} | {check.detail} |")
        if issues:
            report_lines += ["", "quality issues:", ""]
            for issue in issues:
                flag = "blocking" if issue.blocking else "warning"
                report_lines.append(f"- `{issue.code}` ({flag}): {issue.message}")
        report_lines.append("")

        if blocking or not report.passed:
            blocked_any = True
            print(f"[build] {code.asset_id}: BLOCKED — no prepared snapshot written", file=sys.stderr)
            continue

        apply_signal_prices(session_result.sessions, factors, range_end=args.end)

        stock_calls = [
            call for call in manifest["calls"]
            if call.get("rawFile") and (f"-{digits}-" in call["name"] or call["name"].startswith("bs-trade-dates"))
        ]
        raw_inputs = [
            {
                "rawFile": call["rawFile"],
                "rawSha256": call["rawSha256"],
                "source": call["source"],
                "interface": call["interface"],
                "libraryVersion": call["libraryVersion"],
                "capturedAt": call["capturedAt"],
            }
            for call in stock_calls
        ]
        library_versions = {
            call["interface"]: call["libraryVersion"] for call in manifest["calls"]
        }
        sources = [
            SourceRef("baostock", "query_trade_dates", library_versions.get("query_trade_dates", "unknown")),
            SourceRef("baostock", "query_history_k_data_plus", library_versions.get("query_history_k_data_plus", "unknown")),
            SourceRef("baostock", "query_dividend_data", library_versions.get("query_dividend_data", "unknown")),
            SourceRef("baostock", "query_stock_basic", library_versions.get("query_stock_basic", "unknown")),
            SourceRef("akshare/eastmoney", "stock_zh_a_hist_em", library_versions.get("stock_zh_a_hist_em", "unknown")),
            SourceRef("akshare/eastmoney", "stock_history_dividend_detail", library_versions.get("stock_history_dividend_detail", "unknown")),
        ]

        snapshot = build_prepared_snapshot(
            code=code, status=status, sessions=session_result.sessions, actions=actions,
            sources=sources, issues=issues, range_start=args.start, range_end=args.end,
        )
        prepared_path = write_prepared_snapshot(snapshot, prepared_dir, code, args.start, args.end)
        import_manifest = build_import_manifest(
            code=code, range_start=args.start, range_end=args.end, import_run_id=run_id,
            raw_inputs=raw_inputs,
            reconcile_report=f"reports/reconcile-{run_id}.md",
            selection_rationale=SELECTION_RATIONALE,
            selected_at=datetime.now().astimezone().strftime("%Y-%m-%d"),
        )
        manifest_path = prepared_dir / f"{prepared_path.name.replace('.prepared.json', '.import-manifest.json')}"
        manifest_path.write_bytes(dump_json_bytes(import_manifest))
        print(f"[build] {code.asset_id}: prepared -> {prepared_path}")
        print(f"[build] {code.asset_id}: import-manifest -> {manifest_path}")

    report_path = reports_dir / f"reconcile-{run_id}.md"
    report_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    print(f"[build] report: {report_path}")
    if blocked_any:
        print("[build] one or more stocks BLOCKED; exit 1", file=sys.stderr)
        return 1
    return 0


def cmd_verify_real(args: argparse.Namespace) -> int:
    data_root = Path(args.data_root)
    snapshots_root = data_root / "snapshots"
    if not snapshots_root.is_dir():
        print(f"[verify-real] no snapshots directory at {snapshots_root}", file=sys.stderr)
        return 1

    overall_ok = True
    for snapshot_dir in sorted(path for path in snapshots_root.iterdir() if path.is_dir()):
        problems: list[str] = []
        digest: str | None = None
        manifest_path = snapshot_dir / "import-manifest.json"
        snapshot_path = snapshot_dir / "snapshot.json"
        if not manifest_path.exists():
            problems.append("import-manifest.json missing")
            manifest = None
        else:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            raw_digest = manifest.get("snapshotDigest")
            # the TS materializer names the directory after the digest with ':'
            # sanitized ('sha256_<hex>') because ':' is illegal in Windows names
            if not isinstance(raw_digest, str) or snapshot_dir.name != raw_digest.replace(":", "_"):
                problems.append(
                    f"manifest snapshotDigest {raw_digest} does not match directory {snapshot_dir.name}"
                )
            else:
                digest = raw_digest
        if not snapshot_path.exists():
            problems.append("snapshot.json missing")
        elif digest is not None:
            snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
            if snapshot.get("digest") != digest:
                problems.append("snapshot.json embedded digest mismatch (rerun import-snapshot to recompute)")
        if manifest is not None:
            run_dir = data_root / "raw" / manifest["importRunId"]
            for raw_input in manifest.get("rawInputs", []):
                raw_path = run_dir / raw_input["rawFile"]
                if not raw_path.exists():
                    problems.append(f"raw input missing: {raw_path}")
                    continue
                from .raw.archive import sha256_file

                if sha256_file(raw_path) != raw_input["rawSha256"]:
                    problems.append(f"raw input hash mismatch: {raw_input['rawFile']}")
            report_path = data_root / manifest.get("reconcileReport", "")
            if not report_path.exists():
                problems.append(f"reconcile report missing: {manifest.get('reconcileReport')}")
        status = "PASS" if not problems else "FAIL"
        overall_ok = overall_ok and not problems
        print(f"[verify-real] {snapshot_dir.name}: {status}")
        for problem in problems:
            print(f"  - {problem}")
    return 0 if overall_ok else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ashare-ingest", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    fetch_parser = sub.add_parser("fetch", help="online capture into raw/<runId> (opt-in)")
    fetch_parser.add_argument("--codes", required=True, help="comma separated, e.g. 600519,601318,000858,600036")
    fetch_parser.add_argument("--start", required=True)
    fetch_parser.add_argument("--end", required=True)
    fetch_parser.add_argument("--data-root", required=True, help=".local/v3-data directory")
    fetch_parser.set_defaults(func=cmd_fetch)

    build_parser = sub.add_parser("build", help="offline clean + reconcile + prepared JSON")
    build_parser.add_argument("--raw-dir", required=True, help="raw/<runId> directory")
    build_parser.add_argument("--data-root", required=True)
    build_parser.add_argument("--start", required=True)
    build_parser.add_argument("--end", required=True)
    build_parser.set_defaults(func=cmd_build)

    verify_parser = sub.add_parser("verify-real", help="offline snapshot<->manifest<->raw chain check")
    verify_parser.add_argument("--data-root", required=True)
    verify_parser.set_defaults(func=cmd_verify_real)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
