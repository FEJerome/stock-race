"""
DeepSeek Adapter - DeepSeek AI API Integration

API Docs: https://platform.deepseek.com/api-docs
Models: deepseek-chat, deepseek-coder, deepseek-reasoner
"""
import os
import json
import httpx
from typing import Optional
from datetime import datetime

from .base import (
    AIAdapter,
    DecisionRequest,
    DecisionResponse,
    TokenUsage,
    DecisionAction,
)


class DeepSeekAdapter(AIAdapter):
    """
    DeepSeek AI Adapter

    Uses DeepSeek API for trading decisions.
    """

    API_BASE = "https://api.deepseek.com"
    DEFAULT_MODEL = "deepseek-chat"

    DECISION_PROMPT_TEMPLATE = """你是一位专业的AI股票交易员。请基于以下信息做出交易决策。

## AI交易员信息
- 名称: {agent_name}
- 职级: {agent_level}
- 档位: {incentive_level}

## 策略配置
- 风险承受能力: {risk_tolerance}
- 持仓周期: {holding_period}
- 关注板块: {sectors}
- 仓位限制: {position_limit}
- 止损策略: {stop_loss}
- 市场范围: {market_scope}

## 市场数据
- 股票代码: {symbol}
- 股票名称: {name}
- 当前价格: ¥{current_price}
- 涨跌幅: {change_percent}%
- 成交量: {volume}

## 持仓情况
{position_info}

## 组合概览
- 总资金: ¥{total_capital}
- 可用资金: ¥{available_capital}
- 当前持仓数: {position_count}

## 最近交易历史
{trade_history}

{technical_analysis}

---

请作为这位AI交易员，做出你的交易决策。你必须以JSON格式回复，格式如下:

```json
{{
    "action": "buy|sell|hold|watch",
    "confidence": 0.85,
    "reason": "你的决策理由和思考过程（内心戏）",
    "suggested_quantity": 100,
    "risk_warning": "如果有风险，请在这里说明，否则留空"
}}
```

说明:
- action: buy(买入), sell(卖出), hold(持仓不动), watch(观望)
- confidence: 0-1之间的置信度
- reason: 详细的决策理由，包含你的分析思路
- suggested_quantity: 建议交易数量
- risk_warning: 风险提示(可选)

请只返回JSON，不要包含其他文字。"""

    def __init__(self, model_name: str = "deepseek-chat", api_key: Optional[str] = None):
        super().__init__(model_name, api_key)
        self.api_key = api_key or os.getenv("DEEPSEEK_API_KEY")
        if not self.api_key:
            raise ValueError(
                "DeepSeek API key is required. "
                "Set DEEPSEEK_API_KEY environment variable or pass api_key parameter."
            )
        self.model = self._get_model_id(model_name)
        self._client: Optional[httpx.AsyncClient] = None

    def _get_model_id(self, model_name: str) -> str:
        """Map model name to DeepSeek model ID"""
        model_map = {
            "deepseek-chat": "deepseek-chat",
            "deepseek-coder": "deepseek-coder",
            "deepseek-reasoner": "deepseek-reasoner",
            "deepseek": "deepseek-chat",
        }
        return model_map.get(model_name, self.DEFAULT_MODEL)

    @property
    def client(self) -> httpx.AsyncClient:
        """Lazy initialization of HTTP client"""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.API_BASE,
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=60.0,
            )
        return self._client

    async def make_decision(self, request: DecisionRequest) -> DecisionResponse:
        """Execute trading decision using DeepSeek"""
        import time

        start_time = time.time()
        prompt = self.build_prompt(request)

        try:
            response = await self.client.post(
                "/chat/completions",
                json={
                    "model": self.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "你是一位专业的AI股票交易员，擅长技术分析和风险管理。请以JSON格式输出你的交易决策。"
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    "temperature": 0.3,
                    "max_tokens": 2000,
                    "response_format": {"type": "json_object"},
                }
            )
            response.raise_for_status()
            data = response.json()

            # Extract token usage
            usage = data.get("usage", {})
            token_usage = TokenUsage(
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
                total_tokens=usage.get("total_tokens", 0),
            )

            # Update total stats
            self._total_tokens_used += token_usage.total_tokens
            self._total_cost_usd += token_usage.cost_usd

            # Parse response
            raw_content = data["choices"][0]["message"]["content"]
            decision = self.parse_response(raw_content)

            # Add metadata
            decision.token_usage = token_usage
            decision.latency_ms = (time.time() - start_time) * 1000
            decision.model_name = self.model_name

            return decision

        except httpx.HTTPStatusError as e:
            error_msg = f"DeepSeek API error: {e.response.status_code}"
            try:
                error_data = e.response.json()
                error_msg = f"{error_msg} - {error_data.get('error', {}).get('message', 'Unknown error')}"
            except:
                pass
            return self._create_error_response(error_msg, start_time)

        except Exception as e:
            return self._create_error_response(f"Decision error: {str(e)}", start_time)

    def _create_error_response(self, error_msg: str, start_time: float) -> DecisionResponse:
        """Create error response"""
        import time
        return DecisionResponse(
            action=DecisionAction.HOLD,
            confidence=0.0,
            reason=f"决策失败: {error_msg}",
            risk_warning=error_msg,
            latency_ms=(time.time() - start_time) * 1000,
            model_name=self.model_name,
        )

    def build_prompt(self, request: DecisionRequest) -> str:
        """Build decision prompt from request"""
        m = request.market_data

        # Format position info
        if request.position:
            p = request.position
            position_info = f"""已持仓
- 持仓数量: {p.quantity}股
- 平均成本: ¥{p.avg_cost:.2f}
- 当前市值: ¥{p.current_price * p.quantity:.2f}
- 浮动盈亏: {p.unrealized_pnl:+.2f}元 ({p.unrealized_pnl_pct:+.2f}%)"""
        else:
            position_info = "未持仓"

        # Format trade history
        if request.trade_history:
            history_str = "\n".join([
                f"- {t.get('timestamp', 'N/A')}: {t.get('action', 'unknown')} {t.get('symbol', 'N/A')} "
                f"{t.get('quantity', 0)}股 @ ¥{t.get('price', 0):.2f}"
                for t in request.trade_history[-5:]
            ])
        else:
            history_str = "无最近交易记录"

        # 新增：技术分析段落
        tech_section = ""
        if m.trend != "unknown":
            tech_section += "## 技术分析\n"
            tech_section += f"- 短期趋势: {self._translate_trend(m.trend)}\n"
            if m.ma5:
                ma_status = "高于" if m.current_price > m.ma5 else "低于"
                tech_section += f"- MA5: ¥{m.ma5:.2f} (现价{ma_status}均线)\n"
            if m.ma10:
                tech_section += f"- MA10: ¥{m.ma10:.2f}\n"
            if m.ma20:
                tech_section += f"- MA20: ¥{m.ma20:.2f}\n"
            if m.volume_ma5:
                tech_section += f"- 成交量MA5: {m.volume_ma5:,.0f}\n"
            if m.price_change_1h is not None:
                direction = "上涨" if m.price_change_1h > 0 else "下跌"
                tech_section += f"- 1小时{direction}: {m.price_change_1h:+.2f}%\n"

        portfolio = request.portfolio_summary

        return self.DECISION_PROMPT_TEMPLATE.format(
            agent_name=request.agent_name,
            agent_level=request.agent_level,
            incentive_level=request.incentive_level,
            risk_tolerance=request.strategy.get("risk_tolerance", "稳健"),
            holding_period=request.strategy.get("holding_period", "中线"),
            sectors=", ".join(request.strategy.get("sectors", ["全市场"])),
            position_limit=request.strategy.get("position_limit", "单股不超过30%"),
            stop_loss=request.strategy.get("stop_loss", "8%止损"),
            market_scope=request.strategy.get("market_scope", "主板+创业板"),
            symbol=m.symbol,
            name=m.name,
            current_price=m.current_price,
            change_percent=m.change_percent,
            volume=m.volume,
            position_info=position_info,
            total_capital=portfolio.get("total_capital", 0),
            available_capital=portfolio.get("available_capital", 0),
            position_count=portfolio.get("position_count", 0),
            trade_history=history_str,
            technical_analysis=tech_section,
        )

    def _translate_trend(self, trend: str) -> str:
        """翻译趋势为中文"""
        return {"up": "上涨", "down": "下跌", "sideways": "震荡"}.get(trend, "未知")

    def parse_response(self, raw_response: str) -> DecisionResponse:
        """Parse LLM JSON response into DecisionResponse"""
        try:
            cleaned = raw_response.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

            data = json.loads(cleaned)

            action_map = {
                "buy": DecisionAction.BUY,
                "sell": DecisionAction.SELL,
                "hold": DecisionAction.HOLD,
                "watch": DecisionAction.WATCH,
            }
            action_str = data.get("action", "hold").lower()
            action = action_map.get(action_str, DecisionAction.HOLD)

            return DecisionResponse(
                action=action,
                confidence=float(data.get("confidence", 0.5)),
                reason=data.get("reason", "未提供决策理由"),
                suggested_quantity=data.get("suggested_quantity"),
                risk_warning=data.get("risk_warning") if data.get("risk_warning") else None,
            )

        except json.JSONDecodeError as e:
            return DecisionResponse(
                action=DecisionAction.HOLD,
                confidence=0.0,
                reason=f"无法解析AI响应: {raw_response[:200]}",
                risk_warning=f"JSON解析错误: {str(e)}",
            )

        except Exception as e:
            return DecisionResponse(
                action=DecisionAction.HOLD,
                confidence=0.0,
                reason=f"响应处理错误: {str(e)}",
                risk_warning=str(e),
            )

    async def close(self):
        """Close HTTP client"""
        if self._client:
            await self._client.aclose()
            self._client = None
