"""
存储适配器接口

依据：洋葱圈模型 - 适配层抽象
      DELIVERY_PLAN.md Local使用SQLite，MVP/Full使用PostgreSQL
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from core.domain.models import AIAgent, Trade, Portfolio


class Storage(ABC):
    """
    存储抽象接口
    
    实现开闭原则：新增存储方式只需实现此接口
    Local: SQLiteStorage
    MVP/Full: PostgreSQLStorage
    """
    
    @abstractmethod
    def init_schema(self) -> None:
        """初始化数据库结构"""
        pass
    
    # AIAgent 操作
    @abstractmethod
    def save_agent(self, agent: AIAgent) -> None:
        """保存AI交易员"""
        pass
    
    @abstractmethod
    def get_agent(self, agent_id: UUID) -> Optional[AIAgent]:
        """获取AI交易员"""
        pass
    
    @abstractmethod
    def list_agents(self) -> List[AIAgent]:
        """列出所有AI交易员"""
        pass
    
    @abstractmethod
    def update_agent(self, agent: AIAgent) -> None:
        """更新AI交易员"""
        pass
    
    # Trade 操作
    @abstractmethod
    def save_trade(self, trade: Trade) -> None:
        """保存交易记录"""
        pass
    
    @abstractmethod
    def get_trades_by_agent(self, agent_id: UUID) -> List[Trade]:
        """获取AI交易员的所有交易"""
        pass
    
    # Portfolio 操作
    @abstractmethod
    def save_portfolio(self, portfolio: Portfolio) -> None:
        """保存账户组合快照"""
        pass
    
    @abstractmethod
    def get_latest_portfolio(self, agent_id: UUID) -> Optional[Portfolio]:
        """获取最新账户组合"""
        pass
