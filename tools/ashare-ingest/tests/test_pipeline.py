"""End-to-end offline pipeline tests via the CLI (mini fixtures only, no network)."""

from __future__ import annotations

from pathlib import Path

from ashare_ingest.cli import main

START = "2024-03-04"
END = "2024-03-08"


def _run_build(tmp_path: Path, fixture: str) -> tuple[int, Path]:
    from conftest import assemble_run_dir

    run_dir = assemble_run_dir(tmp_path, fixture)
    data_root = tmp_path / "v3-data"
    code = main([
        "build",
        "--raw-dir", str(run_dir),
        "--data-root", str(data_root),
        "--start", START,
        "--end", END,
    ])
    return code, data_root


def test_blocked_fixture_writes_no_prepared(tmp_path):
    code, data_root = _run_build(tmp_path, "mini-raw")
    assert code == 1
    prepared = data_root / "prepared"
    assert not list(prepared.glob("*.prepared.json"))
    report = next((data_root / "reports").glob("reconcile-*.md"))
    text = report.read_text(encoding="utf-8")
    assert "**BLOCKED**" in text
    assert "MISSING_SESSIONS" in text


def test_passing_fixture_writes_prepared_and_manifest(tmp_path):
    code, data_root = _run_build(tmp_path, "mini-pass")
    assert code == 0
    prepared = data_root / "prepared"
    prepared_file = next(prepared.glob("*.prepared.json"))
    manifest_file = next(prepared.glob("*.import-manifest.json"))

    import json

    snapshot = json.loads(prepared_file.read_text(encoding="utf-8"))
    assert snapshot["assetIdentity"]["assetId"] == "stock:cn-a.sh.600519"
    assert len(snapshot["sessions"]) == 5
    assert [s["status"] for s in snapshot["sessions"]] == [
        "trading", "suspended", "trading", "trading", "trading",
    ]
    assert snapshot["sessions"][0]["bar"]["signalClose"] == "7.752000"
    actions = snapshot["corporateActions"]
    assert [(a["type"], a["exDate"]) for a in actions] == [
        ("bonusIssue", "2024-03-07"), ("cashDividend", "2024-03-07"),
    ]
    assert actions[1]["cashPerShare"] == "0.500000"
    assert actions[0]["ratioNumerator"] == 1 and actions[0]["ratioDenominator"] == 4
    codes = {issue["code"] for issue in snapshot["qualityIssues"]}
    assert codes == {"ST_SESSIONS_PRESENT", "ZERO_VOLUME_TRADING_DAY", "SUSPENDED_SESSIONS_PRESENT"}
    assert all(issue["blocking"] is False for issue in snapshot["qualityIssues"])

    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    assert manifest["snapshotDigest"] == "sha256:" + "0" * 64
    assert manifest["adjustmentFormula"] == "adjustment-formula@1"
    assert manifest["assetId"] == "stock:cn-a.sh.600519"
    names = {entry["rawFile"] for entry in manifest["rawInputs"]}
    assert any(name.startswith("bs-trade-dates") for name in names)
    assert any(name.startswith("ak-em-") for name in names)

    report = next((data_root / "reports").glob("reconcile-*.md"))
    assert "**PASS**" in report.read_text(encoding="utf-8")


def test_rebuild_is_byte_identical(tmp_path):
    from conftest import assemble_run_dir

    run_dir = assemble_run_dir(tmp_path, "mini-pass")
    data_root_a = tmp_path / "v3-data-a"
    data_root_b = tmp_path / "v3-data-b"
    args = ["build", "--raw-dir", str(run_dir), "--start", START, "--end", END]
    assert main(args + ["--data-root", str(data_root_a)]) == 0
    assert main(args + ["--data-root", str(data_root_b)]) == 0
    file_a = next((data_root_a / "prepared").glob("*.prepared.json"))
    file_b = next((data_root_b / "prepared").glob("*.prepared.json"))
    assert file_a.read_bytes() == file_b.read_bytes()


def test_verify_real_reports_missing_snapshots(tmp_path):
    data_root = tmp_path / "v3-data"
    (data_root / "snapshots").mkdir(parents=True)
    assert main(["verify-real", "--data-root", str(data_root)]) == 0
    bad_digest_dir = data_root / "snapshots" / ("sha256_" + "f" * 64)
    bad_digest_dir.mkdir()
    assert main(["verify-real", "--data-root", str(data_root)]) == 1
