"""
情绪分析处理器

基于关键词的情绪分类和分数计算
无需AI调用，零Token成本
"""
import re
from typing import List, Dict, Tuple
from collections import Counter

from .base import SentimentPost, SentimentResult, SentimentLevel


class SentimentProcessor:
    """
    社区情绪分析处理器

    使用关键词匹配进行情绪分类
    输出 -1 到 +1 的情绪分数
    """

    # 积极情绪关键词
    POSITIVE_WORDS = [
        # 上涨相关
        "涨", "涨停", "大涨", "暴涨", "起飞", "突破", "创新高",
        "牛市", "反转", "反弹", "上攻", "冲高", "拉升", "井喷",
        # 买入相关
        "看多", "买入", "加仓", "重仓", "抄底", "上车", "建仓",
        # 收益相关
        "吃肉", "挣钱", "赚钱", "盈利", "翻倍", "收获", "大肉",
        # 看好相关
        "看好", "优质", "龙头", "白马", "蓝筹", "好股", "金股",
        "利好", "增长", "爆发", "超预期", "稳了", "安心", "放心",
        # 信心相关
        "坚持", "持有", "不动", "锁仓", "耐心", "必胜", "冲",
    ]

    # 消极情绪关键词
    NEGATIVE_WORDS = [
        # 下跌相关
        "跌", "跌停", "大跌", "暴跌", "跳水", "崩盘", "创新低",
        "熊市", "破位", "杀跌", "下杀", "阴跌", "回落", "回调",
        # 卖出相关
        "看空", "卖出", "减仓", "清仓", "割肉", "止损", "跑路",
        "下车", "离场", "逃", "撤",
        # 亏损相关
        "亏", "亏损", "被套", "套牢", "血亏", "大亏", "亏了",
        "赔钱", "赔死", "完蛋", "完了", "没戏",
        # 看空相关
        "看衰", "垃圾", "垃圾股", "骗局", "忽悠", "坑人", "坑爹",
        "利空", "暴雷", "踩雷", "风险", "危险", "小心", "警惕",
        # 恐慌相关
        "害怕", "恐慌", "绝望", "死定了", "没救了", "上当", "被骗",
    ]

    # 中性词（用于权重调整）
    NEUTRAL_WORDS = [
        "分析", "讨论", "看看", "观望", "关注", "研究", "观察",
        "等待", "耐心", "冷静", "理性", "思考",
    ]

    def __init__(self):
        self._compile_patterns()

    def _compile_patterns(self):
        """预编译正则表达式"""
        # 为每个关键词创建匹配模式，使用 IGNORECASE 支持大小写不敏感匹配
        self._pos_pattern = re.compile(
            '|'.join(map(re.escape, self.POSITIVE_WORDS)),
            re.IGNORECASE
        )
        self._neg_pattern = re.compile(
            '|'.join(map(re.escape, self.NEGATIVE_WORDS)),
            re.IGNORECASE
        )

    def analyze(self, posts: List[SentimentPost]) -> SentimentResult:
        """
        分析帖子列表的情绪

        Args:
            posts: 帖子列表

        Returns:
            SentimentResult 情绪分析结果
        """
        if not posts:
            return self._create_empty_result("")

        symbol = posts[0].symbol if posts else ""

        # 对每个帖子进行情绪分类
        classified = []
        for post in posts:
            sentiment = self._classify_post(post)
            classified.append((post, sentiment))

        # 统计比例
        total = len(classified)
        positive_count = sum(1 for _, s in classified if s == "positive")
        negative_count = sum(1 for _, s in classified if s == "negative")
        neutral_count = total - positive_count - negative_count

        positive_ratio = positive_count / total if total > 0 else 0
        negative_ratio = negative_count / total if total > 0 else 0
        neutral_ratio = neutral_count / total if total > 0 else 0

        # 计算情绪分数 (-1 到 +1)
        # 公式: (positive_ratio - negative_ratio) / (1 - neutral_ratio * 0.5)
        denominator = 1 - neutral_ratio * 0.5
        if denominator > 0:
            score = (positive_ratio - negative_ratio) / denominator
        else:
            score = 0

        # 限制在 -1 到 +1 范围
        score = max(-1.0, min(1.0, score))

        # 确定情绪等级
        level = self._get_level(score)

        # 计算置信度
        # 基于样本数量和情绪分布集中度
        confidence = min(1.0, total / 20)  # 样本越多置信度越高
        if neutral_ratio > 0.7:
            confidence *= 0.7  # 中性太多降低置信度

        # 提取热门话题
        hot_topics = self._extract_hot_topics(posts)

        # 选择样本帖子
        sample_posts = self._select_sample_posts(classified)

        # 数据来源
        sources = list(set(p.source for p in posts))

        return SentimentResult(
            symbol=symbol,
            score=round(score, 3),
            level=level,
            confidence=round(confidence, 3),
            post_count=total,
            positive_ratio=round(positive_ratio, 3),
            negative_ratio=round(negative_ratio, 3),
            neutral_ratio=round(neutral_ratio, 3),
            hot_topics=hot_topics,
            sample_posts=sample_posts,
            data_sources=sources,
        )

    def _classify_post(self, post: SentimentPost) -> str:
        """
        对单条帖子进行情绪分类

        Returns:
            "positive" | "negative" | "neutral"
        """
        text = (post.title + " " + post.content).lower()

        # 统计关键词出现次数
        pos_matches = len(self._pos_pattern.findall(text))
        neg_matches = len(self._neg_pattern.findall(text))

        # 根据互动数据调整权重
        # 点赞、评论多的帖子权重更高
        weight = 1.0 + (post.likes + post.comments) / 100
        pos_matches *= weight
        neg_matches *= weight

        if pos_matches > neg_matches:
            return "positive"
        elif neg_matches > pos_matches:
            return "negative"
        else:
            return "neutral"

    def _get_level(self, score: float) -> SentimentLevel:
        """
        根据分数确定情绪等级

        Args:
            score: -1 到 +1 的分数

        Returns:
            SentimentLevel
        """
        if score > 0.6:
            return SentimentLevel.VERY_POSITIVE
        elif score > 0.2:
            return SentimentLevel.POSITIVE
        elif score > -0.2:
            return SentimentLevel.NEUTRAL
        elif score > -0.6:
            return SentimentLevel.NEGATIVE
        else:
            return SentimentLevel.VERY_NEGATIVE

    def _extract_hot_topics(self, posts: List[SentimentPost], top_n: int = 5) -> List[str]:
        """
        提取热门话题/关键词

        Args:
            posts: 帖子列表
            top_n: 返回前N个

        Returns:
            热门关键词列表
        """
        all_text = " ".join([p.title + " " + p.content for p in posts])

        # 提取2-4字的关键词
        words = []

        # 情绪词
        for word in self.POSITIVE_WORDS + self.NEGATIVE_WORDS:
            if word in all_text:
                words.append(word)

        # 统计词频
        counter = Counter(words)
        return [word for word, count in counter.most_common(top_n)]

    def _select_sample_posts(self, classified: List[Tuple[SentimentPost, str]], max_samples: int = 3) -> List[Dict]:
        """
        选择代表性帖子作为样本

        Args:
            classified: (帖子, 情绪) 元组列表
            max_samples: 最大样本数

        Returns:
            样本帖子字典列表
        """
        # 选择情绪最强烈的帖子
        samples = []

        # 按互动数排序，选热门的
        sorted_posts = sorted(
            classified,
            key=lambda x: x[0].likes + x[0].comments,
            reverse=True
        )

        for post, sentiment in sorted_posts[:max_samples]:
            samples.append({
                "title": post.title[:50],
                "author": post.author,
                "sentiment": sentiment,
                "likes": post.likes,
                "comments": post.comments,
                "url": post.url,
            })

        return samples

    def _create_empty_result(self, symbol: str) -> SentimentResult:
        """创建空结果"""
        return SentimentResult(
            symbol=symbol,
            score=0.0,
            level=SentimentLevel.NEUTRAL,
            confidence=0.0,
            post_count=0,
            positive_ratio=0.0,
            negative_ratio=0.0,
            neutral_ratio=1.0,
            hot_topics=[],
            sample_posts=[],
            data_sources=[],
        )

    def quick_analyze(self, text: str) -> Tuple[float, str]:
        """
        快速分析单条文本的情绪

        Args:
            text: 输入文本

        Returns:
            (分数, 情绪类型)
        """
        text = text.lower()

        pos_count = len(self._pos_pattern.findall(text))
        neg_count = len(self._neg_pattern.findall(text))

        total = pos_count + neg_count
        if total == 0:
            return 0.0, "neutral"

        # 计算 -1 到 +1 的分数
        score = (pos_count - neg_count) / total
        score = max(-1.0, min(1.0, score))

        if score > 0.2:
            return score, "positive"
        elif score < -0.2:
            return score, "negative"
        else:
            return score, "neutral"
