"""
枚举定义
"""

from enum import Enum


class RiskLevel(str, Enum):
    """风险承受等级 - PRD.md 4.2.2"""
    CONSERVATIVE = "conservative"      # 保守(-5%回撤)
    MODERATE = "moderate"              # 稳健(-10%)
    AGGRESSIVE = "aggressive"          # 激进(-20%)
    EXTREME = "extreme"                # 极度(-30%或无)


class HoldingPeriod(str, Enum):
    """持仓周期 - PRD.md 4.2.2"""
    ULTRA_SHORT = "ultra_short"        # 超短线(1-3天)
    SHORT = "short"                    # 短线(1-2周)
    MEDIUM = "medium"                  # 中线(1-3月)
    LONG = "long"                      # 长线(3月+)


class DecisionAction(str, Enum):
    """交易决策动作"""
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"
    WATCH = "watch"


class AgentStatus(str, Enum):
    """AI交易员状态"""
    IDLE = "idle"
    MONITORING = "monitoring"
    DECISION_PENDING = "decision_pending"
    EXECUTING = "executing"
    REVIEWING = "reviewing"
