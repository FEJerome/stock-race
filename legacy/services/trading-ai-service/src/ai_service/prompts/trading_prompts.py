"""
Trading-specific prompt templates for AI Service.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime

from ..models.schemas import (
    DecisionAction,
    RiskLevel,
    StockData,
    Position,
    AccountInfo,
    DecisionRequest,
)
from .base_prompts import BasePrompts


class TradingPrompts(BasePrompts):
    """Trading-specific prompt templates."""

    @classmethod
    def create_decision_prompt(cls, request: DecisionRequest) -> str:
        """Create a prompt for trading decision."""
        # Format account information
        account_info = cls.format_account_info(request.account_info)

        # Format positions
        positions_text = "当前持仓："
        if request.positions:
            for position in request.positions:
                positions_text += f"\n{cls.format_position(position)}"
        else:
            positions_text += "\n无持仓"

        # Format stock data
        stocks_text = "股票数据："
        for stock in request.stock_data:
            stocks_text += f"\n\n{cls.format_stock_data(stock)}"

        # Format constraints
        constraints_text = cls.get_trading_constraints_prompt(request.constraints)

        # Format market conditions
        market_conditions_text = cls.get_market_conditions_prompt(request.market_conditions)

        # Build the complete prompt
        prompt = f"""请分析以下投资情况并提供交易建议：

账户信息：
{account_info}

{positions_text}

{stocks_text}

{constraints_text}

{market_conditions_text}

当前时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

请基于以上信息，给出专业的交易决策建议。
考虑因素包括：
1. 技术分析（价格走势、成交量、技术指标）
2. 基本面分析（估值、财务数据、行业地位）
3. 风险收益比
4. 账户风险承受能力
5. 市场整体环境
6. 交易成本影响

请提供详细的决策理由和风险提示。"""

        # Add custom prompt if provided
        if request.custom_prompt:
            prompt += f"\n\n附加要求：\n{request.custom_prompt}"

        return prompt

    @classmethod
    def create_analysis_prompt(
        cls,
        stock: StockData,
        include_technical: bool = True,
        include_fundamental: bool = True,
    ) -> str:
        """Create a prompt for stock analysis."""
        stock_info = cls.format_stock_data(stock)

        analysis_types = []
        if include_technical:
            analysis_types.append("技术分析")
        if include_fundamental:
            analysis_types.append("基本面分析")

        analysis_types_text = "和".join(analysis_types)

        prompt = f"""请对以下股票进行{analysis_types_text}：

{stock_info}

当前时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

请提供：
1. 关键技术指标解读
2. 价格走势分析
3. 支撑位和阻力位
4. 交易量分析
5. 市场情绪判断
6. 风险评估
7. 投资建议（买入/卖出/持有）及理由"""

        if include_fundamental:
            prompt += """
8. 估值分析（市盈率、市净率等）
9. 财务健康状况
10. 行业地位和竞争优势
11. 成长潜力评估
12. 股息政策分析"""

        prompt += "\n\n请以专业、客观的态度进行分析，避免情绪化判断。"

        return prompt

    @classmethod
    def create_risk_assessment_prompt(
        cls,
        account: AccountInfo,
        positions: List[Position],
        stocks: List[StockData],
    ) -> str:
        """Create a prompt for portfolio risk assessment."""
        account_info = cls.format_account_info(account)

        positions_text = "持仓情况："
        if positions:
            for position in positions:
                positions_text += f"\n{cls.format_position(position)}"
        else:
            positions_text += "\n无持仓"

        # Calculate portfolio concentration
        if positions and account.total_market_value > 0:
            concentration = {}
            for position in positions:
                weight = position.market_value / account.total_market_value
                concentration[position.symbol] = f"{weight:.1%}"

            concentration_text = "持仓集中度：\n" + "\n".join(
                [f"- {symbol}: {weight}" for symbol, weight in concentration.items()]
            )
        else:
            concentration_text = "持仓集中度：无持仓"

        prompt = f"""请评估以下投资组合的风险：

账户信息：
{account_info}

{positions_text}

{concentration_text}

当前时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

请从以下角度进行风险评估：
1. 市场风险（系统性风险）
2. 个股风险（非系统性风险）
3. 流动性风险
4. 集中度风险
5. 波动性风险
6. 下行风险（最大回撤）
7. 相关性风险
8. 黑天鹅事件风险

针对当前持仓，请提供：
1. 总体风险等级评估
2. 主要风险因素
3. 风险控制建议
4. 止损策略建议
5. 仓位调整建议
6. 对冲策略建议（如适用）

请以专业、客观的态度进行评估，提供具体的风险控制措施。"""

        return prompt

    @classmethod
    def create_portfolio_rebalance_prompt(
        cls,
        account: AccountInfo,
        positions: List[Position],
        target_allocation: Dict[str, float],
    ) -> str:
        """Create a prompt for portfolio rebalancing."""
        account_info = cls.format_account_info(account)

        positions_text = "当前持仓："
        if positions:
            for position in positions:
                positions_text += f"\n{cls.format_position(position)}"
        else:
            positions_text += "\n无持仓"

        # Calculate current allocation
        current_allocation = {}
        if positions and account.total_market_value > 0:
            for position in positions:
                weight = position.market_value / account.total_market_value
                current_allocation[position.symbol] = weight

        current_allocation_text = "当前配置比例：\n" + "\n".join(
            [f"- {symbol}: {weight:.1%}" for symbol, weight in current_allocation.items()]
        )

        target_allocation_text = "目标配置比例：\n" + "\n".join(
            [f"- {symbol}: {weight:.1%}" for symbol, weight in target_allocation.items()]
        )

        prompt = f"""请为以下投资组合提供再平衡建议：

账户信息：
{account_info}

{positions_text}

{current_allocation_text}

{target_allocation_text}

当前时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

请考虑以下因素：
1. 当前配置与目标配置的偏差
2. 交易成本（手续费、印花税等）
3. 税收影响（如适用）
4. 市场流动性
5. 价格冲击成本
6. 再平衡频率
7. 风险控制

请提供具体的再平衡方案：
1. 需要买入的股票及数量
2. 需要卖出的股票及数量
3. 交易执行顺序建议
4. 预期再平衡成本
5. 再平衡后的风险变化
6. 监控和调整建议

请以最小化交易成本和税收影响为目标，同时确保风险控制在可接受范围内。"""

        return prompt