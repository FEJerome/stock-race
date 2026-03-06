"""
SQLite存储实现

最小依赖原则：使用Python标准库sqlite3
后续可无缝替换为PostgreSQL实现

依据：DELIVERY_PLAN.md Local存储定义
"""

import json
import sqlite3
from decimal import Decimal
from pathlib import Path
from typing import List, Optional
from uuid import UUID

from core.domain.models import AIAgent, Trade, Portfolio, Position, Strategy
from adapters.storage.interface import Storage


class SQLiteStorage(Storage):
    """
    SQLite存储实现
    
    数据存储在本地文件，适合Local模式单机使用
    """
    
    def __init__(self, db_path: str = "data/local.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn: Optional[sqlite3.Connection] = None
    
    def _get_connection(self) -> sqlite3.Connection:
        """获取数据库连接"""
        if self._conn is None:
            self._conn = sqlite3.connect(self.db_path)
            # 启用外键支持
            self._conn.execute("PRAGMA foreign_keys = ON")
            # 自定义JSON序列化
            self._conn.row_factory = sqlite3.Row
        return self._conn
    
    def init_schema(self) -> None:
        """初始化数据库表结构"""
        conn = self._get_connection()
        
        # AI交易员表
        conn.execute("""
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                initial_capital TEXT NOT NULL,
                current_capital TEXT NOT NULL,
                strategy TEXT NOT NULL,  -- JSON
                model_provider TEXT DEFAULT 'deepseek',
                model_name TEXT DEFAULT 'deepseek-chat',
                status TEXT DEFAULT 'idle',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                total_trades INTEGER DEFAULT 0,
                winning_trades INTEGER DEFAULT 0,
                total_return TEXT DEFAULT '0'
            )
        """)
        
        # 交易记录表
        conn.execute("""
            CREATE TABLE IF NOT EXISTS trades (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                action TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                price TEXT NOT NULL,
                realized_pnl TEXT,
                timestamp TEXT NOT NULL,
                decision_reason TEXT,
                FOREIGN KEY (agent_id) REFERENCES agents(id)
            )
        """)
        
        # 持仓表
        conn.execute("""
            CREATE TABLE IF NOT EXISTS positions (
                agent_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                avg_cost TEXT NOT NULL,
                current_price TEXT NOT NULL,
                PRIMARY KEY (agent_id, symbol),
                FOREIGN KEY (agent_id) REFERENCES agents(id)
            )
        """)
        
        conn.commit()
    
    def save_agent(self, agent: AIAgent) -> None:
        """保存AI交易员"""
        conn = self._get_connection()
        conn.execute(
            """
            INSERT OR REPLACE INTO agents (
                id, name, initial_capital, current_capital, strategy,
                model_provider, model_name, status, created_at, updated_at,
                total_trades, winning_trades, total_return
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(agent.id),
                agent.name,
                str(agent.initial_capital),
                str(agent.current_capital),
                agent.strategy.model_dump_json(),
                agent.model_provider,
                agent.model_name,
                agent.status.value,
                agent.created_at.isoformat(),
                agent.updated_at.isoformat(),
                agent.total_trades,
                agent.winning_trades,
                str(agent.total_return)
            )
        )
        conn.commit()
    
    def get_agent(self, agent_id: UUID) -> Optional[AIAgent]:
        """获取AI交易员"""
        conn = self._get_connection()
        row = conn.execute(
            "SELECT * FROM agents WHERE id = ?",
            (str(agent_id),)
        ).fetchone()
        
        if row is None:
            return None
        
        return self._row_to_agent(row)
    
    def list_agents(self) -> List[AIAgent]:
        """列出所有AI交易员"""
        conn = self._get_connection()
        rows = conn.execute("SELECT * FROM agents ORDER BY created_at DESC").fetchall()
        return [self._row_to_agent(row) for row in rows]
    
    def update_agent(self, agent: AIAgent) -> None:
        """更新AI交易员（同save_agent）"""
        self.save_agent(agent)
    
    def save_trade(self, trade: Trade) -> None:
        """保存交易记录"""
        conn = self._get_connection()
        conn.execute(
            """
            INSERT INTO trades (
                id, agent_id, symbol, action, quantity, price,
                realized_pnl, timestamp, decision_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(trade.id),
                str(trade.agent_id),
                trade.symbol,
                trade.action.value,
                trade.quantity,
                str(trade.price),
                str(trade.realized_pnl) if trade.realized_pnl else None,
                trade.timestamp.isoformat(),
                trade.decision_reason
            )
        )
        conn.commit()
    
    def get_trades_by_agent(self, agent_id: UUID) -> List[Trade]:
        """获取AI交易员的所有交易"""
        conn = self._get_connection()
        rows = conn.execute(
            "SELECT * FROM trades WHERE agent_id = ? ORDER BY timestamp DESC",
            (str(agent_id),)
        ).fetchall()
        
        return [self._row_to_trade(row) for row in rows]
    
    def save_portfolio(self, portfolio: Portfolio) -> None:
        """保存账户组合（存储持仓）"""
        conn = self._get_connection()
        
        # 删除旧持仓
        conn.execute(
            "DELETE FROM positions WHERE agent_id = ?",
            (str(portfolio.agent_id),)
        )
        
        # 插入新持仓
        for position in portfolio.positions:
            conn.execute(
                """
                INSERT INTO positions (agent_id, symbol, quantity, avg_cost, current_price)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    str(portfolio.agent_id),
                    position.symbol,
                    position.quantity,
                    str(position.avg_cost),
                    str(position.current_price)
                )
            )
        
        conn.commit()
    
    def get_latest_portfolio(self, agent_id: UUID) -> Optional[Portfolio]:
        """获取最新账户组合"""
        conn = self._get_connection()
        
        # 获取现金
        row = conn.execute(
            "SELECT current_capital FROM agents WHERE id = ?",
            (str(agent_id),)
        ).fetchone()
        
        if row is None:
            return None
        
        cash = Decimal(row["current_capital"])
        
        # 获取持仓
        position_rows = conn.execute(
            "SELECT * FROM positions WHERE agent_id = ?",
            (str(agent_id),)
        ).fetchall()
        
        positions = [
            Position(
                symbol=row["symbol"],
                quantity=row["quantity"],
                avg_cost=Decimal(row["avg_cost"]),
                current_price=Decimal(row["current_price"])
            )
            for row in position_rows
        ]
        
        return Portfolio(agent_id=agent_id, cash=cash, positions=positions)
    
    def _row_to_agent(self, row: sqlite3.Row) -> AIAgent:
        """数据库行转换为AIAgent对象"""
        from datetime import datetime
        from core.domain.enums import AgentStatus, RiskLevel, HoldingPeriod
        
        strategy_data = json.loads(row["strategy"])
        strategy = Strategy(
            risk_level=RiskLevel(strategy_data["risk_level"]),
            focus_sectors=strategy_data.get("focus_sectors", []),
            holding_period=HoldingPeriod(strategy_data["holding_period"]),
            max_position_per_stock=Decimal(strategy_data.get("max_position_per_stock", "0.3")),
            stop_loss_discipline=strategy_data.get("stop_loss_discipline", "strict"),
            market_scope=strategy_data.get("market_scope", "main_board"),
            custom_rules=strategy_data.get("custom_rules")
        )
        
        return AIAgent(
            id=UUID(row["id"]),
            name=row["name"],
            initial_capital=Decimal(row["initial_capital"]),
            current_capital=Decimal(row["current_capital"]),
            strategy=strategy,
            model_provider=row["model_provider"],
            model_name=row["model_name"],
            status=AgentStatus(row["status"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            total_trades=row["total_trades"],
            winning_trades=row["winning_trades"],
            total_return=Decimal(row["total_return"])
        )
    
    def _row_to_trade(self, row: sqlite3.Row) -> Trade:
        """数据库行转换为Trade对象"""
        from datetime import datetime
        from core.domain.enums import DecisionAction
        
        return Trade(
            id=UUID(row["id"]),
            agent_id=UUID(row["agent_id"]),
            symbol=row["symbol"],
            action=DecisionAction(row["action"]),
            quantity=row["quantity"],
            price=Decimal(row["price"]),
            realized_pnl=Decimal(row["realized_pnl"]) if row["realized_pnl"] else None,
            timestamp=datetime.fromisoformat(row["timestamp"]),
            decision_reason=row["decision_reason"]
        )
