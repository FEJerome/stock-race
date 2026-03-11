"""
Decision API - AI Trading Decision Endpoint

Provides endpoint for AI agents to make trading decisions.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
import os

from services.ai_adapter import get_ai_adapter, DecisionRequest, DecisionResponse, DecisionAction
from services.ai_adapter.base import MarketContext, PositionContext
from services.trading_service import TradingService
from services.news.service import get_news_service
from services.market_data.cache_service import get_cache_service
from services.market_data.indicators import TechnicalIndicators
from models.schemas import ApiResponse, TradeCreate
from models.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/agents", tags=["decision"])


class DecisionCreateRequest(BaseModel):
    """Request to trigger AI decision"""
    symbol: str = Field(..., description="股票代码")
    force: bool = Field(default=False, description="是否强制执行（忽略检查）")


class DecisionCreateResponse(BaseModel):
    """Response for decision creation"""
    decision_id: str
    agent_id: str
    symbol: str
    action: str
    confidence: float
    reason: str
    suggested_quantity: Optional[int]
    risk_warning: Optional[str]
    executed_trade: Optional[Dict[str, Any]]
    token_usage: Optional[Dict[str, Any]]
    latency_ms: float
    model_name: str
    timestamp: datetime


class TokenStatsResponse(BaseModel):
    """Token usage statistics response"""
    total_tokens: int
    total_cost_usd: float
    total_cost_cny: float
    total_decisions: int
    avg_tokens_per_decision: float
    avg_cost_per_decision_usd: float
    model_breakdown: Dict[str, Dict[str, Any]]


# In-memory token stats storage (replace with DB in production)
_token_stats = {
    "total_tokens": 0,
    "total_cost_usd": 0.0,
    "decision_count": 0,
    "model_stats": {}
}


def _update_token_stats(decision: DecisionResponse, model_name: str):
    """Update global token statistics"""
    if decision.token_usage:
        _token_stats["total_tokens"] += decision.token_usage.total_tokens
        _token_stats["total_cost_usd"] += decision.token_usage.cost_usd
        _token_stats["decision_count"] += 1

        # Model-specific stats
        if model_name not in _token_stats["model_stats"]:
            _token_stats["model_stats"][model_name] = {
                "tokens": 0,
                "cost_usd": 0.0,
                "count": 0
            }
        _token_stats["model_stats"][model_name]["tokens"] += decision.token_usage.total_tokens
        _token_stats["model_stats"][model_name]["cost_usd"] += decision.token_usage.cost_usd
        _token_stats["model_stats"][model_name]["count"] += 1


@router.post("/{agent_id}/decide", response_model=ApiResponse)
async def make_decision(
    agent_id: str,
    request: DecisionCreateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Trigger AI decision for an agent

    The AI will analyze market data and make a trading decision.
    If the decision is to buy/sell and conditions are met, a trade may be executed.
    """
    try:
        # Get trading service
        trading_service = TradingService()

        # Get agent info
        agent = await trading_service.get_agent(db, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

        if agent.status != "active":
            raise HTTPException(status_code=400, detail="Agent is not active")

        # Get market data for the symbol
        from services.market_data import get_router
        market_router = get_router()
        quote = await market_router.get_quote(request.symbol)

        if not quote:
            raise HTTPException(status_code=404, detail=f"Market data not found for {request.symbol}")

        # Get position info
        position = await trading_service.get_position(db, agent_id, request.symbol)

        # Get portfolio summary
        portfolio = await trading_service.get_portfolio_summary(db, agent_id)

        # Get recent trades
        trades = await trading_service.get_trades(db, agent_id, limit=5)
        trade_history = [
            {
                "symbol": t.symbol,
                "action": t.action,
                "quantity": t.quantity,
                "price": t.price,
                "timestamp": t.timestamp.isoformat() if hasattr(t, 'timestamp') else str(t.timestamp)
            }
            for t in trades
        ]

        # 计算技术指标
        tech_data = None
        try:
            cache_service = get_cache_service()
            if cache_service:
                indicators = TechnicalIndicators(cache_service)
                tech_data = await indicators.calculate(request.symbol)
        except Exception as e:
            print(f"[Decision] Technical indicators calculation failed: {e}")
            # 降级处理：指标计算失败继续决策

        # Build decision request
        market_context = MarketContext(
            symbol=quote.symbol,
            name=quote.name,
            current_price=quote.price,
            change_percent=quote.change_percent,
            volume=quote.volume,
            ma5=tech_data.ma5 if tech_data else None,
            ma10=tech_data.ma10 if tech_data else None,
            ma20=tech_data.ma20 if tech_data else None,
            volume_ma5=tech_data.volume_ma5 if tech_data else None,
            price_change_1h=tech_data.price_change_1h if tech_data else None,
            trend=tech_data.trend if tech_data else "unknown",
        )

        position_context = None
        if position and position.quantity > 0:
            position_context = PositionContext(
                symbol=position.symbol,
                quantity=position.quantity,
                avg_cost=position.avg_cost,
                current_price=quote.price,
                unrealized_pnl=position.unrealized_pnl or 0,
                unrealized_pnl_pct=position.unrealized_pnl_pct or 0,
            )

        # Get API key from environment (user-provided)
        api_key = os.getenv("MOONSHOT_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=500,
                detail="MOONSHOT_API_KEY not configured. Please set your Kimi API key in settings."
            )

        # Create AI adapter
        adapter = get_ai_adapter(
            provider="kimi",
            model=agent.model_name,
            api_key=api_key
        )

        # Get news sentiment summary
        news_service = get_news_service()
        news_sentiment = await news_service.get_intelligence_summary(request.symbol, db)

        # Trigger news collection in background (don't wait)
        import asyncio
        asyncio.create_task(news_service.collect_news(request.symbol, db, limit=10))

        decision_request = DecisionRequest(
            agent_id=agent_id,
            agent_name=agent.name,
            symbol=request.symbol,
            market_data=market_context,
            position=position_context,
            strategy=agent.strategy,
            portfolio_summary=portfolio,
            trade_history=trade_history,
            news_sentiment=news_sentiment,
        )

        # Make decision
        decision = await adapter.make_decision(decision_request)

        # Update token stats
        _update_token_stats(decision, agent.model_name)

        # Execute trade if action is buy/sell and confidence is sufficient
        executed_trade = None
        if decision.action in [DecisionAction.BUY, DecisionAction.SELL] and decision.confidence >= 0.6:
            try:
                if decision.action == DecisionAction.BUY:
                    # Calculate max affordable quantity
                    available = portfolio.get("available_capital", 0)
                    max_qty = int(available / quote.price)
                    suggested_qty = decision.suggested_quantity or max_qty // 2
                    qty = min(suggested_qty, max_qty)

                    if qty > 0:
                        trade = await trading_service.execute_trade(
                            db=db,
                            agent_id=agent_id,
                            trade_data=TradeCreate(
                                symbol=request.symbol,
                                action="buy",
                                quantity=qty,
                                price=quote.price
                            ),
                            decision_reason=decision.reason
                        )
                        executed_trade = {
                            "id": trade.id,
                            "action": trade.action,
                            "quantity": trade.quantity,
                            "price": trade.price,
                            "total_amount": trade.total_amount,
                        }

                elif decision.action == DecisionAction.SELL:
                    if position and position.quantity > 0:
                        qty = min(decision.suggested_quantity or position.quantity, position.quantity)
                        if qty > 0:
                            trade = await trading_service.execute_trade(
                                db=db,
                                agent_id=agent_id,
                                trade_data=TradeCreate(
                                    symbol=request.symbol,
                                    action="sell",
                                    quantity=qty,
                                    price=quote.price
                                ),
                                decision_reason=decision.reason
                            )
                            executed_trade = {
                                "id": trade.id,
                                "action": trade.action,
                                "quantity": trade.quantity,
                                "price": trade.price,
                                "total_amount": trade.total_amount,
                            }
            except Exception as e:
                # Trade execution failed but decision was successful
                executed_trade = {"error": str(e)}

        # Build response
        decision_id = f"dec_{agent_id}_{request.symbol}_{int(datetime.utcnow().timestamp())}"

        response_data = DecisionCreateResponse(
            decision_id=decision_id,
            agent_id=agent_id,
            symbol=request.symbol,
            action=decision.action.value,
            confidence=decision.confidence,
            reason=decision.reason,
            suggested_quantity=decision.suggested_quantity,
            risk_warning=decision.risk_warning,
            executed_trade=executed_trade,
            token_usage=decision.token_usage.__dict__ if decision.token_usage else None,
            latency_ms=decision.latency_ms,
            model_name=decision.model_name,
            timestamp=datetime.utcnow()
        )

        return ApiResponse(
            code=0,
            message="Decision made successfully",
            data=response_data.model_dump()
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Decision error: {str(e)}")


@router.get("/{agent_id}/decisions/history", response_model=ApiResponse)
async def get_decision_history(
    agent_id: str,
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """Get decision history for an agent (placeholder - decisions are not persisted yet)"""
    # TODO: Implement decision persistence
    return ApiResponse(
        code=0,
        message="success",
        data={
            "items": [],
            "total": 0,
            "note": "Decision persistence not implemented yet"
        }
    )


@router.get("/tokens/stats", response_model=ApiResponse)
async def get_token_stats():
    """
    Get global token usage statistics

    Returns aggregated token usage and cost across all AI decisions.
    """
    usd_to_cny = 7.2  # Approximate exchange rate

    total_cost_cny = _token_stats["total_cost_usd"] * usd_to_cny
    avg_cost = (_token_stats["total_cost_usd"] / _token_stats["decision_count"]
                if _token_stats["decision_count"] > 0 else 0)
    avg_tokens = (_token_stats["total_tokens"] / _token_stats["decision_count"]
                  if _token_stats["decision_count"] > 0 else 0)

    return ApiResponse(
        code=0,
        message="success",
        data=TokenStatsResponse(
            total_tokens=_token_stats["total_tokens"],
            total_cost_usd=round(_token_stats["total_cost_usd"], 4),
            total_cost_cny=round(total_cost_cny, 2),
            total_decisions=_token_stats["decision_count"],
            avg_tokens_per_decision=round(avg_tokens, 1),
            avg_cost_per_decision_usd=round(avg_cost, 4),
            model_breakdown=_token_stats["model_stats"]
        ).model_dump()
    )


@router.post("/tokens/reset", response_model=ApiResponse)
async def reset_token_stats():
    """Reset token statistics (admin only in production)"""
    global _token_stats
    _token_stats = {
        "total_tokens": 0,
        "total_cost_usd": 0.0,
        "decision_count": 0,
        "model_stats": {}
    }
    return ApiResponse(code=0, message="Token stats reset successfully", data=None)
