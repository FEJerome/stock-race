"""
交易服务 - 虚拟交易执行与持仓管理

依据：PRD.md 4.3 交易系统
"""
from decimal import Decimal
from typing import Optional, Tuple, List
from datetime import datetime
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update

from models.database import TradeModel, PositionModel, AgentModel
from models.schemas import TradeCreate, TradeResponse, PositionResponse
from services.market_data import get_router


class TradingService:
    """
    交易服务

    处理买入、卖出、持仓查询等操作
    """

    def __init__(self, db: Optional[AsyncSession] = None):
        self.db = db
        self.data_router = get_router()
        self._init_sources()

    def _init_sources(self):
        """Initialize data sources if not already registered"""
        if not self.data_router.list_sources():
            from services.market_data import (
                CSVDataSource, SinaDataSource,
                TencentDataSource, EastMoneyDataSource
            )
            import os

            # CSV source (fallback)
            csv_path = os.getenv("MARKET_DATA_CSV", "./data/market_data.csv")
            csv_source = CSVDataSource(csv_path, name="csv_sample", priority=200)
            self.data_router.register_source(csv_source, weight=0.5)

            # Online sources
            try:
                tencent_source = TencentDataSource(name="tencent", priority=40)
                self.data_router.register_source(tencent_source, weight=1.0)
            except Exception as e:
                print(f"[TradingService] Failed to init Tencent source: {e}")

            try:
                sina_source = SinaDataSource(name="sina", priority=50)
                self.data_router.register_source(sina_source, weight=0.9)
            except Exception as e:
                print(f"[TradingService] Failed to init Sina source: {e}")

            try:
                eastmoney_source = EastMoneyDataSource(name="eastmoney", priority=60)
                self.data_router.register_source(eastmoney_source, weight=0.8)
            except Exception as e:
                print(f"[TradingService] Failed to init EastMoney source: {e}")

    async def execute_buy(
        self,
        db: AsyncSession,
        agent_id: str,
        symbol: str,
        quantity: int,
        decision_reason: Optional[str] = None
    ) -> Tuple[bool, str, Optional[TradeResponse]]:
        """
        执行买入操作

        Returns:
            (是否成功, 消息, 交易记录)
        """
        # 获取AI代理
        result = await db.execute(
            select(AgentModel).where(AgentModel.id == agent_id)
        )
        agent = result.scalar_one_or_none()

        if not agent:
            return False, "AI交易员不存在", None

        # 获取实时行情
        quote_result = await self.data_router.get_quotes([symbol])
        quote = quote_result.get(symbol)

        if not quote:
            return False, f"无法获取股票 {symbol} 的行情数据", None

        price = Decimal(str(quote.price))
        name = quote.name

        # 计算总金额
        total_amount = price * quantity

        # 检查资金是否充足
        if float(total_amount) > agent.current_capital:
            return False, (
                f"资金不足，需要 {float(total_amount):.2f}，"
                f"可用 {agent.current_capital:.2f}"
            ), None

        # 检查单股仓位限制（默认30%）
        position_result = await db.execute(
            select(PositionModel).where(
                PositionModel.agent_id == agent_id,
                PositionModel.symbol == symbol
            )
        )
        existing_position = position_result.scalar_one_or_none()

        # 计算买入后的总仓位
        current_value = sum([
            p.quantity * p.current_price
            for p in (await db.execute(
                select(PositionModel).where(PositionModel.agent_id == agent_id)
            )).scalars().all()
        ])

        total_capital = agent.current_capital + current_value
        new_position_value = (existing_position.quantity * existing_position.avg_cost if existing_position else 0) + float(total_amount)

        if total_capital > 0 and new_position_value / total_capital > 0.3:
            return False, "超出单股最大仓位限制（30%）", None

        # 执行交易
        trade_id = str(uuid.uuid4())
        trade = TradeModel(
            id=trade_id,
            agent_id=agent_id,
            symbol=symbol,
            action="buy",
            quantity=quantity,
            price=float(price),
            total_amount=float(total_amount),
            realized_pnl=None,
            decision_reason=decision_reason,
            timestamp=datetime.utcnow()
        )

        # 更新或创建持仓
        if existing_position:
            # 计算新的平均成本
            old_cost = existing_position.quantity * existing_position.avg_cost
            new_cost = old_cost + float(total_amount)
            total_qty = existing_position.quantity + quantity

            existing_position.quantity = total_qty
            existing_position.avg_cost = new_cost / total_qty
            existing_position.current_price = float(price)
        else:
            new_position = PositionModel(
                agent_id=agent_id,
                symbol=symbol,
                name=name,
                quantity=quantity,
                avg_cost=float(price),
                current_price=float(price)
            )
            db.add(new_position)

        # 更新资金
        agent.current_capital -= float(total_amount)
        agent.updated_at = datetime.utcnow()

        db.add(trade)
        await db.commit()

        return True, f"买入成功：{name} ({symbol}) {quantity}股 @ {float(price):.2f}", \
               TradeResponse(
                   id=trade_id,
                   agent_id=agent_id,
                   symbol=symbol,
                   name=name,
                   action="buy",
                   quantity=quantity,
                   price=float(price),
                   total_amount=float(total_amount),
                   realized_pnl=None,
                   decision_reason=decision_reason,
                   timestamp=trade.timestamp
               )

    async def execute_sell(
        self,
        db: AsyncSession,
        agent_id: str,
        symbol: str,
        quantity: int,
        decision_reason: Optional[str] = None
    ) -> Tuple[bool, str, Optional[TradeResponse]]:
        """
        执行卖出操作

        Returns:
            (是否成功, 消息, 交易记录)
        """
        # 获取AI代理
        result = await db.execute(
            select(AgentModel).where(AgentModel.id == agent_id)
        )
        agent = result.scalar_one_or_none()

        if not agent:
            return False, "AI交易员不存在", None

        # 获取持仓
        position_result = await db.execute(
            select(PositionModel).where(
                PositionModel.agent_id == agent_id,
                PositionModel.symbol == symbol
            )
        )
        position = position_result.scalar_one_or_none()

        if not position:
            return False, f"没有 {symbol} 的持仓", None

        if position.quantity < quantity:
            return False, f"持仓不足，持有 {position.quantity}股，卖出 {quantity}股", None

        # 获取实时行情
        quote_result = await self.data_router.get_quotes([symbol])
        quote = quote_result.get(symbol)

        if not quote:
            return False, f"无法获取股票 {symbol} 的行情数据", None

        price = Decimal(str(quote.price))
        name = quote.name

        # 计算卖出金额和盈亏
        total_amount = price * quantity
        cost_basis = Decimal(str(position.avg_cost)) * quantity
        realized_pnl = float(total_amount - cost_basis)

        # 执行交易
        trade_id = str(uuid.uuid4())
        trade = TradeModel(
            id=trade_id,
            agent_id=agent_id,
            symbol=symbol,
            action="sell",
            quantity=quantity,
            price=float(price),
            total_amount=float(total_amount),
            realized_pnl=realized_pnl,
            decision_reason=decision_reason,
            timestamp=datetime.utcnow()
        )

        # 更新或删除持仓
        if position.quantity == quantity:
            await db.execute(
                delete(PositionModel).where(
                    PositionModel.agent_id == agent_id,
                    PositionModel.symbol == symbol
                )
            )
        else:
            position.quantity -= quantity
            position.current_price = float(price)

        # 更新资金
        agent.current_capital += float(total_amount)
        agent.updated_at = datetime.utcnow()

        db.add(trade)
        await db.commit()

        return True, (
            f"卖出成功：{name} ({symbol}) {quantity}股 @ {float(price):.2f}，"
            f"盈亏：{realized_pnl:+.2f}"
        ), TradeResponse(
            id=trade_id,
            agent_id=agent_id,
            symbol=symbol,
            name=name,
            action="sell",
            quantity=quantity,
            price=float(price),
            total_amount=float(total_amount),
            realized_pnl=realized_pnl,
            decision_reason=decision_reason,
            timestamp=trade.timestamp
        )

    async def get_positions(
        self,
        db: AsyncSession,
        agent_id: str
    ) -> List[PositionResponse]:
        """获取持仓列表"""
        result = await db.execute(
            select(PositionModel).where(PositionModel.agent_id == agent_id)
        )
        positions = result.scalars().all()

        # 更新当前价格
        position_list = []
        for pos in positions:
            # 获取最新价格
            quote_result = await self.data_router.get_quotes([pos.symbol])
            quote = quote_result.get(pos.symbol)

            current_price = quote.price if quote else pos.current_price
            market_value = pos.quantity * current_price if current_price else 0
            unrealized_pnl = market_value - (pos.quantity * pos.avg_cost)
            unrealized_pnl_pct = (
                (current_price - pos.avg_cost) / pos.avg_cost * 100
                if pos.avg_cost and current_price else 0
            )

            position_list.append(PositionResponse(
                agent_id=agent_id,
                symbol=pos.symbol,
                name=pos.name or quote.name if quote else pos.symbol,
                quantity=pos.quantity,
                avg_cost=pos.avg_cost,
                current_price=current_price,
                market_value=market_value,
                unrealized_pnl=unrealized_pnl,
                unrealized_pnl_pct=unrealized_pnl_pct
            ))

        return position_list

    async def get_trades(
        self,
        db: AsyncSession,
        agent_id: str,
        limit: int = 50
    ) -> List[TradeResponse]:
        """获取交易历史"""
        result = await db.execute(
            select(TradeModel)
            .where(TradeModel.agent_id == agent_id)
            .order_by(TradeModel.timestamp.desc())
            .limit(limit)
        )
        trades = result.scalars().all()

        return [
            TradeResponse(
                id=trade.id,
                agent_id=trade.agent_id,
                symbol=trade.symbol,
                name=None,  # 可从持仓或行情获取
                action=trade.action,
                quantity=trade.quantity,
                price=trade.price,
                total_amount=trade.total_amount,
                realized_pnl=trade.realized_pnl,
                decision_reason=trade.decision_reason,
                timestamp=trade.timestamp
            )
            for trade in trades
        ]

    async def get_portfolio_summary(
        self,
        db: AsyncSession,
        agent_id: str
    ) -> dict:
        """获取账户组合概览"""
        # 获取AI代理
        result = await db.execute(
            select(AgentModel).where(AgentModel.id == agent_id)
        )
        agent = result.scalar_one_or_none()

        if not agent:
            return None

        # 获取持仓
        positions = await self.get_positions(db, agent_id)

        # 计算市值
        position_value = sum(p.market_value for p in positions)
        total_value = agent.current_capital + position_value
        total_return = total_value - agent.initial_capital
        total_return_pct = (
            (total_return / agent.initial_capital * 100)
            if agent.initial_capital > 0 else 0
        )

        return {
            "agent_id": agent_id,
            "cash": agent.current_capital,
            "position_value": position_value,
            "total_value": total_value,
            "initial_capital": agent.initial_capital,
            "total_return": total_return,
            "total_return_pct": total_return_pct,
            "positions_count": len(positions),
            "updated_at": datetime.utcnow().isoformat()
        }

    async def get_agent(
        self,
        db: AsyncSession,
        agent_id: str
    ) -> Optional[AgentModel]:
        """获取AI代理"""
        result = await db.execute(
            select(AgentModel).where(AgentModel.id == agent_id)
        )
        return result.scalar_one_or_none()

    async def get_position(
        self,
        db: AsyncSession,
        agent_id: str,
        symbol: str
    ) -> Optional[PositionModel]:
        """获取特定持仓"""
        result = await db.execute(
            select(PositionModel).where(
                PositionModel.agent_id == agent_id,
                PositionModel.symbol == symbol
            )
        )
        return result.scalar_one_or_none()

    async def execute_trade(
        self,
        db: AsyncSession,
        agent_id: str,
        trade_data: TradeCreate,
        decision_reason: Optional[str] = None
    ) -> TradeResponse:
        """执行交易（buy/sell 路由）"""
        if trade_data.action == "buy":
            success, msg, trade = await self.execute_buy(
                db, agent_id, trade_data.symbol,
                trade_data.quantity, decision_reason
            )
        else:
            success, msg, trade = await self.execute_sell(
                db, agent_id, trade_data.symbol,
                trade_data.quantity, decision_reason
            )

        if not success:
            raise ValueError(msg)
        return trade


def get_trading_service() -> TradingService:
    """获取交易服务实例（依赖注入用）

    2026-03-11: 重构后移除全局实例，每次调用创建新实例
    保持与 FastAPI Depends 兼容，实际数据库会话由调用方传入
    """
    return TradingService()
