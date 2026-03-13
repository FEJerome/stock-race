"""
财报数据 API 接口

提供财报查询和分析接口
"""
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_db, FinancialReportModel
from services.collectors.financial_report_collector import FinancialReportCollector

router = APIRouter(prefix="/financial-reports", tags=["financial-reports"])


@router.get("/{symbol}")
async def get_financial_reports(
    symbol: str,
    report_type: Optional[str] = Query(None, description="财报类型: Q1/Q2/Q3/ANNUAL/FLASH"),
    year: Optional[int] = Query(None, description="年份"),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    获取股票财报列表

    Args:
        symbol: 股票代码 (如 000001.SZ)
        report_type: 可选过滤类型
        year: 可选过滤年份
        limit: 返回数量
    """
    try:
        # 构建查询
        stmt = select(FinancialReportModel).where(
            FinancialReportModel.symbol == symbol
        )

        if report_type:
            stmt = stmt.where(FinancialReportModel.report_type == report_type)

        if year:
            stmt = stmt.where(FinancialReportModel.report_year == year)

        stmt = stmt.order_by(desc(FinancialReportModel.report_period)).limit(limit)

        result = await db.execute(stmt)
        reports = result.scalars().all()

        return {
            "code": 0,
            "message": "success",
            "data": {
                "symbol": symbol,
                "count": len(reports),
                "items": [
                    {
                        "id": r.id,
                        "report_type": r.report_type,
                        "report_year": r.report_year,
                        "report_period": r.report_period,
                        "publish_date": r.publish_date.isoformat() if r.publish_date else None,
                        "revenue": r.revenue,
                        "revenue_yoy": r.revenue_yoy,
                        "revenue_qoq": r.revenue_qoq,
                        "net_profit": r.net_profit,
                        "net_profit_yoy": r.net_profit_yoy,
                        "net_profit_qoq": r.net_profit_qoq,
                        "gross_profit": r.gross_profit,
                        "gross_margin": r.gross_margin,
                        "eps": r.eps,
                        "roe": r.roe,
                    }
                    for r in reports
                ]
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.get("/{symbol}/latest")
async def get_latest_report(
    symbol: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """获取最新财报"""
    try:
        stmt = select(FinancialReportModel).where(
            FinancialReportModel.symbol == symbol
        ).order_by(desc(FinancialReportModel.report_period)).limit(1)

        result = await db.execute(stmt)
        report = result.scalar_one_or_none()

        if not report:
            return {
                "code": 404,
                "message": "未找到财报数据",
                "data": None
            }

        return {
            "code": 0,
            "message": "success",
            "data": {
                "id": report.id,
                "symbol": report.symbol,
                "report_type": report.report_type,
                "report_year": report.report_year,
                "report_period": report.report_period,
                "publish_date": report.publish_date.isoformat() if report.publish_date else None,
                "metrics": {
                    "revenue": report.revenue,
                    "revenue_yoy": report.revenue_yoy,
                    "revenue_qoq": report.revenue_qoq,
                    "net_profit": report.net_profit,
                    "net_profit_yoy": report.net_profit_yoy,
                    "net_profit_qoq": report.net_profit_qoq,
                    "gross_profit": report.gross_profit,
                    "gross_margin": report.gross_margin,
                    "eps": report.eps,
                    "roe": report.roe,
                }
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.get("/{symbol}/metrics")
async def get_financial_metrics(
    symbol: str,
    metric: str = Query(..., description="指标: revenue/net_profit/eps/roe/gross_margin"),
    years: int = Query(3, ge=1, le=10, description="年数"),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    获取财务指标历史趋势

    Args:
        symbol: 股票代码
        metric: 指标名称
        years: 查询年数
    """
    valid_metrics = ["revenue", "net_profit", "eps", "roe", "gross_margin",
                     "revenue_yoy", "net_profit_yoy"]

    if metric not in valid_metrics:
        raise HTTPException(
            status_code=400,
            detail=f"无效指标，可选: {', '.join(valid_metrics)}"
        )

    try:
        current_year = datetime.now().year
        start_year = current_year - years

        stmt = select(FinancialReportModel).where(
            and_(
                FinancialReportModel.symbol == symbol,
                FinancialReportModel.report_year >= start_year
            )
        ).order_by(FinancialReportModel.report_period)

        result = await db.execute(stmt)
        reports = result.scalars().all()

        data_points = [
            {
                "period": r.report_period,
                "year": r.report_year,
                "type": r.report_type,
                "value": getattr(r, metric),
                "publish_date": r.publish_date.isoformat() if r.publish_date else None,
            }
            for r in reports
            if getattr(r, metric) is not None
        ]

        return {
            "code": 0,
            "message": "success",
            "data": {
                "symbol": symbol,
                "metric": metric,
                "count": len(data_points),
                "data": data_points
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.post("/{symbol}/collect")
async def trigger_collection(
    symbol: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    手动触发财报采集

    用于测试或手动更新
    """
    try:
        collector = FinancialReportCollector(db_session=db)
        result = await collector.collect(symbol=symbol, limit=10)
        await collector.close()

        return {
            "code": 0 if result.success else 500,
            "message": "success" if result.success else result.error_message,
            "data": {
                "symbol": symbol,
                "collected": result.count,
                "duration_ms": result.duration_ms
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"采集失败: {str(e)}")
