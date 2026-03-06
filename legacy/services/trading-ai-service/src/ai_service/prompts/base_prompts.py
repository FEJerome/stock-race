"""
Base prompt templates for AI Service.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
import json

from ..models.schemas import (
    DecisionAction,
    RiskLevel,
    StockData,
    Position,
    AccountInfo,
)


class BasePrompts:
    """Base class for prompt templates."""

    @staticmethod
    def format_stock_data(stock: StockData) -> str:
        """Format stock data for prompt."""
        lines = [
            f"股票代码: {stock.symbol}",
            f"股票名称: {stock.name or 'N/A'}",
            f"当前价格: ¥{stock.current_price:.2f}",
        ]

        if stock.open_price:
            lines.append(f"开盘价: ¥{stock.open_price:.2f}")
        if stock.high_price:
            lines.append(f"最高价: ¥{stock.high_price:.2f}")
        if stock.low_price:
            lines.append(f"最低价: ¥{stock.low_price:.2f}")
        if stock.volume:
            lines.append(f"成交量: {stock.volume:,}")
        if stock.change is not None:
            change_sign = "+" if stock.change >= 0 else ""
            lines.append(f"涨跌: {change_sign}{stock.change:.2f}")
        if stock.change_percent is not None:
            change_percent_sign = "+" if stock.change_percent >= 0 else ""
            lines.append(f"涨跌幅: {change_percent_sign}{stock.change_percent:.2f}%")

        # Technical indicators
        if stock.ma_5:
            lines.append(f"5日均线: ¥{stock.ma_5:.2f}")
        if stock.ma_20:
            lines.append(f"20日均线: ¥{stock.ma_20:.2f}")
        if stock.ma_60:
            lines.append(f"60日均线: ¥{stock.ma_60:.2f}")
        if stock.rsi:
            lines.append(f"RSI: {stock.rsi:.2f}")
        if stock.macd:
            lines.append(f"MACD: {stock.macd:.4f}")
        if stock.bollinger_upper and stock.bollinger_lower:
            lines.append(f"布林带: ¥{stock.bollinger_lower:.2f} - ¥{stock.bollinger_upper:.2f}")

        # Fundamental data
        if stock.market_cap:
            if stock.market_cap >= 1_000_000_000:
                lines.append(f"市值: ¥{stock.market_cap/1_000_000_000:.2f}B")
            elif stock.market_cap >= 1_000_000:
                lines.append(f"市值: ¥{stock.market_cap/1_000_000:.2f}M")
            else:
                lines.append(f"市值: ¥{stock.market_cap:.2f}")
        if stock.pe_ratio:
            lines.append(f"市盈率: {stock.pe_ratio:.2f}")
        if stock.dividend_yield:
            lines.append(f"股息率: {stock.dividend_yield:.2%}")

        return "\n".join(lines)

    @staticmethod
    def format_position(position: Position) -> str:
        """Format position data for prompt."""
        pnl_sign = "+" if position.unrealized_pnl >= 0 else ""
        pnl_percent_sign = "+" if position.unrealized_pnl_percent >= 0 else ""

        return (
            f"股票: {position.symbol}\n"
            f"  持仓数量: {position.quantity:,} 股\n"
            f"  平均成本: ¥{position.avg_cost:.2f}\n"
            f"  当前价格: ¥{position.current_price:.2f}\n"
            f"  市值: ¥{position.market_value:,.2f}\n"
            f"  浮动盈亏: {pnl_sign}¥{position.unrealized_pnl:,.2f} "
            f"({pnl_percent_sign}{position.unrealized_pnl_percent:.2f}%)"
        )

    @staticmethod
    def format_account_info(account: AccountInfo) -> str:
        """Format account information for prompt."""
        total_pnl_sign = "+" if account.total_unrealized_pnl >= 0 else ""
        total_pnl_percent_sign = "+" if account.total_unrealized_pnl_percent >= 0 else ""

        lines = [
            f"账户ID: {account.account_id}",
            f"总资产: ¥{account.total_balance:,.2f}",
            f"可用现金: ¥{account.available_cash:,.2f}",
            f"持仓市值: ¥{account.total_market_value:,.2f}",
            f"总浮动盈亏: {total_pnl_sign}¥{account.total_unrealized_pnl:,.2f} "
            f"({total_pnl_percent_sign}{account.total_unrealized_pnl_percent:.2f}%)",
        ]

        if account.risk_tolerance:
            lines.append(f"风险承受能力: {account.risk_tolerance}")
        if account.trading_strategy:
            lines.append(f"交易策略: {account.trading_strategy}")

        return "\n".join(lines)

    @staticmethod
    def get_system_prompt() -> str:
        """Get system prompt for AI trading assistant."""
        return """你是一个专业的股票交易AI助手，专门为中国A股市场提供交易决策建议。
