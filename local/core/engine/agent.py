"""
AI交易员生命周期管理

依据：PRD.md 4.2.1 雇佣流程
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from core.domain.models import AIAgent, Strategy
from core.domain.enums import AgentStatus, RiskLevel, HoldingPeriod
from adapters.storage.interface import Storage


class AgentEngine:
    """
    AI交易员引擎
    
    负责AI交易员的创建、查询、状态管理
    """
    
    def __init__(self, storage: Storage):
        self.storage = storage
    
    def create_agent(
        self,
        name: str,
        initial_capital: Decimal,
        strategy: Strategy,
        model_provider: str = "deepseek",
        model_name: str = "deepseek-chat"
    ) -> AIAgent:
        """
        创建新的AI交易员
        
        依据：PRD.md 4.2.1 创建流程简化版（Local无雇佣扣费逻辑）
        """
        agent = AIAgent(
            name=name,
            initial_capital=initial_capital,
            current_capital=initial_capital,
            strategy=strategy,
            model_provider=model_provider,
            model_name=model_name,
            status=AgentStatus.IDLE
        )
        
        # 保存到存储
        self.storage.save_agent(agent)
        
        return agent
    
    def get_agent(self, agent_id: UUID) -> Optional[AIAgent]:
        """获取AI交易员"""
        return self.storage.get_agent(agent_id)
    
    def list_agents(self) -> list[AIAgent]:
        """列出所有AI交易员"""
        return self.storage.list_agents()
    
    def update_agent_status(self, agent_id: UUID, status: AgentStatus) -> bool:
        """更新AI交易员状态"""
        agent = self.get_agent(agent_id)
        if not agent:
            return False
        
        agent.status = status
        agent.updated_at = datetime.now()
        self.storage.update_agent(agent)
        return True
    
    def update_agent_capital(self, agent_id: UUID, new_capital: Decimal) -> bool:
        """更新AI交易员资金"""
        agent = self.get_agent(agent_id)
        if not agent:
            return False
        
        agent.current_capital = new_capital
        agent.updated_at = datetime.now()
        self.storage.update_agent(agent)
        return True
    
    def record_trade_result(
        self, 
        agent_id: UUID, 
        is_win: bool, 
        realized_pnl: Decimal
    ) -> bool:
        """
        记录交易结果，更新统计数据
        
        Args:
            agent_id: AI交易员ID
            is_win: 是否盈利
            realized_pnl: 实现盈亏
        """
        agent = self.get_agent(agent_id)
        if not agent:
            return False
        
        agent.total_trades += 1
        if is_win:
            agent.winning_trades += 1
        agent.total_return += realized_pnl
        agent.updated_at = datetime.now()
        
        self.storage.update_agent(agent)
        return True
