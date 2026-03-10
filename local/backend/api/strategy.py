"""
策略收集API - 对话式策略配置

依据：PRD.md 4.2.2 策略收集机制
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from enum import Enum
from datetime import datetime
import uuid

from models.schemas import ApiResponse, StrategyConfig

router = APIRouter(prefix="/api/strategy", tags=["strategy"])


class RiskLevel(str, Enum):
    """风险承受等级"""
    CONSERVATIVE = "conservative"  # 保守
    MODERATE = "moderate"          # 稳健
    AGGRESSIVE = "aggressive"      # 积极
    EXTREME = "extreme"            # 极度


class HoldingPeriod(str, Enum):
    """持仓周期"""
    ULTRA_SHORT = "ultra_short"    # 超短线(1-3天)
    SHORT = "short"                # 短线(1-2周)
    MEDIUM = "medium"              # 中线(1-3月)
    LONG = "long"                  # 长线(3月+)


class DialogueStep(str, Enum):
    """对话步骤"""
    RISK = "risk"                  # 风险承受
    SECTORS = "sectors"            # 关注板块
    HOLDING = "holding"            # 持仓周期
    POSITION = "position"          # 仓位限制
    STOP_LOSS = "stop_loss"        # 止损策略
    MARKET = "market"              # 市场范围
    COMPLETE = "complete"          # 完成


class StrategyDialogueState(BaseModel):
    """策略收集对话状态"""
    session_id: str
    current_step: DialogueStep
    completed_steps: List[DialogueStep]
    strategy: StrategyConfig
    history: List[dict] = []


class StrategyDialogueRequest(BaseModel):
    """策略对话请求"""
    session_id: Optional[str] = None
    user_input: Optional[str] = Field(default="", description="用户输入")
    step: Optional[DialogueStep] = None


class StrategyDialogueResponse(BaseModel):
    """策略对话响应"""
    session_id: str
    current_step: DialogueStep
    next_question: str
    options: Optional[List[str]] = None
    collected_info: dict
    progress_percent: int
    is_complete: bool


# 对话提示模板
DIALOGUE_PROMPTS = {
    DialogueStep.RISK: {
        "question": "您希望这个AI交易员采用什么样的风险策略？",
        "options": ["保守（最大回撤5%）", "稳健（最大回撤10%）", "积极（最大回撤20%）", "极度（最大回撤30%或无上限）"],
        "field": "risk_tolerance"
    },
    DialogueStep.SECTORS: {
        "question": "您希望AI交易员关注哪些板块？",
        "options": ["科技", "消费", "医药", "金融", "能源", "地产", "材料", "工业", "全市场"],
        "field": "sectors"
    },
    DialogueStep.HOLDING: {
        "question": "您期望的持仓周期是？",
        "options": ["超短线（1-3天）", "短线（1-2周）", "中线（1-3月）", "长线（3月以上）"],
        "field": "holding_period"
    },
    DialogueStep.POSITION: {
        "question": "单只股票的最大仓位限制？",
        "options": ["10%", "20%", "30%", "50%", "不设限"],
        "field": "position_limit"
    },
    DialogueStep.STOP_LOSS: {
        "question": "止损策略如何设置？",
        "options": ["5%严格止损", "8%止损", "10%止损", "15%止损", "不设止损/灵活处理"],
        "field": "stop_loss"
    },
    DialogueStep.MARKET: {
        "question": "交易范围选择？",
        "options": ["仅限主板（推荐新手）", "主板+创业板", "全市场（含科创/北交）"],
        "field": "market_scope"
    },
    DialogueStep.COMPLETE: {
        "question": "策略配置完成！",
        "options": [],
        "field": None
    }
}

# 内存存储对话状态（生产环境应使用Redis等）
dialogue_sessions: dict = {}


def get_next_step(current: DialogueStep) -> DialogueStep:
    """获取下一步"""
    steps = [
        DialogueStep.RISK,
        DialogueStep.SECTORS,
        DialogueStep.HOLDING,
        DialogueStep.POSITION,
        DialogueStep.STOP_LOSS,
        DialogueStep.MARKET,
        DialogueStep.COMPLETE
    ]
    try:
        idx = steps.index(current)
        return steps[min(idx + 1, len(steps) - 1)]
    except ValueError:
        return DialogueStep.RISK


def parse_user_input(step: DialogueStep, user_input: str) -> tuple:
    """解析用户输入，返回(解析值, 是否有效)"""
    user_input = user_input.strip()

    if step == DialogueStep.RISK:
        # 风险承受
        risk_map = {
            "保守": "保守", "稳健": "稳健", "积极": "积极", "极度": "极度",
            "conservative": "保守", "moderate": "稳健", "aggressive": "积极", "extreme": "极度"
        }
        for key, value in risk_map.items():
            if key in user_input.lower():
                return value, True
        return None, False

    elif step == DialogueStep.SECTORS:
        # 板块（支持多选）
        sectors = []
        all_sectors = ["科技", "消费", "医药", "金融", "能源", "地产", "材料", "工业"]
        if "全市场" in user_input or "all" in user_input.lower():
            return all_sectors, True
        for sector in all_sectors:
            if sector in user_input:
                sectors.append(sector)
        return sectors, len(sectors) > 0

    elif step == DialogueStep.HOLDING:
        # 持仓周期
        holding_map = {
            "超短线": "短线", "短线": "短线", "中线": "中线", "长线": "长线",
            "ultra_short": "短线", "short": "短线", "medium": "中线", "long": "长线"
        }
        for key, value in holding_map.items():
            if key in user_input.lower():
                return value, True
        return None, False

    elif step == DialogueStep.POSITION:
        # 仓位限制
        position_map = {
            "10%": "单股不超过10%", "20%": "单股不超过20%", "30%": "单股不超过30%",
            "50%": "单股不超过50%", "不设限": "不设限", "不限制": "不设限"
        }
        for key, value in position_map.items():
            if key in user_input:
                return value, True
        return None, False

    elif step == DialogueStep.STOP_LOSS:
        # 止损
        stop_loss_map = {
            "5%": "5%严格止损", "8%": "8%止损", "10%": "10%止损",
            "15%": "15%止损", "不设": "不设止损", "灵活": "灵活处理"
        }
        for key, value in stop_loss_map.items():
            if key in user_input:
                return value, True
        return None, False

    elif step == DialogueStep.MARKET:
        # 市场范围
        market_map = {
            "主板": "主板", "创业板": "主板+创业板", "全市场": "全市场",
            "main": "主板", "chinext": "主板+创业板", "all": "全市场"
        }
        for key, value in market_map.items():
            if key in user_input:
                return value, True
        return None, False

    return user_input, True


@router.post("/dialogue", response_model=ApiResponse)
async def strategy_dialogue(request: StrategyDialogueRequest):
    """
    策略收集对话

    通过多轮对话收集五维度策略配置
    """
    # 获取或创建会话
    if request.session_id and request.session_id in dialogue_sessions:
        session = dialogue_sessions[request.session_id]
        current_step = session["current_step"]
    else:
        # 新会话
        session_id = str(uuid.uuid4())
        current_step = DialogueStep.RISK
        session = {
            "session_id": session_id,
            "current_step": current_step,
            "completed_steps": [],
            "strategy": StrategyConfig(
                risk_tolerance="稳健",
                sectors=[],
                holding_period="中线",
                position_limit="单股不超过30%",
                stop_loss="8%止损",
                market_scope="主板+创业板"
            ),
            "history": []
        }
        dialogue_sessions[session_id] = session

        # 返回第一个问题
        prompt = DIALOGUE_PROMPTS[current_step]
        return ApiResponse(
            code=0,
            message="success",
            data=StrategyDialogueResponse(
                session_id=session_id,
                current_step=current_step,
                next_question=prompt["question"],
                options=prompt["options"],
                collected_info={},
                progress_percent=0,
                is_complete=False
            )
        )

    # 处理用户输入
    if request.user_input:
        parsed_value, is_valid = parse_user_input(current_step, request.user_input)

        if is_valid:
            # 更新策略
            field = DIALOGUE_PROMPTS[current_step]["field"]
            if field:
                setattr(session["strategy"], field, parsed_value)

            # 记录历史
            session["history"].append({
                "step": current_step,
                "input": request.user_input,
                "parsed": parsed_value,
                "timestamp": datetime.utcnow().isoformat()
            })

            # 标记当前步骤完成
            if current_step not in session["completed_steps"]:
                session["completed_steps"].append(current_step)

            # 移动到下一步
            next_step = get_next_step(current_step)
            session["current_step"] = next_step

            # 计算进度
            total_steps = 6  # 不包括 COMPLETE
            progress = int(len(session["completed_steps"]) / total_steps * 100)

            # 检查是否完成
            is_complete = next_step == DialogueStep.COMPLETE

            # 构建已收集的信息
            collected = {}
            for step in session["completed_steps"]:
                field = DIALOGUE_PROMPTS[step]["field"]
                if field:
                    collected[field] = getattr(session["strategy"], field)

            prompt = DIALOGUE_PROMPTS[next_step]

            return ApiResponse(
                code=0,
                message="success",
                data=StrategyDialogueResponse(
                    session_id=session["session_id"],
                    current_step=next_step,
                    next_question=prompt["question"] if not is_complete else "策略配置完成！",
                    options=prompt["options"] if not is_complete else [],
                    collected_info=collected,
                    progress_percent=progress,
                    is_complete=is_complete,
                    strategy=session["strategy"].model_dump() if is_complete else None
                )
            )
        else:
            # 输入无效，重新询问
            prompt = DIALOGUE_PROMPTS[current_step]
            return ApiResponse(
                code=1,
                message=f"未能理解您的输入，请从以下选项中选择或输入类似内容",
                data=StrategyDialogueResponse(
                    session_id=session["session_id"],
                    current_step=current_step,
                    next_question=prompt["question"],
                    options=prompt["options"],
                    collected_info={},
                    progress_percent=int(len(session["completed_steps"]) / 6 * 100),
                    is_complete=False
                )
            )

    # 如果没有用户输入，返回当前问题
    prompt = DIALOGUE_PROMPTS[current_step]
    return ApiResponse(
        code=0,
        message="success",
        data=StrategyDialogueResponse(
            session_id=session["session_id"],
            current_step=current_step,
            next_question=prompt["question"],
            options=prompt["options"],
            collected_info={},
            progress_percent=int(len(session["completed_steps"]) / 6 * 100),
            is_complete=False
        )
    )


@router.get("/dialogue/{session_id}", response_model=ApiResponse)
async def get_dialogue_state(session_id: str):
    """获取对话状态"""
    if session_id not in dialogue_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = dialogue_sessions[session_id]
    return ApiResponse(
        code=0,
        message="success",
        data={
            "session_id": session_id,
            "current_step": session["current_step"],
            "completed_steps": session["completed_steps"],
            "strategy": session["strategy"].model_dump(),
            "progress_percent": int(len(session["completed_steps"]) / 6 * 100)
        }
    )


@router.post("/validate", response_model=ApiResponse)
async def validate_strategy(strategy: StrategyConfig):
    """
    验证策略配置是否有效

    检查各项参数是否符合要求
    """
    errors = []
    warnings = []

    # 验证风险承受
    if strategy.risk_tolerance not in ["保守", "稳健", "积极", "极度"]:
        errors.append("风险承受能力必须是：保守、稳健、积极、极度之一")

    # 验证持仓周期
    if strategy.holding_period not in ["短线", "中线", "长线"]:
        errors.append("持仓周期必须是：短线、中线、长线之一")

    # 验证板块
    valid_sectors = ["科技", "消费", "医药", "金融", "能源", "地产", "材料", "工业"]
    invalid_sectors = [s for s in strategy.sectors if s not in valid_sectors]
    if invalid_sectors:
        warnings.append(f"未知板块：{invalid_sectors}")

    # 验证市场范围
    if strategy.market_scope not in ["主板", "主板+创业板", "全市场"]:
        warnings.append("市场范围建议使用：主板、主板+创业板、全市场")

    return ApiResponse(
        code=0 if not errors else 1,
        message="验证通过" if not errors else "验证失败",
        data={
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }
    )


@router.post("/suggest", response_model=ApiResponse)
async def suggest_strategy(profile: dict):
    """
    根据用户画像推荐策略

    基于投资经验、风险偏好等推荐合适的策略配置
    """
    experience = profile.get("experience", "beginner")  # beginner/intermediate/advanced
    age = profile.get("age", 30)
    income_level = profile.get("income_level", "medium")  # low/medium/high

    # 根据经验推荐
    if experience == "beginner":
        suggested = StrategyConfig(
            risk_tolerance="稳健",
            sectors=["消费", "金融"],
            holding_period="中线",
            position_limit="单股不超过20%",
            stop_loss="8%止损",
            market_scope="主板"
        )
        reasoning = "新手建议选择稳健策略，关注防御性板块，严格仓位控制"
    elif experience == "intermediate":
        suggested = StrategyConfig(
            risk_tolerance="积极",
            sectors=["科技", "消费", "医药"],
            holding_period="短线",
            position_limit="单股不超过30%",
            stop_loss="10%止损",
            market_scope="主板+创业板"
        )
        reasoning = "有投资经验的用户可以适当积极，关注成长性板块"
    else:  # advanced
        suggested = StrategyConfig(
            risk_tolerance="极度",
            sectors=["科技", "材料", "能源"],
            holding_period="超短线",
            position_limit="单股不超过50%",
            stop_loss="灵活处理",
            market_scope="全市场"
        )
        reasoning = "资深投资者可根据市场灵活调整，但需注意风险控制"

    return ApiResponse(
        code=0,
        message="success",
        data={
            "suggested_strategy": suggested.model_dump(),
            "reasoning": reasoning,
            "experience_level": experience
        }
    )