你的任务是分析股票数据、持仓情况和账户信息，给出专业的交易建议。

请遵循以下原则：
1. 基于数据和分析做出决策，避免情绪化交易
2. 考虑风险收益比，优先选择风险可控的机会
3. 遵守中国证券市场的交易规则和限制
4. 考虑交易成本（手续费、印花税等）
5. 提供明确的决策理由和风险提示

输出格式要求：
1. 决策必须是以下之一：买入(buy)、卖出(sell)、持有(hold)、清仓(sell_all)
2. 必须指定股票代码
3. 建议交易数量（可选）
4. 目标价格（可选）
5. 止损价格（可选）
6. 详细的决策理由
7. 技术分析要点
8. 基本面分析要点
9. 风险评估
10. 置信度评分（0-1）
11. 风险等级（low/medium/high/very_high）
12. 预期收益率（可选）
13. 建议持有时间（可选）

请以JSON格式输出，包含以下字段：
- action: 交易决策
- symbol: 股票代码
- quantity: 建议交易数量（可选）
- price_target: 目标价格（可选）
- stop_loss: 止损价格（可选）
- reasoning: 决策理由
- technical_analysis: 技术分析
- fundamental_analysis: 基本面分析
- risk_assessment: 风险评估
- confidence_score: 置信度评分
- risk_level: 风险等级
- expected_return: 预期收益率（可选）
- time_horizon: 建议持有时间（可选）"""

    @staticmethod
    def get_trading_constraints_prompt(constraints: Dict[str, Any]) -> str:
        """Get trading constraints prompt."""
        if not constraints:
            return ""

        lines = ["交易限制条件："]
        if "max_position_size" in constraints:
            lines.append(f"- 单只股票最大持仓: ¥{constraints['max_position_size']:,.2f}")
        if "min_trade_amount" in constraints:
            lines.append(f"- 最小交易金额: ¥{constraints['min_trade_amount']:,.2f}")
        if "max_daily_trades" in constraints:
            lines.append(f"- 每日最大交易次数: {constraints['max_daily_trades']}")
        if "prohibited_stocks" in constraints:
            lines.append(f"- 禁止交易股票: {', '.join(constraints['prohibited_stocks'])}")
        if "sector_limits" in constraints:
            lines.append(f"- 行业限制: {json.dumps(constraints['sector_limits'], ensure_ascii=False)}")

        return "\n".join(lines)

    @staticmethod
    def get_market_conditions_prompt(conditions: Dict[str, Any]) -> str:
        """Get market conditions prompt."""
        if not conditions:
            return ""

        lines = ["市场环境分析："]
        if "market_trend" in conditions:
            lines.append(f"- 市场趋势: {conditions['market_trend']}")
        if "volatility" in conditions:
            lines.append(f"- 波动率: {conditions['volatility']}")
        if "sector_performance" in conditions:
            lines.append(f"- 行业表现: {json.dumps(conditions['sector_performance'], ensure_ascii=False)}")
        if "economic_indicators" in conditions:
            lines.append(f"- 经济指标: {json.dumps(conditions['economic_indicators'], ensure_ascii=False)}")
        if "news_sentiment" in conditions:
            lines.append(f"- 新闻情绪: {conditions['news_sentiment']}")

        return "\n".join(lines)