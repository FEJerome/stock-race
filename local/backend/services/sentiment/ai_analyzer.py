"""
基于LLM的AI情绪分析器

利用现有的AI适配器进行股票相关文本的情绪分析
"""
import json
import re
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class SentimentAnalysisResult:
    """情绪分析结果"""
    sentiment: str  # positive/negative/neutral
    confidence: float  # 0-1
    score: float  # -1 to 1, 负面为负，正面为正
    keywords: List[str]
    reasoning: str
    raw_response: Optional[str] = None


class SentimentAIAnalyzer:
    """
    基于LLM的情绪分析器

    使用现有的AI适配器进行股票相关文本的情绪分析
    """

    def __init__(self, adapter):
        """
        初始化AI情绪分析器

        Args:
            adapter: AI适配器实例 (BaseAIAdapter的子类)
        """
        self.adapter = adapter
        self._prompt_template = """分析以下股票相关文本的情绪倾向。

文本内容：
{text}

请分析该文本对股票的情绪倾向，并输出以下JSON格式：
{{
    "sentiment": "positive|negative|neutral",
    "confidence": 0.85,
    "score": 0.6,
    "keywords": ["keyword1", "keyword2"],
    "reasoning": "简要分析理由"
}}

字段说明：
- sentiment: 情绪标签，只能是 positive(正面)/negative(负面)/neutral(中性) 之一
- confidence: 置信度，0-1之间的小数
- score: 情绪得分，-1(极度负面)到1(极度正面)之间
- keywords: 影响情绪判断的关键词列表，3-5个
- reasoning: 简要的分析理由，20-50字

请只输出JSON，不要输出其他内容。"""

    async def analyze(self, text: str) -> SentimentAnalysisResult:
        """
        分析文本情绪

        Args:
            text: 待分析的文本

        Returns:
            SentimentAnalysisResult 分析结果
        """
        if not text or not text.strip():
            return SentimentAnalysisResult(
                sentiment='neutral',
                confidence=0.0,
                score=0.0,
                keywords=[],
                reasoning='空文本'
            )

        # 截断过长文本
        text = text[:2000] if len(text) > 2000 else text

        prompt = self._prompt_template.format(text=text)

        try:
            # 调用AI适配器
            response = await self._call_adapter(prompt)

            # 解析响应
            result = self._parse_response(response)
            result.raw_response = response

            return result

        except Exception as e:
            logger.error(f"AI情绪分析失败: {e}")
            # 降级到中性结果
            return SentimentAnalysisResult(
                sentiment='neutral',
                confidence=0.0,
                score=0.0,
                keywords=[],
                reasoning=f'分析失败: {str(e)}'
            )

    async def analyze_batch(
        self,
        texts: List[str],
        batch_size: int = 5
    ) -> List[SentimentAnalysisResult]:
        """
        批量分析文本情绪

        Args:
            texts: 文本列表
            batch_size: 批处理大小

        Returns:
            分析结果列表
        """
        results = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            batch_results = await self._analyze_batch_single(batch)
            results.extend(batch_results)
        return results

    async def _analyze_batch_single(
        self,
        texts: List[str]
    ) -> List[SentimentAnalysisResult]:
        """批量分析（单批次）"""
        # 构建批量prompt
        prompt = self._build_batch_prompt(texts)

        try:
            response = await self._call_adapter(prompt)
            return self._parse_batch_response(response, len(texts))
        except Exception as e:
            logger.error(f"批量AI情绪分析失败: {e}")
            # 逐个降级分析
            return [await self.analyze(text) for text in texts]

    def _build_batch_prompt(self, texts: List[str]) -> str:
        """构建批量分析prompt"""
        text_entries = []
        for i, text in enumerate(texts):
            truncated = text[:1000] if len(text) > 1000 else text
            text_entries.append(f"[{i}] {truncated}")

        all_texts = "\n\n".join(text_entries)

        return f"""分析以下{len(texts)}条股票相关文本的情绪倾向。

{all_texts}

请为每条文本输出JSON格式结果，用数组包裹：
[
    {{
        "sentiment": "positive|negative|neutral",
        "confidence": 0.85,
        "score": 0.6,
        "keywords": ["keyword1"],
        "reasoning": "分析理由"
    }},
    ...
]

请只输出JSON数组，不要输出其他内容。"""

    async def _call_adapter(self, prompt: str) -> str:
        """调用AI适配器"""
        # 检查适配器类型并调用相应方法
        if hasattr(self.adapter, 'analyze'):
            return await self.adapter.analyze(prompt)
        elif hasattr(self.adapter, 'chat'):
            return await self.adapter.chat(prompt)
        elif hasattr(self.adapter, 'generate'):
            return await self.adapter.generate(prompt)
        else:
            raise ValueError(f"适配器 {type(self.adapter)} 没有可用的分析方法")

    def _parse_response(self, response: str) -> SentimentAnalysisResult:
        """解析AI响应"""
        try:
            # 提取JSON部分
            json_str = self._extract_json(response)
            data = json.loads(json_str)

            # 验证和规范化
            sentiment = data.get('sentiment', 'neutral').lower()
            if sentiment not in ['positive', 'negative', 'neutral']:
                sentiment = 'neutral'

            confidence = float(data.get('confidence', 0.5))
            confidence = max(0.0, min(1.0, confidence))

            score = float(data.get('score', 0.0))
            score = max(-1.0, min(1.0, score))

            keywords = data.get('keywords', [])
            if not isinstance(keywords, list):
                keywords = []

            reasoning = data.get('reasoning', '')

            return SentimentAnalysisResult(
                sentiment=sentiment,
                confidence=confidence,
                score=score,
                keywords=keywords[:5],  # 最多5个关键词
                reasoning=reasoning
            )

        except json.JSONDecodeError as e:
            logger.warning(f"JSON解析失败，尝试启发式解析: {e}")
            return self._heuristic_parse(response)
        except Exception as e:
            logger.error(f"解析AI响应失败: {e}")
            return SentimentAnalysisResult(
                sentiment='neutral',
                confidence=0.0,
                score=0.0,
                keywords=[],
                reasoning='解析失败'
            )

    def _parse_batch_response(
        self,
        response: str,
        expected_count: int
    ) -> List[SentimentAnalysisResult]:
        """解析批量响应"""
        try:
            json_str = self._extract_json(response)
            data_list = json.loads(json_str)

            if not isinstance(data_list, list):
                raise ValueError("响应不是数组格式")

            results = []
            for data in data_list[:expected_count]:
                sentiment = data.get('sentiment', 'neutral').lower()
                confidence = float(data.get('confidence', 0.5))
                score = float(data.get('score', 0.0))

                results.append(SentimentAnalysisResult(
                    sentiment=sentiment if sentiment in ['positive', 'negative', 'neutral'] else 'neutral',
                    confidence=max(0.0, min(1.0, confidence)),
                    score=max(-1.0, min(1.0, score)),
                    keywords=data.get('keywords', [])[:5],
                    reasoning=data.get('reasoning', ''),
                ))

            # 补齐缺失的结果
            while len(results) < expected_count:
                results.append(SentimentAnalysisResult(
                    sentiment='neutral',
                    confidence=0.0,
                    score=0.0,
                    keywords=[],
                    reasoning='批量解析缺失'
                ))

            return results

        except Exception as e:
            logger.error(f"批量解析失败: {e}")
            return [
                SentimentAnalysisResult(
                    sentiment='neutral',
                    confidence=0.0,
                    score=0.0,
                    keywords=[],
                    reasoning='批量解析失败'
                )
                for _ in range(expected_count)
            ]

    def _extract_json(self, text: str) -> str:
        """从文本中提取JSON"""
        # 尝试匹配代码块
        code_block_pattern = r'```(?:json)?\s*(.*?)\s*```'
        matches = re.findall(code_block_pattern, text, re.DOTALL)
        if matches:
            return matches[0]

        # 尝试匹配方括号或花括号
        bracket_pattern = r'(\[[\s\S]*\]|\{[\s\S]*\})'
        matches = re.findall(bracket_pattern, text)
        if matches:
            # 选择最长的匹配
            return max(matches, key=len)

        return text

    def _heuristic_parse(self, response: str) -> SentimentAnalysisResult:
        """启发式解析（当JSON解析失败时）"""
        response_lower = response.lower()

        # 简单关键词匹配
        positive_words = ['positive', '正面', '积极', '乐观', '看好', '上涨']
        negative_words = ['negative', '负面', '消极', '悲观', '看空', '下跌']

        pos_count = sum(1 for w in positive_words if w in response_lower)
        neg_count = sum(1 for w in negative_words if w in response_lower)

        if pos_count > neg_count:
            sentiment = 'positive'
            score = 0.5
        elif neg_count > pos_count:
            sentiment = 'negative'
            score = -0.5
        else:
            sentiment = 'neutral'
            score = 0.0

        # 尝试提取confidence
        confidence_match = re.search(r'confidence[:\s]+([\d.]+)', response_lower)
        confidence = float(confidence_match.group(1)) if confidence_match else 0.5

        return SentimentAnalysisResult(
            sentiment=sentiment,
            confidence=confidence,
            score=score,
            keywords=[],
            reasoning='启发式解析结果'
        )