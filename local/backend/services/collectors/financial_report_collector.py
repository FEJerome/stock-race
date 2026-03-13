"""
财报数据采集器

继承 BaseCollector 实现财报数据的采集、解析和存储
"""
import asyncio
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any
import logging

import aiohttp
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from .base import BaseCollector, CollectionResult
from ..financial.parser import FinancialReportParser
from models.database import FinancialReportModel

logger = logging.getLogger(__name__)


class FinancialReportCollector(BaseCollector):
    """
    财报数据采集器

    功能：
    1. 从数据源获取财报列表
    2. 下载PDF文件
    3. 解析提取关键指标
    4. 计算同比/环比
    5. 存储到数据库

    数据源：
    - 东方财富 (EastMoney)
    - 巨潮资讯 (CNInfo)
    """

    # 东方财富财报API
    EASTMONEY_REPORT_API = "https://datacenter.eastmoney.com/api/data/v1/get"

    def __init__(
        self,
        data_dir: str = "data/financial_reports",
        db_session: Optional[AsyncSession] = None,
        priority: int = 80
    ):
        super().__init__(name="financial_report", priority=priority)
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.parser = FinancialReportParser()
        self.db_session = db_session
        self._session: Optional[aiohttp.ClientSession] = None

    def _get_session(self) -> aiohttp.ClientSession:
        """获取或创建HTTP会话"""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0",
                    "Accept": "application/json, */*",
                },
                timeout=aiohttp.ClientTimeout(total=30)
            )
        return self._session

    async def collect(
        self,
        symbol: str,
        since: Optional[datetime] = None,
        limit: int = 10
    ) -> CollectionResult:
        """
        采集财报数据

        Args:
            symbol: 股票代码 (如 "000001.SZ")
            since: 增量更新时间 (None则采集全部)
            limit: 最大采集数量

        Returns:
            CollectionResult 采集结果
        """
        self._set_running()
        start_time = datetime.now(timezone.utc)

        try:
            # 1. 获取财报列表
            reports = await self._fetch_report_list(symbol, limit)

            if not reports:
                return CollectionResult(
                    source_name=self.get_source_name(),
                    symbol=symbol,
                    items=[],
                    count=0,
                    start_time=start_time,
                    end_time=datetime.now(timezone.utc),
                    success=True,
                    next_since=start_time
                )

            # 2. 过滤已采集的财报
            new_reports = await self._filter_existing_reports(symbol, reports, since)

            if not new_reports:
                logger.info(f"{symbol} 没有新的财报需要采集")
                return CollectionResult(
                    source_name=self.get_source_name(),
                    symbol=symbol,
                    items=[],
                    count=0,
                    start_time=start_time,
                    end_time=datetime.now(timezone.utc),
                    success=True,
                    next_since=start_time
                )

            # 3. 处理每个财报
            processed_items = []
            for report in new_reports[:limit]:
                try:
                    item = await self._process_report(symbol, report)
                    if item:
                        processed_items.append(item)
                except Exception as e:
                    logger.error(f"处理财报失败 {symbol}: {e}")
                    continue

            # 4. 更新健康状态
            duration_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
            self._update_health_success(duration_ms)
            self.update_last_since(symbol, start_time)

            return CollectionResult(
                source_name=self.get_source_name(),
                symbol=symbol,
                items=processed_items,
                count=len(processed_items),
                start_time=start_time,
                end_time=datetime.now(timezone.utc),
                success=True,
                next_since=start_time
            )

        except Exception as e:
            self._update_health_error(str(e))
            logger.error(f"财报采集失败 {symbol}: {e}")
            return CollectionResult(
                source_name=self.get_source_name(),
                symbol=symbol,
                items=[],
                count=0,
                start_time=start_time,
                end_time=datetime.now(timezone.utc),
                success=False,
                error_message=str(e),
                next_since=since
            )

    async def _fetch_report_list(
        self,
        symbol: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        获取财报列表

        从东方财富获取财报列表
        """
        code = self._extract_code(symbol)
        market = "SH" if ".SH" in symbol else "SZ"

        params = {
            "sortColumns": "UPDATE_DATE",
            "sortTypes": "-1",
            "pageSize": limit,
            "pageNumber": 1,
            "reportName": "RPT_FCI_PERFORMANCEE",
            "columns": "ALL",
            "filter": f"(SECURITY_CODE='{code}')"
        }

        try:
            session = self._get_session()
            async with session.get(self.EASTMONEY_REPORT_API, params=params) as resp:
                if resp.status != 200:
                    logger.warning(f"获取财报列表失败: HTTP {resp.status}")
                    return []

                data = await resp.json()
                result = data.get("result", {})
                reports = result.get("data", [])

                return reports or []

        except Exception as e:
            logger.error(f"获取财报列表异常: {e}")
            return []

    async def _filter_existing_reports(
        self,
        symbol: str,
        reports: List[Dict[str, Any]],
        since: Optional[datetime]
    ) -> List[Dict[str, Any]]:
        """
        过滤已存在的财报

        Args:
            symbol: 股票代码
            reports: 财报列表
            since: 增量更新时间

        Returns:
            需要采集的新财报列表
        """
        if not self.db_session:
            return reports

        new_reports = []
        for report in reports:
            report_period = self._extract_report_period(report)
            if not report_period:
                continue

            report_id = f"{symbol}_{report_period}"

            # 检查是否已存在
            try:
                stmt = select(FinancialReportModel).where(
                    FinancialReportModel.id == report_id
                )
                result = await self.db_session.execute(stmt)
                existing = result.scalar_one_or_none()

                if not existing:
                    new_reports.append(report)
            except Exception as e:
                logger.warning(f"检查财报存在性失败: {e}")
                new_reports.append(report)

        return new_reports

    async def _process_report(
        self,
        symbol: str,
        report: Dict[str, Any]
    ) -> Optional[FinancialReportModel]:
        """
        处理单个财报

        1. 解析报告信息
        2. 提取关键指标
        3. 计算同比/环比
        4. 保存到数据库
        """
        try:
            # 提取报告期
            report_period = self._extract_report_period(report)
            if not report_period:
                return None

            report_id = f"{symbol}_{report_period}"
            report_type = self._classify_report_type(report)
            report_year = self._extract_year(report)

            # 提取财务指标 (从API返回的数据)
            metrics = self._extract_metrics_from_api(report)

            # 计算同比/环比
            growth_rates = await self._calculate_growth_rates(
                symbol, report_period, metrics
            )

            # 创建模型
            model = FinancialReportModel(
                id=report_id,
                symbol=symbol,
                report_type=report_type,
                report_year=report_year,
                report_period=report_period,
                pdf_path=None,  # API模式暂不下载PDF
                source_url=report.get("ORG_URL"),
                revenue=metrics.get("revenue"),
                revenue_yoy=growth_rates.get("revenue_yoy"),
                revenue_qoq=growth_rates.get("revenue_qoq"),
                net_profit=metrics.get("net_profit"),
                net_profit_yoy=growth_rates.get("net_profit_yoy"),
                net_profit_qoq=growth_rates.get("net_profit_qoq"),
                gross_profit=metrics.get("gross_profit"),
                gross_margin=metrics.get("gross_margin"),
                eps=metrics.get("eps"),
                roe=metrics.get("roe"),
                raw_text=None,
                publish_date=self._parse_date(report.get("UPDATE_DATE")),
            )

            # 保存到数据库
            if self.db_session:
                self.db_session.add(model)
                await self.db_session.commit()

            return model

        except Exception as e:
            logger.error(f"处理财报失败: {e}")
            return None

    def _extract_metrics_from_api(self, report: Dict[str, Any]) -> Dict[str, float]:
        """
        从API返回数据中提取财务指标

        东方财富返回的字段可能有不同的命名
        """
        metrics = {}

        # 营业收入 (可能是 BPS 或 TOTAL_OPERATE_INCOME)
        revenue = report.get("TOTAL_OPERATE_INCOME") or report.get("BPS")
        if revenue:
            # 转换为万元
            metrics["revenue"] = float(revenue) / 10000 if float(revenue) > 1e6 else float(revenue)

        # 净利润
        net_profit = report.get("PARENT_NETPROFIT") or report.get("EPS")
        if net_profit:
            metrics["net_profit"] = float(net_profit) / 10000 if float(net_profit) > 1e6 else float(net_profit)

        # 每股收益
        eps = report.get("BASIC_EPS")
        if eps:
            metrics["eps"] = float(eps)

        # 净资产收益率
        roe = report.get("WEIGHTAVG_ROE")
        if roe:
            metrics["roe"] = float(roe)

        # 毛利率 (可能需要计算)
        gross_margin = report.get("XSMLL")
        if gross_margin:
            metrics["gross_margin"] = float(gross_margin)

        return {k: round(v, 2) for k, v in metrics.items() if v is not None}

    async def _calculate_growth_rates(
        self,
        symbol: str,
        current_period: str,
        current_metrics: Dict[str, float]
    ) -> Dict[str, Optional[float]]:
        """
        计算同比/环比增长率

        Args:
            symbol: 股票代码
            current_period: 当前报告期 (如 "2024-Q1")
            current_metrics: 当前指标

        Returns:
            增长率字典
        """
        if not self.db_session:
            return {}

        rates = {}

        # 解析当前期
        year, period_type = self._parse_period(current_period)
        if not year:
            return rates

        # 计算同比 (去年同期)
        yoy_period = f"{year-1}-{period_type}"
        yoy_data = await self._get_report_by_period(symbol, yoy_period)

        if yoy_data:
            for metric in ["revenue", "net_profit"]:
                curr = current_metrics.get(metric)
                prev = getattr(yoy_data, metric, None)
                if curr is not None and prev and prev != 0:
                    rate = ((curr - prev) / abs(prev)) * 100
                    rates[f"{metric}_yoy"] = round(rate, 2)

        # 计算环比 (上一季度)
        qoq_period = self._get_previous_period(year, period_type)
        if qoq_period:
            qoq_data = await self._get_report_by_period(symbol, qoq_period)
            if qoq_data:
                for metric in ["revenue", "net_profit"]:
                    curr = current_metrics.get(metric)
                    prev = getattr(qoq_data, metric, None)
                    if curr is not None and prev and prev != 0:
                        rate = ((curr - prev) / abs(prev)) * 100
                        rates[f"{metric}_qoq"] = round(rate, 2)

        return rates

    async def _get_report_by_period(
        self,
        symbol: str,
        period: str
    ) -> Optional[FinancialReportModel]:
        """根据报告期获取财报"""
        if not self.db_session:
            return None

        try:
            report_id = f"{symbol}_{period}"
            stmt = select(FinancialReportModel).where(
                FinancialReportModel.id == report_id
            )
            result = await self.db_session.execute(stmt)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.warning(f"查询历史财报失败: {e}")
            return None

    def _extract_code(self, symbol: str) -> str:
        """从symbol提取代码"""
        return symbol.split('.')[0]

    def _extract_report_period(self, report: Dict[str, Any]) -> Optional[str]:
        """提取报告期"""
        # 尝试从多个字段提取
        notice_date = report.get("NOTICE_DATE")
        if notice_date:
            # 解析日期格式
            try:
                dt = datetime.fromisoformat(notice_date.replace('Z', '+00:00'))
                year = dt.year
                month = dt.month

                # 根据月份推断季度
                if month <= 3:
                    return f"{year}-Q1"
                elif month <= 6:
                    return f"{year}-Q2"
                elif month <= 9:
                    return f"{year}-Q3"
                else:
                    return f"{year}-ANNUAL"
            except:
                pass

        # 从数据日期提取
        data_date = report.get("DATA_DATE")
        if data_date:
            return str(data_date)

        return None

    def _classify_report_type(self, report: Dict[str, Any]) -> str:
        """分类财报类型"""
        period = self._extract_report_period(report) or ""

        if "Q1" in period:
            return "Q1"
        elif "Q2" in period or "HALF" in period:
            return "Q2"
        elif "Q3" in period:
            return "Q3"
        elif "ANNUAL" in period or "YEAR" in period:
            return "ANNUAL"

        return "UNKNOWN"

    def _extract_year(self, report: Dict[str, Any]) -> int:
        """提取年份"""
        period = self._extract_report_period(report) or ""
        parts = period.split('-')
        if parts and parts[0].isdigit():
            return int(parts[0])
        return datetime.now().year

    def _parse_period(self, period: str) -> tuple:
        """解析报告期为年份和类型"""
        parts = period.split('-')
        if len(parts) == 2:
            year_str, period_type = parts
            if year_str.isdigit():
                return int(year_str), period_type
        return None, None

    def _get_previous_period(self, year: int, period_type: str) -> Optional[str]:
        """获取上一季度"""
        period_order = ["Q1", "Q2", "Q3", "ANNUAL"]
        try:
            idx = period_order.index(period_type)
            if idx > 0:
                return f"{year}-{period_order[idx-1]}"
            else:
                # 上一年的年报
                return f"{year-1}-ANNUAL"
        except ValueError:
            return None

    def _parse_date(self, date_str: Optional[str]) -> Optional[datetime]:
        """解析日期字符串"""
        if not date_str:
            return None
        try:
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        except:
            return None

    def get_source_name(self) -> str:
        """返回数据源名称"""
        return "financial_report"

    async def close(self):
        """关闭HTTP会话"""
        if self._session and not self._session.closed:
            await self._session.close()
