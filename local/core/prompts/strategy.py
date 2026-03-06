"""
策略收集Prompt模板

依据：PRD.md 4.2.2 策略收集机制
复用自：legacy/services/trading-ai-service/src/ai_service/prompts/
"""

from datetime import datetime
from typing import Dict, Any


class StrategyPrompts:
    """策略收集相关的Prompt模板"""
    
    @classmethod
    def get_strategy_collection_prompt(cls, user_input: str) -> str:
        """
        策略收集主Prompt
        
        五维度底线：
        1. 风险承受
        2. 关注板块
        3. 持仓周期
        4. 仓位与止损
        5. 交易市场范围
        """
        return f"""你是一个专业的投资顾问，正在帮助用户制定AI交易员的投资策略。

用户输入：{user_input}

你需要通过对话收集以下五个维度的信息（必须全部收集）：

1. **风险承受能力**
   - 保守：可接受最大回撤5%
   - 稳健：可接受最大回撤10%
   - 激进：可接受最大回撤20%
   - 极度：可接受最大回撤30%或无上限

2. **关注板块**
   - 用户感兴趣的行业板块
   - 可以是多个板块或"全市场"

3. **持仓周期**
   - 超短线：1-3天
   - 短线：1-2周
   - 中线：1-3月
   - 长线：3月以上

4. **仓位与止损纪律**
   - 单只股票最大仓位（建议10%-50%）
   - 止损执行方式：严格执行/灵活处理/不设止损

5. **交易市场范围**
   - 仅限主板（推荐新手）
   - 主板+创业板
   - 全市场（含科创/北交）

**当前时间**：{datetime.now().strftime('%Y-%m-%d %H:%M')}

请以对话形式向用户提问，逐步收集以上信息。每次只问一个维度，等用户回答后再问下一个。
如果用户提供了模糊或不完整的信息，请追问澄清。

**输出格式**：
- 首先：以友好的方式向用户提问
- 其次：总结已收集的信息（如有）
- 最后：说明还需要收集哪些信息
"""
    
    @classmethod
    def get_strategy_summary_prompt(
        cls, 
        risk_level: str,
        focus_sectors: list,
        holding_period: str,
        max_position: str,
        stop_loss: str,
        market_scope: str
    ) -> str:
        """
        生成策略摘要确认Prompt
        """
        return f"""请确认以下投资策略配置是否正确：

**风险承受能力**：{risk_level}
**关注板块**：{', '.join(focus_sectors) if focus_sectors else '全市场'}
**持仓周期**：{holding_period}
**单股最大仓位**：{max_position}
**止损纪律**：{stop_loss}
**交易市场范围**：{market_scope}

如果确认无误，回复"确认"。
如果需要修改，请说明需要修改的项目。
"""
    
    @classmethod
    def get_strategy_document_prompt(cls, strategy_data: Dict[str, Any]) -> str:
        """
        生成正式策略文档
        
        这是存储在系统中的策略文档，AI交易员后续决策的依据
        """
        return f"""# AI交易员策略文档

## 基本信息
- 创建时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}

## 策略配置

### 1. 风险承受能力
{strategy_data.get('risk_level', '未指定')}

### 2. 关注板块
{', '.join(strategy_data.get('focus_sectors', ['全市场']))}

### 3. 持仓周期
{strategy_data.get('holding_period', '未指定')}

### 4. 仓位管理
- 单股最大仓位：{strategy_data.get('max_position_per_stock', '30%')}
- 止损纪律：{strategy_data.get('stop_loss_discipline', '严格执行')}

### 5. 交易范围
{strategy_data.get('market_scope', '仅限主板')}

## 决策指引
AI交易员在做出交易决策时，必须严格遵守以上策略配置。
任何超出策略范围的决策都需要重新评估风险。
"""
