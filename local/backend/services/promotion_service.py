"""
职级晋升服务 - AI交易员职级晋升逻辑

依据: PRD.md 4.1.5 AI激励机制、4.1.6 称号系统
"""
from enum import Enum
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from models.database import AgentModel, TradeModel


class AgentRank(str, Enum):
    """AI交易员职级"""
    INTERN = "intern"       # 实习生
    MANAGER = "manager"     # 经理
    PARTNER = "partner"     # 合伙人


@dataclass
class PromotionResult:
    """晋升检查结果"""
    eligible: bool                    # 是否满足晋升条件
    current_rank: str                 # 当前职级
    next_rank: Optional[str]          # 下一职级
    current_level: int                # 当前等级 (1-20)
    requirements: Dict[str, Any]      # 晋升要求
    meets_requirements: Dict[str, bool]  # 各条件是否满足
    reason: str                       # 说明


class PromotionService:
    """
    职级晋升服务

    管理AI交易员的职级晋升逻辑：
    - 实习生(intern): Lv.1-6
    - 经理(manager): Lv.7-12
    - 合伙人(partner): Lv.13-20

    升级经验值计算：
    - 每5个交易日+经验
    - 收益率达标额外加成
    """

    # 职级配置
    RANK_CONFIG = {
        AgentRank.INTERN: {
            "max_level": 6,
            "next_rank": AgentRank.MANAGER,
            "title_template": "Lv.{level} 实习生",
            "max_trading_limit": 100000,  # 10万单日限额
        },
        AgentRank.MANAGER: {
            "max_level": 12,
            "next_rank": AgentRank.PARTNER,
            "title_template": "Lv.{level} 经理",
            "max_trading_limit": 500000,  # 50万单日限额
        },
        AgentRank.PARTNER: {
            "max_level": 20,
            "next_rank": None,
            "title_template": "Lv.{level} 合伙人",
            "max_trading_limit": None,  # 无限制
        },
    }

    # 等级经验阈值 (累计交易天数要求)
    LEVEL_EXPERIENCE = {
        1: 0,
        2: 5,    # 5个交易日
        3: 10,
        4: 20,
        5: 35,
        6: 50,   # 实习生满级
        7: 70,   # 经理开始
        8: 90,
        9: 115,
        10: 140,
        11: 170,
        12: 200, # 经理满级
        13: 240, # 合伙人开始
        14: 280,
        15: 325,
        16: 370,
        17: 420,
        18: 470,
        19: 525,
        20: 580, # 合伙人满级
    }

    # 晋升收益率要求
    PROMOTION_RETURN_REQUIREMENTS = {
        AgentRank.INTERN: 0.05,    # 实习生晋升经理需5%收益
        AgentRank.MANAGER: 0.15,   # 经理晋升合伙人需15%收益
    }

    # 晋升最低交易次数要求
    PROMOTION_TRADE_REQUIREMENTS = {
        AgentRank.INTERN: 10,      # 实习生晋升需10笔交易
        AgentRank.MANAGER: 30,     # 经理晋升需30笔交易
    }

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_agent_stats(self, agent_id: str) -> Dict[str, Any]:
        """
        获取AI交易员的统计数据

        Returns:
            {
                "total_trades": 总交易次数,
                "winning_trades": 盈利次数,
                "total_return_pct": 总收益率,
                "active_days": 活跃交易天数,
            }
        """
        # 获取交易统计
        result = await self.db.execute(
            select(
                func.count(TradeModel.id).label("total_trades"),
                func.count(
                    TradeModel.id
                ).filter(
                    TradeModel.realized_pnl > 0
                ).label("winning_trades"),
            ).where(TradeModel.agent_id == agent_id)
        )
        stats = result.one()

        # 获取活跃交易天数
        result = await self.db.execute(
            select(
                func.count(
                    func.distinct(func.date(TradeModel.timestamp))
                ).label("active_days")
            ).where(TradeModel.agent_id == agent_id)
        )
        active_days = result.scalar() or 0

        # 获取收益率
        result = await self.db.execute(
            select(AgentModel).where(AgentModel.id == agent_id)
        )
        agent = result.scalar_one_or_none()

        total_return_pct = 0.0
        if agent and agent.initial_capital > 0:
            total_return_pct = (
                (agent.current_capital - agent.initial_capital)
                / agent.initial_capital
            )

        return {
            "total_trades": stats.total_trades or 0,
            "winning_trades": stats.winning_trades or 0,
            "total_return_pct": total_return_pct,
            "active_days": active_days,
        }

    async def calculate_level(self, agent_id: str) -> int:
        """
        计算AI交易员的当前等级

        基于活跃交易天数计算等级
        """
        stats = await self.get_agent_stats(agent_id)
        active_days = stats["active_days"]

        # 根据活跃天数确定等级
        current_level = 1
        for level, required_days in sorted(self.LEVEL_EXPERIENCE.items()):
            if active_days >= required_days:
                current_level = level
            else:
                break

        return current_level

    async def check_promotion_eligible(self, agent_id: str) -> PromotionResult:
        """
        检查AI交易员是否满足晋升条件

        Returns:
            PromotionResult 包含晋升检查结果
        """
        # 获取Agent信息
        result = await self.db.execute(
            select(AgentModel).where(AgentModel.id == agent_id)
        )
        agent = result.scalar_one_or_none()

        if not agent:
            return PromotionResult(
                eligible=False,
                current_rank="unknown",
                next_rank=None,
                current_level=1,
                requirements={},
                meets_requirements={},
                reason="Agent not found"
            )

        current_rank = AgentRank(agent.agent_level)
        rank_config = self.RANK_CONFIG[current_rank]

        # 检查是否已达最高职级
        if rank_config["next_rank"] is None:
            return PromotionResult(
                eligible=False,
                current_rank=current_rank.value,
                next_rank=None,
                current_level=await self.calculate_level(agent_id),
                requirements={},
                meets_requirements={},
                reason="Already at highest rank (Partner)"
            )

        # 获取统计数据
        stats = await self.get_agent_stats(agent_id)
        current_level = await self.calculate_level(agent_id)

        # 检查是否达到当前职级满级
        meets_level_requirement = current_level >= rank_config["max_level"]

        # 检查收益率要求
        min_return = self.PROMOTION_RETURN_REQUIREMENTS.get(current_rank, 0)
        meets_return_requirement = stats["total_return_pct"] >= min_return

        # 检查交易次数要求
        min_trades = self.PROMOTION_TRADE_REQUIREMENTS.get(current_rank, 0)
        meets_trade_requirement = stats["total_trades"] >= min_trades

        # 综合判断
        meets_all = (
            meets_level_requirement and
            meets_return_requirement and
            meets_trade_requirement
        )

        next_rank = rank_config["next_rank"]

        return PromotionResult(
            eligible=meets_all,
            current_rank=current_rank.value,
            next_rank=next_rank.value if next_rank else None,
            current_level=current_level,
            requirements={
                "min_level": rank_config["max_level"],
                "min_return_pct": min_return * 100,
                "min_trades": min_trades,
            },
            meets_requirements={
                "level": meets_level_requirement,
                "return": meets_return_requirement,
                "trades": meets_trade_requirement,
            },
            reason=self._build_reason(
                meets_all, meets_level_requirement,
                meets_return_requirement, meets_trade_requirement,
                current_level, stats, min_return, min_trades
            )
        )

    def _build_reason(
        self,
        meets_all: bool,
        meets_level: bool,
        meets_return: bool,
        meets_trades: bool,
        current_level: int,
        stats: Dict[str, Any],
        min_return: float,
        min_trades: int
    ) -> str:
        """构建晋升说明"""
        if meets_all:
            return "恭喜！满足所有晋升条件"

        reasons = []
        if not meets_level:
            reasons.append(f"等级不足 (当前Lv.{current_level})")
        if not meets_return:
            reasons.append(
                f"收益率未达标 (当前{stats['total_return_pct']*100:.1f}%, "
                f"需要{min_return*100:.1f}%)"
            )
        if not meets_trades:
            reasons.append(
                f"交易次数不足 (当前{stats['total_trades']}笔, "
                f"需要{min_trades}笔)"
            )

        return "; ".join(reasons)

    async def promote_agent(self, agent_id: str) -> Tuple[bool, str]:
        """
        执行晋升操作

        Returns:
            (success, message)
        """
        result = await self.check_promotion_eligible(agent_id)

        if not result.eligible:
            return False, f"不满足晋升条件: {result.reason}"

        # 获取Agent
        db_result = await self.db.execute(
            select(AgentModel).where(AgentModel.id == agent_id)
        )
        agent = db_result.scalar_one_or_none()

        if not agent:
            return False, "Agent not found"

        # 执行晋升
        old_rank = agent.agent_level
        new_rank = result.next_rank

        agent.agent_level = new_rank
        agent.updated_at = datetime.utcnow()

        await self.db.commit()

        return True, (
            f"晋升成功！{agent.name} 从 "
            f"[{self._get_rank_title(old_rank)}] 晋升为 "
            f"[{self._get_rank_title(new_rank)}]"
        )

    def _get_rank_title(self, rank: str) -> str:
        """获取职级显示名称"""
        titles = {
            AgentRank.INTERN.value: "实习生",
            AgentRank.MANAGER.value: "经理",
            AgentRank.PARTNER.value: "合伙人",
        }
        return titles.get(rank, rank)

    async def get_agent_title(self, agent_id: str) -> str:
        """
        获取AI交易员的完整称号

        Returns:
            例如: "Lv.8 经理" 或 "Lv.15 合伙人"
        """
        result = await self.db.execute(
            select(AgentModel).where(AgentModel.id == agent_id)
        )
        agent = result.scalar_one_or_none()

        if not agent:
            return "Unknown"

        level = await self.calculate_level(agent_id)
        rank = AgentRank(agent.agent_level)
        config = self.RANK_CONFIG[rank]

        return config["title_template"].format(level=level)

    async def get_promotion_progress(self, agent_id: str) -> Dict[str, Any]:
        """
        获取晋升进度详情

        Returns:
            包含当前状态和进度条信息的字典
        """
        result = await self.check_promotion_eligible(agent_id)
        stats = await self.get_agent_stats(agent_id)

        progress = {
            "current_rank": result.current_rank,
            "current_level": result.current_level,
            "next_rank": result.next_rank,
            "can_promote": result.eligible,
            "reason": result.reason,
            "stats": stats,
        }

        # 添加各条件进度
        if result.requirements:
            progress["progress"] = {
                "level": {
                    "current": result.current_level,
                    "required": result.requirements.get("min_level", 0),
                    "met": result.meets_requirements.get("level", False),
                },
                "return_pct": {
                    "current": round(stats["total_return_pct"] * 100, 2),
                    "required": result.requirements.get("min_return_pct", 0),
                    "met": result.meets_requirements.get("return", False),
                },
                "trades": {
                    "current": stats["total_trades"],
                    "required": result.requirements.get("min_trades", 0),
                    "met": result.meets_requirements.get("trades", False),
                },
            }

        return progress


# 便捷函数
async def check_agent_promotion(
    db: AsyncSession,
    agent_id: str
) -> PromotionResult:
    """检查AI交易员晋升资格"""
    service = PromotionService(db)
    return await service.check_promotion_eligible(agent_id)


async def promote_agent(
    db: AsyncSession,
    agent_id: str
) -> Tuple[bool, str]:
    """执行AI交易员晋升"""
    service = PromotionService(db)
    return await service.promote_agent(agent_id)
