"""
交易API路由 - 买入/卖出/持仓管理

依据：PRD.md 4.3 交易系统
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Literal

from models.database import get_db
from models.schemas import (
    TradeCreate, TradeResponse, PositionResponse,
    ApiResponse
)
from services.trading_service import get_trading_service, TradingService

router = APIRouter(prefix="/api/trading", tags=["trading"])


@router.post("/{agent_id}/buy", response_model=ApiResponse)
async def buy_stock(
    agent_id: str,
    trade_data: TradeCreate,
    db: AsyncSession = Depends(get_db),
    trading_service: TradingService = Depends(get_trading_service)
):
    """
    买入股票

    - **agent_id**: AI交易员ID
    - **symbol**: 股票代码 (如: 600000.SH)
    - **quantity**: 买入数量
    - **price**: 限价 (如为0则按市价成交)
    """
    success, message, trade = await trading_service.execute_buy(
        db=db,
        agent_id=agent_id,
        symbol=trade_data.symbol,
        quantity=trade_data.quantity,
        decision_reason=None
    )

    if not success:
        return ApiResponse(code=1, message=message, data=None)

    return ApiResponse(
        code=0,
        message=message,
        data=trade
    )


@router.post("/{agent_id}/sell", response_model=ApiResponse)
async def sell_stock(
    agent_id: str,
    trade_data: TradeCreate,
    db: AsyncSession = Depends(get_db),
    trading_service: TradingService = Depends(get_trading_service)
):
    """
    卖出股票

    - **agent_id**: AI交易员ID
    - **symbol**: 股票代码 (如: 600000.SH)
    - **quantity**: 卖出数量
    - **price**: 限价 (如为0则按市价成交)
    """
    success, message, trade = await trading_service.execute_sell(
        db=db,
        agent_id=agent_id,
        symbol=trade_data.symbol,
        quantity=trade_data.quantity,
        decision_reason=None
    )

    if not success:
        return ApiResponse(code=1, message=message, data=None)

    return ApiResponse(
        code=0,
        message=message,
        data=trade
    )


@router.get("/{agent_id}/positions", response_model=ApiResponse)
async def get_positions(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    trading_service: TradingService = Depends(get_trading_service)
):
    """
    获取持仓列表

    返回当前持有的所有股票及盈亏情况
    """
    positions = await trading_service.get_positions(db, agent_id)

    return ApiResponse(
        code=0,
        message="success",
        data={
            "items": positions,
            "total": len(positions)
        }
    )


@router.get("/{agent_id}/trades", response_model=ApiResponse)
async def get_trade_history(
    agent_id: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    trading_service: TradingService = Depends(get_trading_service)
):
    """
    获取交易历史

    - **limit**: 返回记录数量 (默认50条)
    """
    trades = await trading_service.get_trades(db, agent_id, limit)

    return ApiResponse(
        code=0,
        message="success",
        data={
            "items": trades,
            "total": len(trades)
        }
    )


@router.get("/{agent_id}/portfolio", response_model=ApiResponse)
async def get_portfolio(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    trading_service: TradingService = Depends(get_trading_service)
):
    """
    获取账户组合概览

    返回总资金、现金、持仓市值、收益率等信息
    """
    summary = await trading_service.get_portfolio_summary(db, agent_id)

    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with id {agent_id} not found"
        )

    return ApiResponse(
        code=0,
        message="success",
        data=summary
    )
