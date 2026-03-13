"""
社交舆情 API 接口

提供情绪分析、热度追踪和排行榜接口
"""
from typing import List, Optional
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_db, SentimentTrendModel
from services.collectors.social_monitor_collector import SocialMonitorCollector

router = APIRouter(prefix="/sentiment", tags=["sentiment"])


@router.get("/{symbol}/trend")
async def get_sentiment_trend(
    symbol: str,
    days: int = Query(7, ge=1, le=30, description="查询天数"),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    获取情绪趋势历史

    Args:
        symbol: 股票代码 (如 000001.SZ)
        days: 查询天数
    """
    try:
        start_time = datetime.now(timezone.utc) - timedelta(days=days)

        stmt = select(SentimentTrendModel).where(
            and_(
                SentimentTrendModel.symbol == symbol,
                SentimentTrendModel.timestamp >= start_time
            )
        ).order_by(SentimentTrendModel.timestamp)

        result = await db.execute(stmt)
        records = result.scalars().all()

        return {
            "code": 0,
            "message": "success",
            "data": {
                "symbol": symbol,
                "days": days,
                "count": len(records),
                "trend": [
                    {
                        "timestamp": r.timestamp.isoformat(),
                        "sentiment_score": r.sentiment_score,
                        "sentiment_label": r.sentiment_label,
                        "hot_score": r.hot_score,
                        "post_count": r.post_count,
                        "positive_count": r.positive_count,
                        "negative_count": r.negative_count,
                        "neutral_count": r.neutral_count,
                        "positive_ratio": round(r.positive_count / r.post_count, 3) if r.post_count > 0 else 0,
                        "negative_ratio": round(r.negative_count / r.post_count, 3) if r.post_count > 0 else 0,
                        "neutral_ratio": round(r.neutral_count / r.post_count, 3) if r.post_count > 0 else 0,
                        "mention_count": r.mention_count,
                        "interaction_count": r.interaction_count,
                        "xueqiu_count": r.xueqiu_count,
                        "guba_count": r.guba_count,
                    }
                    for r in records
                ]
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.get("/{symbol}/hot-score")
async def get_hot_score(
    symbol: str,
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    获取当前热度得分

    Args:
        symbol: 股票代码
    """
    try:
        # 获取最近24小时的数据
        start_time = datetime.now(timezone.utc) - timedelta(hours=24)

        stmt = select(SentimentTrendModel).where(
            and_(
                SentimentTrendModel.symbol == symbol,
                SentimentTrendModel.timestamp >= start_time
            )
        ).order_by(desc(SentimentTrendModel.timestamp))

        result = await db.execute(stmt)
        record = result.scalar_one_or_none()

        if not record:
            return {
                "code": 0,
                "message": "success",
                "data": {
                    "symbol": symbol,
                    "hot_score": 0,
                    "sentiment_score": 0,
                    "sentiment_label": "neutral",
                    "post_count": 0,
                    "mention_count": 0,
                    "note": "暂无数据"
                }
            }

        return {
            "code": 0,
            "message": "success",
            "data": {
                "symbol": symbol,
                "hot_score": record.hot_score,
                "sentiment_score": record.sentiment_score,
                "sentiment_label": record.sentiment_label,
                "post_count": record.post_count,
                "positive_ratio": round(record.positive_count / record.post_count, 3) if record.post_count > 0 else 0,
                "negative_ratio": round(record.negative_count / record.post_count, 3) if record.post_count > 0 else 0,
                "mention_count": record.mention_count,
                "interaction_count": record.interaction_count,
                "timestamp": record.timestamp.isoformat(),
                "sources": {
                    "xueqiu": record.xueqiu_count,
                    "guba": record.guba_count
                }
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.get("/hot-ranking")
async def get_hot_ranking(
    limit: int = Query(20, ge=1, le=100, description="返回数量"),
    min_posts: int = Query(5, ge=0, description="最小帖子数"),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    热度排行榜

    返回最近24小时热度最高的股票

    Args:
        limit: 返回数量
        min_posts: 最小帖子数过滤
    """
    try:
        start_time = datetime.now(timezone.utc) - timedelta(hours=24)

        stmt = select(SentimentTrendModel).where(
            and_(
                SentimentTrendModel.timestamp >= start_time,
                SentimentTrendModel.post_count >= min_posts
            )
        ).order_by(desc(SentimentTrendModel.hot_score)).limit(limit)

        result = await db.execute(stmt)
        records = result.scalars().all()

        return {
            "code": 0,
            "message": "success",
            "data": {
                "count": len(records),
                "update_time": datetime.now(timezone.utc).isoformat(),
                "ranking": [
                    {
                        "rank": i + 1,
                        "symbol": r.symbol,
                        "hot_score": r.hot_score,
                        "sentiment_score": r.sentiment_score,
                        "sentiment_label": r.sentiment_label,
                        "post_count": r.post_count,
                        "mention_count": r.mention_count,
                        "interaction_count": r.interaction_count,
                        "positive_ratio": round(r.positive_count / r.post_count, 3) if r.post_count > 0 else 0,
                        "sources": {
                            "xueqiu": r.xueqiu_count,
                            "guba": r.guba_count
                        }
                    }
                    for i, r in enumerate(records)
                ]
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.get("/overview")
async def get_sentiment_overview(
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    获取舆情概览统计

    返回整体市场情绪统计
    """
    try:
        start_time = datetime.now(timezone.utc) - timedelta(hours=24)

        # 统计总帖子数
        stmt = select(
            func.sum(SentimentTrendModel.post_count),
            func.sum(SentimentTrendModel.positive_count),
            func.sum(SentimentTrendModel.negative_count),
            func.sum(SentimentTrendModel.neutral_count),
            func.sum(SentimentTrendModel.interaction_count),
            func.count(SentimentTrendModel.symbol.distinct())
        ).where(SentimentTrendModel.timestamp >= start_time)

        result = await db.execute(stmt)
        row = result.fetchone()

        total_posts = row[0] or 0
        total_positive = row[1] or 0
        total_negative = row[2] or 0
        total_neutral = row[3] or 0
        total_interaction = row[4] or 0
        active_symbols = row[5] or 0

        # 计算整体情绪倾向
        if total_posts > 0:
            sentiment_index = (total_positive - total_negative) / total_posts * 100
        else:
            sentiment_index = 0

        # 确定市场情绪标签
        if sentiment_index > 10:
            market_sentiment = "positive"
        elif sentiment_index < -10:
            market_sentiment = "negative"
        else:
            market_sentiment = "neutral"

        return {
            "code": 0,
            "message": "success",
            "data": {
                "time_range": "24h",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "statistics": {
                    "total_posts": int(total_posts),
                    "active_symbols": int(active_symbols),
                    "total_interactions": int(total_interaction),
                },
                "sentiment": {
                    "index": round(sentiment_index, 2),
                    "label": market_sentiment,
                    "positive_count": int(total_positive),
                    "negative_count": int(total_negative),
                    "neutral_count": int(total_neutral),
                    "positive_ratio": round(total_positive / total_posts, 3) if total_posts > 0 else 0,
                    "negative_ratio": round(total_negative / total_posts, 3) if total_posts > 0 else 0,
                    "neutral_ratio": round(total_neutral / total_posts, 3) if total_posts > 0 else 0,
                }
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.post("/{symbol}/collect")
async def trigger_sentiment_collection(
    symbol: str,
    use_ai: bool = Query(False, description="是否使用AI分析"),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    手动触发舆情采集

    用于测试或手动更新
    """
    try:
        # 这里需要传入AI适配器实例（如果需要AI分析）
        ai_adapter = None  # 可以从配置或依赖注入获取

        collector = SocialMonitorCollector(
            db_session=db,
            use_ai_analysis=use_ai,
            ai_adapter=ai_adapter
        )

        result = await collector.collect(symbol=symbol, limit=50)
        await collector.close()

        return {
            "code": 0 if result.success else 500,
            "message": "success" if result.success else result.error_message,
            "data": {
                "symbol": symbol,
                "collected": result.count,
                "duration_ms": result.duration_ms,
                "use_ai": use_ai
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"采集失败: {str(e)}")
