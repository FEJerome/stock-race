"""
Breadth decision service for sector, industry, and batch decisions.

Implements:
- C6-TAI-001: Sector-level decisions
- C6-TAI-002: Industry-level decisions
- C6-TAI-003: Batch decisions for index components
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime
from loguru import logger

from ..models.schemas import AccountInfo, AIProvider
from ..adapters.base import AdapterFactory, ModelRequest
from ..core.config import settings
from .market_data_client import MarketDataClient


@dataclass
class SectorDecisionRequest:
    """Request for sector-level decision."""
    sector: str
    account_info: AccountInfo
    ai_provider: AIProvider
    model_name: Optional[str] = None


@dataclass
class IndustryDecisionRequest:
    """Request for industry-level decision."""
    industry: str
    account_info: AccountInfo
    ai_provider: AIProvider
    model_name: Optional[str] = None


@dataclass
class BatchDecisionRequest:
    """Request for batch decisions on index components."""
    index: str
    account_info: AccountInfo
    ai_provider: AIProvider
    model_name: Optional[str] = None
    max_stocks: int = 20


class BreadthDecisionService:
    """
    Service for generating AI decisions based on breadth data.

    Uses Market Data Service APIs to fetch sector, industry, and index data,
    then generates AI-powered investment decisions.
    """

    def __init__(self, market_client: Optional[MarketDataClient] = None):
        """
        Initialize the breadth decision service.

        Args:
            market_client: Optional MarketDataClient instance
        """
        self.market_client = market_client or MarketDataClient(
            base_url=getattr(settings, 'MARKET_DATA_SERVICE_URL', 'http://localhost:8001')
        )

    async def generate_sector_decision(
        self,
        sector: str,
        account_info: AccountInfo,
        ai_provider: AIProvider,
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate AI decision for a sector.

        Args:
            sector: Sector code (e.g., "technology", "financial")
            account_info: Account information
            ai_provider: AI provider to use
            model_name: Specific model name (optional)

        Returns:
            Decision result with sector analysis
        """
        try:
            # Fetch sector data from Market Data Service
            sector_data = await self.market_client.get_sector_quotes(sector)

            if not sector_data.get("stocks"):
                return {
                    "sector": sector,
                    "decision": {
                        "action": "hold",
                        "confidence": 0.0,
                        "reasoning": f"No stocks found in sector '{sector}'",
                    },
                    "stocks_analyzed": 0,
                    "timestamp": datetime.utcnow().isoformat(),
                }

            # Generate AI decision
            ai_decision = await self._generate_ai_decision(
                data_type="sector",
                data=sector_data,
                account_info=account_info,
                ai_provider=ai_provider,
                model_name=model_name,
            )

            return {
                "sector": sector,
                "decision": ai_decision,
                "stocks_analyzed": len(sector_data.get("stocks", [])),
                "sector_data": sector_data,
                "timestamp": datetime.utcnow().isoformat(),
            }

        except Exception as e:
            logger.error(f"❌ Failed to generate sector decision for {sector}: {e}")
            return {
                "sector": sector,
                "decision": {
                    "action": "hold",
                    "confidence": 0.0,
                    "reasoning": f"Error fetching sector data: {str(e)}",
                },
                "stocks_analyzed": 0,
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            }

    async def generate_industry_decision(
        self,
        industry: str,
        account_info: AccountInfo,
        ai_provider: AIProvider,
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate AI decision for an industry.

        Args:
            industry: Industry code (e.g., "banking", "software")
            account_info: Account information
            ai_provider: AI provider to use
            model_name: Specific model name (optional)

        Returns:
            Decision result with industry analysis
        """
        try:
            # Fetch industry data from Market Data Service
            industry_data = await self.market_client.get_industry_quotes(industry)

            if not industry_data.get("stocks"):
                return {
                    "industry": industry,
                    "decision": {
                        "action": "hold",
                        "confidence": 0.0,
                        "reasoning": f"No stocks found in industry '{industry}'",
                    },
                    "stocks_analyzed": 0,
                    "timestamp": datetime.utcnow().isoformat(),
                }

            # Generate AI decision
            ai_decision = await self._generate_ai_decision(
                data_type="industry",
                data=industry_data,
                account_info=account_info,
                ai_provider=ai_provider,
                model_name=model_name,
            )

            return {
                "industry": industry,
                "decision": ai_decision,
                "stocks_analyzed": len(industry_data.get("stocks", [])),
                "industry_data": industry_data,
                "timestamp": datetime.utcnow().isoformat(),
            }

        except Exception as e:
            logger.error(f"❌ Failed to generate industry decision for {industry}: {e}")
            return {
                "industry": industry,
                "decision": {
                    "action": "hold",
                    "confidence": 0.0,
                    "reasoning": f"Error fetching industry data: {str(e)}",
                },
                "stocks_analyzed": 0,
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            }

    async def generate_batch_decision(
        self,
        index: str,
        account_info: AccountInfo,
        ai_provider: AIProvider,
        model_name: Optional[str] = None,
        max_stocks: int = 20,
    ) -> Dict[str, Any]:
        """
        Generate batch decisions for index components.

        Args:
            index: Index code (e.g., "CSI300", "SSE50")
            account_info: Account information
            ai_provider: AI provider to use
            model_name: Specific model name (optional)
            max_stocks: Maximum number of stocks to analyze

        Returns:
            Batch decision results for index components
        """
        try:
            # Fetch index components from Market Data Service
            components_data = await self.market_client.get_index_components(index, limit=max_stocks)

            if not components_data.get("components"):
                return {
                    "index": index,
                    "decisions": [],
                    "total_components": 0,
                    "message": f"No components found for index '{index}'",
                    "timestamp": datetime.utcnow().isoformat(),
                }

            components = components_data.get("components", [])[:max_stocks]

            # Generate batch AI decisions
            decisions = await self._generate_batch_ai_decisions(
                components=components,
                account_info=account_info,
                ai_provider=ai_provider,
                model_name=model_name,
            )

            return {
                "index": index,
                "decisions": decisions,
                "total_components": len(components_data.get("components", [])),
                "analyzed_components": len(decisions),
                "timestamp": datetime.utcnow().isoformat(),
            }

        except Exception as e:
            logger.error(f"❌ Failed to generate batch decision for {index}: {e}")
            return {
                "index": index,
                "decisions": [],
                "total_components": 0,
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            }

    async def _generate_ai_decision(
        self,
        data_type: str,
        data: Dict[str, Any],
        account_info: AccountInfo,
        ai_provider: AIProvider,
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate AI decision for breadth data.

        Args:
            data_type: Type of data ("sector" or "industry")
            data: Market data from Market Data Service
            account_info: Account information
            ai_provider: AI provider to use
            model_name: Specific model name

        Returns:
            AI decision result
        """
        try:
            # Get AI adapter
            adapter = await AdapterFactory.get_adapter(ai_provider)

            # Create prompt based on data type
            if data_type == "sector":
                prompt = self._create_sector_prompt(data, account_info)
                system_prompt = self._get_sector_system_prompt()
            else:
                prompt = self._create_industry_prompt(data, account_info)
                system_prompt = self._get_industry_system_prompt()

            # Prepare model request
            model_request = ModelRequest(
                prompt=prompt,
                model=model_name or adapter.default_model,
                temperature=getattr(settings, 'DEFAULT_TEMPERATURE', 0.7),
                max_tokens=2000,
                system_prompt=system_prompt,
            )

            # Generate response
            response = await adapter.generate(model_request)

            # Parse response
            return self._parse_breadth_decision_response(response.content)

        except Exception as e:
            logger.error(f"❌ AI decision generation failed: {e}")
            return {
                "action": "hold",
                "confidence": 0.0,
                "reasoning": f"AI decision generation failed: {str(e)}",
            }

    async def _generate_batch_ai_decisions(
        self,
        components: List[Dict[str, Any]],
        account_info: AccountInfo,
        ai_provider: AIProvider,
        model_name: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Generate batch AI decisions for index components.

        Args:
            components: List of index components with stock data
            account_info: Account information
            ai_provider: AI provider to use
            model_name: Specific model name

        Returns:
            List of individual stock decisions
        """
        try:
            # Get AI adapter
            adapter = await AdapterFactory.get_adapter(ai_provider)

            # Create batch prompt
            prompt = self._create_batch_prompt(components, account_info)
            system_prompt = self._get_batch_system_prompt()

            # Prepare model request
            model_request = ModelRequest(
                prompt=prompt,
                model=model_name or adapter.default_model,
                temperature=getattr(settings, 'DEFAULT_TEMPERATURE', 0.7),
                max_tokens=3000,
                system_prompt=system_prompt,
            )

            # Generate response
            response = await adapter.generate(model_request)

            # Parse batch response
            return self._parse_batch_decision_response(response.content, components)

        except Exception as e:
            logger.error(f"❌ Batch AI decision generation failed: {e}")
            return [
                {
                    "symbol": comp.get("symbol"),
                    "action": "hold",
                    "confidence": 0.0,
                    "reasoning": f"Decision generation failed: {str(e)}",
                }
                for comp in components
            ]

    def _create_sector_prompt(self, sector_data: Dict[str, Any], account_info: AccountInfo) -> str:
        """Create prompt for sector decision."""
        sector = sector_data.get("sector", "")
        stocks = sector_data.get("stocks", [])

        stocks_text = "\n".join([
            f"- {s.get('symbol')} ({s.get('name')}): 价格¥{s.get('price')}, "
            f"涨跌{s.get('change_percent', 0):.2f}%, 市值{s.get('market_cap', 0):,.0f}"
            for s in stocks[:20]  # Limit to top 20 stocks
        ])

        return f"""请对【{sector}】板块进行投资策略分析。

账户信息：
- 总资产: ¥{account_info.total_balance:,.2f}
- 可用现金: ¥{account_info.available_cash:,.2f}
- 当前持仓市值: ¥{account_info.total_market_value:,.2f}

板块成分股数据（前20只）：
{stocks_text}

请提供：
1. 板块整体投资建议（overweight/underweight/equal_weight/hold）
2. 推荐关注的个股（从成分股中选择1-3只）
3. 投资逻辑和风险提示
4. 置信度评分（0-1）

输出格式为JSON：
{{
    "action": "overweight",
    "confidence": 0.75,
    "reasoning": "投资逻辑...",
    "selected_stocks": ["000001.SZ", "000002.SZ"],
    "risk_factors": ["风险1", "风险2"]
}}"""

    def _create_industry_prompt(self, industry_data: Dict[str, Any], account_info: AccountInfo) -> str:
        """Create prompt for industry decision."""
        industry = industry_data.get("industry", "")
        stocks = industry_data.get("stocks", [])

        stocks_text = "\n".join([
            f"- {s.get('symbol')} ({s.get('name')}): 价格¥{s.get('price')}, "
            f"涨跌{s.get('change_percent', 0):.2f}%"
            for s in stocks[:20]
        ])

        return f"""请对【{industry}】行业进行投资策略分析。

账户信息：
- 总资产: ¥{account_info.total_balance:,.2f}
- 可用现金: ¥{account_info.available_cash:,.2f}

行业成分股数据（前20只）：
{stocks_text}

请提供：
1. 行业整体投资建议（overweight/underweight/equal_weight/hold）
2. 推荐关注的个股
3. 投资逻辑和风险提示
4. 置信度评分（0-1）

输出格式为JSON：
{{
    "action": "equal_weight",
    "confidence": 0.65,
    "reasoning": "投资逻辑...",
    "selected_stocks": ["000001.SZ"],
    "risk_factors": ["风险1"]
}}"""

    def _create_batch_prompt(self, components: List[Dict[str, Any]], account_info: AccountInfo) -> str:
        """Create prompt for batch decisions."""
        components_text = "\n".join([
            f"- {c.get('symbol')} ({c.get('name')}): 价格¥{c.get('price')}, "
            f"权重{c.get('weight', 0):.2f}%"
            for c in components[:20]
        ])

        return f"""请对以下指数成分股进行批量投资决策分析。

账户信息：
- 总资产: ¥{account_info.total_balance:,.2f}
- 可用现金: ¥{account_info.available_cash:,.2f}

成分股数据：
{components_text}

请为每只股票提供：
1. 操作建议（buy/sell/hold）
2. 置信度评分（0-1）
3. 简要理由

输出格式为JSON数组：
[
    {{
        "symbol": "000001.SZ",
        "action": "buy",
        "confidence": 0.8,
        "reasoning": "理由..."
    }},
    ...
]"""

    def _get_sector_system_prompt(self) -> str:
        """Get system prompt for sector decisions."""
        return """你是专业的板块分析师，擅长从宏观角度分析板块投资机会。
请基于提供的板块数据，给出客观、专业的投资建议。
只输出JSON格式，不要添加其他说明文字。"""

    def _get_industry_system_prompt(self) -> str:
        """Get system prompt for industry decisions."""
        return """你是专业的行业分析师，擅长分析行业发展趋势和投资机会。
请基于提供的行业数据，给出客观、专业的投资建议。
只输出JSON格式，不要添加其他说明文字。"""

    def _get_batch_system_prompt(self) -> str:
        """Get system prompt for batch decisions."""
        return """你是专业的投资组合分析师，擅长批量分析多只股票。
请基于提供的成分股数据，为每只股票给出独立的投资建议。
只输出JSON数组格式，不要添加其他说明文字。"""

    def _parse_breadth_decision_response(self, content: str) -> Dict[str, Any]:
        """Parse AI response for breadth decision."""
        import json
        import re

        try:
            # Try to extract JSON from response
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                return {
                    "action": data.get("action", "hold"),
                    "confidence": float(data.get("confidence", 0.5)),
                    "reasoning": data.get("reasoning", ""),
                    "selected_stocks": data.get("selected_stocks", []),
                    "risk_factors": data.get("risk_factors", []),
                }
        except Exception as e:
            logger.warning(f"Failed to parse AI response: {e}")

        return {
            "action": "hold",
            "confidence": 0.0,
            "reasoning": "Failed to parse AI response",
        }

    def _parse_batch_decision_response(self, content: str, components: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Parse AI response for batch decisions."""
        import json
        import re

        try:
            # Try to extract JSON array from response
            json_match = re.search(r'\[.*\]', content, re.DOTALL)
            if json_match:
                decisions = json.loads(json_match.group())
                return [
                    {
                        "symbol": d.get("symbol"),
                        "action": d.get("action", "hold"),
                        "confidence": float(d.get("confidence", 0.5)),
                        "reasoning": d.get("reasoning", ""),
                    }
                    for d in decisions
                ]
        except Exception as e:
            logger.warning(f"Failed to parse batch AI response: {e}")

        # Return hold decisions for all components if parsing fails
        return [
            {
                "symbol": comp.get("symbol"),
                "action": "hold",
                "confidence": 0.0,
                "reasoning": "Failed to parse AI response",
            }
            for comp in components
        ]
