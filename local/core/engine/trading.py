"""
虚拟交易引擎

依据：PRD.md 4.3 交易系统
简化版：Local模式无实时行情，基于CSV数据模拟
"""

from datetime import datetime
from decimal import Decimal, ROUND_DOWN
from typing import Optional, Tuple
from uuid import UUID

from core.domain.models import (
    AIAgent, Trade, Position, Portfolio, 
    DecisionAction, StockData
)
from core.domain.enums import AgentStatus
from adapters.storage.interface import Storage
from adapters.datasource.interface import DataSource


class TradingEngine:
    """
    虚拟交易引擎
    
    执行虚拟买卖、持仓管理、收益计算
    """
    
    def __init__(self, storage: Storage, data_source: DataSource):
        self.storage = storage
        self.data_source = data_source
    
    def execute_trade(
        self,
        agent_id: UUID,
        symbol: str,
        action: DecisionAction,
        quantity: int,
        decision_reason: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        执行交易
        
        Returns:
            (是否成功, 消息)
        """
        # 获取AI交易员
        agent = self.storage.get_agent(agent_id)
        if not agent:
            return False, "AI交易员不存在"
        
        # 获取当前股价
        stock_data = self.data_source.get_stock_data(symbol)
        if not stock_data:
            return False, f"无法获取股票 {symbol} 数据"
        
        current_price = stock_data.price
        
        # 获取当前持仓
        portfolio = self.storage.get_latest_portfolio(agent_id)
        if not portfolio:
            portfolio = Portfolio(agent_id=agent_id, cash=agent.current_capital)
        
        # 执行交易
        if action == DecisionAction.BUY:
            return self._execute_buy(agent, portfolio, symbol, quantity, current_price, decision_reason)
        elif action == DecisionAction.SELL:
            return self._execute_sell(agent, portfolio, symbol, quantity, current_price, decision_reason)
        else:
            return False, f"不支持的操: {action}"
    
    def _execute_buy(
        self,
        agent: AIAgent,
        portfolio: Portfolio,
        symbol: str,
        quantity: int,
        price: Decimal,
        decision_reason: Optional[str]
    ) -> Tuple[bool, str]:
        """执行买入"""
        # 计算成本
        cost = price * Decimal(str(quantity))
        
        # 检查资金
        if cost > portfolio.cash:
            return False, f"资金不足，需要 {cost}，可用 {portfolio.cash}"
        
        # 检查仓位限制
        position_value = price * Decimal(str(quantity))
        total_value = portfolio.total_value
        
        if total_value > 0:
            position_ratio = position_value / total_value
            max_ratio = agent.strategy.max_position_per_stock
            
            if position_ratio > max_ratio:
                return False, f"超出单股仓位限制 {max_ratio}"
        
        # 执行交易
        portfolio.cash -= cost
        
        # 更新或创建持仓
        existing_position = next(
            (p for p in portfolio.positions if p.symbol == symbol),
            None
        )
        
        if existing_position:
            # 更新持仓
            total_cost = (existing_position.avg_cost * existing_position.quantity) + cost
            total_quantity = existing_position.quantity + quantity
            existing_position.avg_cost = (total_cost / Decimal(str(total_quantity))).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
            existing_position.quantity = total_quantity
            existing_position.current_price = price
        else:
            # 新建持仓
            portfolio.positions.append(Position(
                symbol=symbol,
                quantity=quantity,
                avg_cost=price,
                current_price=price
            ))
        
        # 保存交易记录
        trade = Trade(
            agent_id=agent.id,
            symbol=symbol,
            action=DecisionAction.BUY,
            quantity=quantity,
            price=price,
            decision_reason=decision_reason
        )
        self.storage.save_trade(trade)
        self.storage.save_portfolio(portfolio)
        
        # 更新AI资金
        agent.current_capital = portfolio.cash
        self.storage.update_agent(agent)
        
        return True, f"买入成功：{symbol} {quantity}股 @ {price}"
    
    def _execute_sell(
        self,
        agent: AIAgent,
        portfolio: Portfolio,
        symbol: str,
        quantity: int,
        price: Decimal,
        decision_reason: Optional[str]
    ) -> Tuple[bool, str]:
        """执行卖出"""
        # 查找持仓
        position = next(
            (p for p in portfolio.positions if p.symbol == symbol),
            None
        )
        
        if not position:
            return False, f"没有 {symbol} 持仓"
        
        if position.quantity < quantity:
            return False, f"持仓不足，持有 {position.quantity}，卖出 {quantity}"
        
        # 计算实现盈亏
        sell_value = price * Decimal(str(quantity))
        cost_basis = position.avg_cost * Decimal(str(quantity))
        realized_pnl = sell_value - cost_basis
        
        # 执行交易
        portfolio.cash += sell_value
        
        # 更新或删除持仓
        if position.quantity == quantity:
            portfolio.positions.remove(position)
        else:
            position.quantity -= quantity
            position.current_price = price
        
        # 保存交易记录
        trade = Trade(
            agent_id=agent.id,
            symbol=symbol,
            action=DecisionAction.SELL,
            quantity=quantity,
            price=price,
            realized_pnl=realized_pnl,
            decision_reason=decision_reason
        )
        self.storage.save_trade(trade)
        self.storage.save_portfolio(portfolio)
        
        # 更新AI资金和统计
        agent.current_capital = portfolio.cash
        is_win = realized_pnl > 0
        agent.total_trades += 1
        if is_win:
            agent.winning_trades += 1
        agent.total_return += realized_pnl
        agent.updated_at = datetime.now()
        self.storage.update_agent(agent)
        
        return True, f"卖出成功：{symbol} {quantity}股 @ {price}，盈亏：{realized_pnl:+.2f}"
    
    def get_portfolio(self, agent_id: UUID) -> Optional[Portfolio]:
        """获取账户组合"""
        return self.storage.get_latest_portfolio(agent_id)
    
    def get_trade_history(self, agent_id: UUID) -> list[Trade]:
        """获取交易历史"""
        return self.storage.get_trades_by_agent(agent_id)
