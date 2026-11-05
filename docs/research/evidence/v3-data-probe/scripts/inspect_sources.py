import importlib.metadata as metadata
import inspect
import json
import sys


def describe(module, names):
    result = {}
    for name in names:
        obj = getattr(module, name, None)
        if obj is None:
            result[name] = {"exists": False}
            continue
        try:
            signature = str(inspect.signature(obj))
        except (TypeError, ValueError):
            signature = None
        result[name] = {
            "exists": True,
            "signature": signature,
            "doc": inspect.getdoc(obj),
        }
    return result


def main():
    output = {
        "python": sys.version,
        "packages": {},
        "akshare": {},
        "baostock": {},
    }
    for package in ("akshare", "baostock", "pandas", "numpy", "requests"):
        try:
            dist = metadata.distribution(package)
            output["packages"][package] = {
                "version": dist.version,
                "homePage": dist.metadata.get("Home-page"),
                "projectUrls": dist.metadata.get_all("Project-URL"),
                "license": dist.metadata.get("License"),
            }
        except metadata.PackageNotFoundError:
            output["packages"][package] = {"installed": False}

    try:
        import akshare as ak
        output["akshare"] = describe(ak, [
            "fund_individual_basic_info_xq",
            "fund_open_fund_info_em",
            "fund_open_fund_daily_em",
            "fund_etf_hist_em",
            "fund_etf_dividend_sina",
            "fund_etf_spot_em",
            "index_stock_info",
            "index_zh_a_hist",
            "stock_zh_a_hist",
        ])
    except Exception as exc:
        output["akshareImportError"] = f"{type(exc).__name__}: {exc}"

    try:
        import baostock as bs
        output["baostock"] = describe(bs, [
            "login",
            "logout",
            "query_history_k_data_plus",
            "query_trade_dates",
            "query_dividend_data",
            "query_adjust_factor",
            "query_stock_basic",
        ])
    except Exception as exc:
        output["baostockImportError"] = f"{type(exc).__name__}: {exc}"

    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
