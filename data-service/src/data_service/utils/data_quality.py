"""
数据质量评分和降级策略模块
"""

import statistics
from typing import List, Dict, Any, Optional, Set
from datetime import datetime, timedelta
from enum import Enum
from dataclasses import dataclass
from loguru import logger


class AnomalyType(Enum):
    """数据异常类型"""
    PRICE_EXTREME_CHANGE = "price_extreme_change"      # 价格极端变化（>10%）
    PRICE_OUT_OF_RANGE = "price_out_of_range"            # 价格超出合理范围
    VOLUME_ABNORMAL = "volume_abnormal"                 # 成交量异常
    VOLUME_ZERO = "volume_zero"                         # 成交量为零
    HIGH_LOW_INCONSISTENT = "high_low_inconsistent"      # 最高价低于最低价
    PRICE_OUTSIDE_HIGH_LOW = "price_outside_high_low"    # 价格不在高低价范围内
    BID_ASK_INVERTED = "bid_ask_inverted"              # 买价高于卖价
    NEGATIVE_VALUES = "negative_values"                  # 负值
    TIMESTAMP_STALE = "timestamp_stale"                 # 时间戳过旧
    CALCULATION_ERROR = "calculation_error"              # 计算错误
    Z_SCORE_OUTLIER = "z_score_outlier"                # 统计离群值


class DataQualityLevel(Enum):
    """数据质量等级"""
    EXCELLENT = "excellent"   # 90-100分：数据完整、新鲜、一致
    GOOD = "good"             # 70-89分：数据基本完整、可能有小问题
    FAIR = "fair"             # 50-69分：数据不完整或有明显问题
    POOR = "poor"             # 30-49分：数据质量差，需要谨慎使用
    INVALID = "invalid"         # 0-29分：数据无效，不应使用


@dataclass
class DataQualityScore:
    """数据质量评分结果"""
    score: float                      # 总分 0-100
    level: DataQualityLevel            # 质量等级
    freshness: float                  # 新鲜度评分 0-100
    completeness: float               # 完整性评分 0-100
    consistency: float                # 一致性评分 0-100
    plausibility: float              # 合理性评分 0-100
    warnings: List[str]              # 警告信息
    errors: List[str]                # 错误信息
    metadata: Dict[str, Any]          # 元数据
    source: str                      # 数据源
    anomalies: List[str]             # 检测到的异常类型
    anomaly_details: Dict[str, Any]   # 异常详细信息

    @property
    def is_usable(self) -> bool:
        """数据是否可用（得分 >= 30）"""
        return self.score >= 30

    @property
    def is_good_quality(self) -> bool:
        """数据是否为优质（得分 >= 70）"""
        return self.score >= 70

    @property
    def has_anomalies(self) -> bool:
        """是否有异常"""
        return len(self.anomalies) > 0

    @property
    def has_critical_anomalies(self) -> bool:
        """是否有严重异常（导致数据不可用）"""
        critical_types = {
            AnomalyType.PRICE_OUT_OF_RANGE.value,
            AnomalyType.HIGH_LOW_INCONSISTENT.value,
            AnomalyType.PRICE_OUTSIDE_HIGH_LOW.value,
            AnomalyType.CALCULATION_ERROR.value
        }
        return any(a in critical_types for a in self.anomalies)


class DataQualityScorer:
    """数据质量评分器"""

    def __init__(self):
        # 评分阈值配置
        self.freshness_thresholds = {
            "excellent": 5,      # 5秒内
            "good": 30,           # 30秒内
            "fair": 300,          # 5分钟内
            "poor": 3600          # 1小时内
        }

        self.completeness_thresholds = {
            "required_fields": ["price", "volume"],
            "optional_fields": ["open", "high", "low", "prev_close",
                              "bid_price", "ask_price", "change", "change_percent"]
        }

        self.plausibility_rules = {
            "min_price": 0.01,
            "max_price": 10000,
            "max_change_percent": 50,   # 单日涨跌幅最大50%（超过10%标记异常）
            "min_volume": 0,
            "max_volume": 1e10,       # 最大成交量
            "extreme_change_threshold": 10,  # 涨跌幅>10%标记为极端变化
            "volume_anomaly_multiplier": 3,   # 成交量异常倍数（3倍历史平均值）
            "volume_low_multiplier": 0.3,     # 成交量过低倍数（0.3倍历史平均值）
        }

        # 异常检测历史数据缓存（用于计算历史平均值）
        self.historical_cache: Dict[str, List[Dict[str, Any]]] = {}

    def score_quote(
        self,
        quote: Dict[str, Any],
        source: str,
        historical_data: Optional[List[Dict[str, Any]]] = None
    ) -> DataQualityScore:
        """
        对股票报价进行质量评分

        Args:
            quote: 股票报价数据
            source: 数据源名称
            historical_data: 历史数据用于一致性检查

        Returns:
            数据质量评分结果
        """
        warnings = []
        errors = []
        anomalies: List[str] = []
        anomaly_details: Dict[str, Any] = {}
        metadata = {}

        # 1. 新鲜度评分 (25分)
        freshness_score, freshness_warnings = self._score_freshness(quote)
        warnings.extend(freshness_warnings)

        # 2. 完整性评分 (30分)
        completeness_score, completeness_warnings = self._score_completeness(quote)
        warnings.extend(completeness_warnings)

        # 3. 合理性评分 (25分) - 包含异常检测
        plausibility_score, plausibility_errors, plausibility_warnings, plausibility_anomalies = self._score_plausibility(quote, historical_data)
        errors.extend(plausibility_errors)
        warnings.extend(plausibility_warnings)
        anomalies.extend(plausibility_anomalies)

        # 4. 一致性评分 (20分)
        consistency_score, consistency_warnings, consistency_anomalies = self._score_consistency(
            quote, historical_data
        )
        warnings.extend(consistency_warnings)
        anomalies.extend(consistency_anomalies)

        # 计算总分
        total_score = (
            freshness_score * 0.25 +
            completeness_score * 0.30 +
            plausibility_score * 0.25 +
            consistency_score * 0.20
        )

        # 确定质量等级
        quality_level = self._determine_quality_level(total_score)

        # 如果有错误，降低质量等级
        if errors:
            if total_score >= 50:
                total_score = max(30, total_score - 30)
                quality_level = self._determine_quality_level(total_score)
            elif total_score >= 30:
                total_score = 20
                quality_level = DataQualityLevel.INVALID

        metadata.update({
            "score_breakdown": {
                "freshness": freshness_score,
                "completeness": completeness_score,
                "plausibility": plausibility_score,
                "consistency": consistency_score
            },
            "scored_at": datetime.now().isoformat()
        })

        # 如果有异常，记录详细信息并告警
        if anomalies:
            anomaly_details["detected_anomalies"] = anomalies
            anomaly_details["anomaly_count"] = len(anomalies)

            # 记录异常告警
            symbol = quote.get("symbol", "unknown")
            if AnomalyType.PRICE_EXTREME_CHANGE.value in anomalies:
                change_percent = quote.get("change_percent", 0)
                logger.warning(
                    f"[异常检测] {symbol} 价格极端变化: {change_percent:.2f}% "
                    f"(阈值: {self.plausibility_rules['extreme_change_threshold']}%) "
                    f"[数据源: {source}]"
                )
                anomaly_details["price_extreme_change"] = {
                    "change_percent": change_percent,
                    "threshold": self.plausibility_rules["extreme_change_threshold"]
                }

            if AnomalyType.VOLUME_ABNORMAL.value in anomalies:
                volume = quote.get("volume", 0)
                logger.warning(
                    f"[异常检测] {symbol} 成交量异常: {volume} "
                    f"[数据源: {source}]"
                )
                if historical_data:
                    hist_volumes = [h.get("volume", 0) for h in historical_data[-20:] if h.get("volume", 0) > 0]
                    if hist_volumes:
                        avg_volume = statistics.mean(hist_volumes)
                        anomaly_details["volume_anomaly"] = {
                            "current_volume": volume,
                            "average_volume": avg_volume,
                            "multiplier": volume / avg_volume if avg_volume > 0 else 0
                        }

            if AnomalyType.VOLUME_ZERO.value in anomalies:
                logger.warning(
                    f"[异常检测] {symbol} 成交量为零 "
                    f"[数据源: {source}]"
                )

            if AnomalyType.Z_SCORE_OUTLIER.value in anomalies:
                logger.warning(
                    f"[异常检测] {symbol} 价格统计离群 "
                    f"[数据源: {source}]"
                )

        return DataQualityScore(
            score=round(total_score, 2),
            level=quality_level,
            freshness=freshness_score,
            completeness=completeness_score,
            consistency=consistency_score,
            plausibility=plausibility_score,
            warnings=warnings,
            errors=errors,
            metadata=metadata,
            source=source,
            anomalies=anomalies,
            anomaly_details=anomaly_details
        )

    def _score_freshness(self, quote: Dict[str, Any]) -> tuple[float, List[str]]:
        """评分数据新鲜度 (0-100)"""
        warnings = []
        score = 0.0

        timestamp = quote.get("timestamp")
        if not timestamp:
            warnings.append("缺少时间戳信息")
            return 0.0, warnings

        # 转换为datetime
        if isinstance(timestamp, str):
            try:
                timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except ValueError:
                warnings.append("时间戳格式无效")
                return 0.0, warnings

        # 计算数据年龄
        age_seconds = (datetime.now() - timestamp).total_seconds()

        # 根据年龄评分
        if age_seconds <= self.freshness_thresholds["excellent"]:
            score = 100.0
        elif age_seconds <= self.freshness_thresholds["good"]:
            # 线性衰减
            ratio = age_seconds / self.freshness_thresholds["good"]
            score = 100.0 - (ratio * 20)  # 80-100分
        elif age_seconds <= self.freshness_thresholds["fair"]:
            ratio = (age_seconds - self.freshness_thresholds["good"]) / (
                self.freshness_thresholds["fair"] - self.freshness_thresholds["good"]
            )
            score = 80.0 - (ratio * 40)  # 40-80分
        elif age_seconds <= self.freshness_thresholds["poor"]:
            ratio = (age_seconds - self.freshness_thresholds["fair"]) / (
                self.freshness_thresholds["poor"] - self.freshness_thresholds["fair"]
            )
            score = 40.0 - (ratio * 20)  # 20-40分
        else:
            score = 0.0
            warnings.append(f"数据过旧: {age_seconds:.0f}秒")

        return max(0.0, score), warnings

    def _score_completeness(self, quote: Dict[str, Any]) -> tuple[float, List[str]]:
        """评分数据完整性 (0-100)"""
        warnings = []

        # 必需字段（权重较高）
        required_fields = self.completeness_thresholds["required_fields"]
        required_score = 0.0
        required_missing = []

        for field in required_fields:
            if field in quote and quote[field] is not None:
                if isinstance(quote[field], (int, float)) and quote[field] == 0:
                    # 数值为0可能表示无效
                    if field == "price":
                        required_missing.append(f"{field}=0")
                    else:
                        required_score += 1
                else:
                    required_score += 1
            else:
                required_missing.append(field)

        # 可选字段
        optional_fields = self.completeness_thresholds["optional_fields"]
        optional_score = 0.0

        for field in optional_fields:
            if field in quote and quote[field] is not None:
                if isinstance(quote[field], (int, float)) and quote[field] == 0:
                    pass  # 0值不算也不扣分
                else:
                    optional_score += 1

        # 计算得分
        required_weight = 0.6  # 必需字段权重60%
        optional_weight = 0.4   # 可选字段权重40%

        required_normalized = required_score / len(required_fields) if required_fields else 0
        optional_normalized = optional_score / len(optional_fields) if optional_fields else 0

        total_score = (required_normalized * 100 * required_weight +
                      optional_normalized * 100 * optional_weight)

        # 缺少必需字段给出警告
        if required_missing:
            warnings.append(f"缺少必需字段: {', '.join(required_missing)}")
            # 严重扣分
            total_score -= len(required_missing) * 20

        return max(0.0, total_score), warnings

    def _score_plausibility(self, quote: Dict[str, Any], historical_data: Optional[List[Dict[str, Any]]] = None) -> tuple[float, List[str], List[str], List[str]]:
        """评分数据合理性 (0-100)，返回 (score, errors, warnings, anomalies)"""
        errors = []
        warnings = []
        anomalies = []
        score = 100.0
        rules = self.plausibility_rules

        price = quote.get("price", 0)
        if not isinstance(price, (int, float)):
            errors.append("价格数据类型无效")
            anomalies.append(AnomalyType.CALCULATION_ERROR.value)
            return 0.0, errors, warnings, anomalies

        # 检查价格范围
        if price < rules["min_price"]:
            errors.append(f"价格低于最小值: {price} < {rules['min_price']}")
            anomalies.append(AnomalyType.PRICE_OUT_OF_RANGE.value)
            score -= 100
        elif price > rules["max_price"]:
            errors.append(f"价格超过最大值: {price} > {rules['max_price']}")
            anomalies.append(AnomalyType.PRICE_OUT_OF_RANGE.value)
            score -= 100

        # 检查涨跌幅 - 分级处理
        change_percent = quote.get("change_percent", 0)
        if change_percent:
            abs_change = abs(change_percent)

            # 极端变化检测（>10%）
            if abs_change > rules["extreme_change_threshold"]:
                anomalies.append(AnomalyType.PRICE_EXTREME_CHANGE.value)
                warnings.append(f"价格极端变化: {change_percent:.2f}% (阈值: ±{rules['extreme_change_threshold']}%)")

            # 超过最大允许范围
            if abs_change > rules["max_change_percent"]:
                warnings.append(f"涨跌幅超限: {change_percent}%")
                score -= 30
            elif abs_change > rules["extreme_change_threshold"]:
                # 在10%-50%之间，适度扣分
                score -= 10

        # 检查成交量 - 异常检测
        volume = quote.get("volume", 0)
        if volume < rules["min_volume"]:
            warnings.append("成交量为0")
            anomalies.append(AnomalyType.VOLUME_ZERO.value)
            score -= 10
        elif volume > rules["max_volume"]:
            warnings.append(f"成交量异常: {volume}")
            anomalies.append(AnomalyType.VOLUME_ABNORMAL.value)
            score -= 20
        else:
            # 与历史数据比较，检测成交量异常
            if historical_data and len(historical_data) >= 5:
                hist_volumes = [h.get("volume", 0) for h in historical_data[-20:] if h.get("volume", 0) > 0]
                if hist_volumes:
                    avg_volume = statistics.mean(hist_volumes)
                    if avg_volume > 0:
                        volume_ratio = volume / avg_volume

                        # 成交量过高或过低
                        if volume_ratio >= rules["volume_anomaly_multiplier"]:
                            anomalies.append(AnomalyType.VOLUME_ABNORMAL.value)
                            warnings.append(f"成交量异常偏高: 当前{volume}, 均值{avg_volume:.0f}, 倍数{volume_ratio:.1f}x")
                            score -= 5
                        elif volume_ratio <= rules["volume_low_multiplier"]:
                            anomalies.append(AnomalyType.VOLUME_ABNORMAL.value)
                            warnings.append(f"成交量异常偏低: 当前{volume}, 均值{avg_volume:.0f}, 倍数{volume_ratio:.1f}x")
                            score -= 3

        # 检查价格关系
        open_price = quote.get("open", 0)
        high = quote.get("high", 0)
        low = quote.get("low", 0)

        if high and low:
            if high < low:
                errors.append(f"最高价低于最低价: {high} < {low}")
                anomalies.append(AnomalyType.HIGH_LOW_INCONSISTENT.value)
                score -= 50
            elif price < low or price > high:
                warnings.append(f"价格不在高低价范围内: {price} 不在 [{low}, {high}]")
                anomalies.append(AnomalyType.PRICE_OUTSIDE_HIGH_LOW.value)
                score -= 20

        if open_price and high and low:
            if open_price > high:
                warnings.append(f"开盘价高于最高价: {open_price} > {high}")
                score -= 10
            if open_price < low:
                warnings.append(f"开盘价低于最低价: {open_price} < {low}")
                score -= 10

        # 检查买卖价
        bid_price = quote.get("bid_price")
        ask_price = quote.get("ask_price")

        if bid_price and ask_price:
            if bid_price > ask_price:
                anomalies.append(AnomalyType.BID_ASK_INVERTED.value)
                warnings.append(f"买价高于卖价: {bid_price} > {ask_price}")
                score -= 15
            if bid_price < 0 or ask_price < 0:
                anomalies.append(AnomalyType.NEGATIVE_VALUES.value)
                warnings.append("买卖价为负数")
                score -= 10

        # 检查负值
        if price < 0 or volume < 0:
            anomalies.append(AnomalyType.NEGATIVE_VALUES.value)
            errors.append("价格或成交量为负数")
            score -= 50

        return max(0.0, score), errors, warnings, anomalies

    def _score_consistency(
        self,
        quote: Dict[str, Any],
        historical_data: Optional[List[Dict[str, Any]]]
    ) -> tuple[float, List[str], List[str]]:
        """评分数据一致性 (0-100)，返回 (score, warnings, anomalies)"""
        warnings = []
        anomalies = []
        score = 100.0

        if not historical_data or len(historical_data) < 5:
            # 没有足够的历史数据，无法评分一致性
            return score, warnings, anomalies

        # 获取最近价格
        recent_prices = [
            float(d.get("close", d.get("price", 0)))
            for d in historical_data[-10:]
            if d.get("close") or d.get("price")
        ]

        if not recent_prices:
            return score, warnings, anomalies

        current_price = quote.get("price", 0)

        # 计算统计量
        avg_price = statistics.mean(recent_prices)
        price_std = statistics.stdev(recent_prices) if len(recent_prices) > 1 else 0

        if price_std > 0:
            # 计算Z-score
            z_score = abs(current_price - avg_price) / price_std

            # 根据Z-score评分
            if z_score <= 1:
                # 正常波动范围
                score = 100.0
            elif z_score <= 2:
                score = 80.0
                warnings.append(f"价格波动较大: Z-score={z_score:.2f}")
            elif z_score <= 3:
                score = 50.0
                warnings.append(f"价格波动异常: Z-score={z_score:.2f}")
            else:
                score = 0.0
                warnings.append(f"价格波动极度异常: Z-score={z_score:.2f}")
                anomalies.append(AnomalyType.Z_SCORE_OUTLIER.value)

        # 检查涨跌幅一致性
        prev_close = quote.get("prev_close", 0)
        calculated_change = quote.get("change", 0)
        calculated_change_percent = quote.get("change_percent", 0)

        if prev_close > 0:
            expected_change = current_price - prev_close
            expected_change_percent = (expected_change / prev_close) * 100

            # 比较计算值
            if calculated_change:
                if abs(calculated_change - expected_change) > 0.01:
                    warnings.append("涨跌额计算不一致")
                    anomalies.append(AnomalyType.CALCULATION_ERROR.value)

            if calculated_change_percent:
                if abs(calculated_change_percent - expected_change_percent) > 1:
                    warnings.append("涨跌幅计算不一致")
                    anomalies.append(AnomalyType.CALCULATION_ERROR.value)

        return max(0.0, score), warnings, anomalies

    def _determine_quality_level(self, score: float) -> DataQualityLevel:
        """根据分数确定质量等级"""
        if score >= 90:
            return DataQualityLevel.EXCELLENT
        elif score >= 70:
            return DataQualityLevel.GOOD
        elif score >= 50:
            return DataQualityLevel.FAIR
        elif score >= 30:
            return DataQualityLevel.POOR
        else:
            return DataQualityLevel.INVALID


class DataFallbackStrategy:
    """数据降级策略"""

    def __init__(self):
        self.scorer = DataQualityScorer()

        # 质量阈值
        self.quality_thresholds = {
            "use_without_warning": 70,   # >= 70分：直接使用
            "use_with_warning": 50,       # >= 50分：带警告使用
            "use_with_caution": 30,      # >= 30分：谨慎使用
            "reject": 30                 # < 30分：拒绝使用
        }

    def evaluate_and_fallback(
        self,
        quotes_by_source: Dict[str, Dict[str, Any]],
        historical_data: Optional[Dict[str, List[Dict[str, Any]]] ] = None
    ) -> Dict[str, Any]:
        """
        评估多源数据并选择最佳数据

        Args:
            quotes_by_source: 各数据源的报价数据
            historical_data: 历史数据用于一致性检查

        Returns:
            {
                "quote": 选择的报价数据,
                "quality": 质量评分结果,
                "source": 选择的数据源,
                "warnings": 警告列表,
                "fallback_used": 是否使用了降级策略,
                "all_scores": 所有数据源得分
            }
        """
        if not quotes_by_source:
            return {
                "quote": None,
                "quality": None,
                "source": None,
                "warnings": ["没有可用的数据源"],
                "fallback_used": True,
                "anomalies": [AnomalyType.CALCULATION_ERROR.value],
                "all_scores": []
            }

        # 评估每个数据源的数据质量
        evaluated_sources = []
        all_anomalies: Set[str] = set()

        for source, quote in quotes_by_source.items():
            hist_data = historical_data.get(
                quote.get("symbol", ""), []
            ) if historical_data else None

            quality_score = self.scorer.score_quote(quote, source, hist_data)

            # 收集所有异常
            all_anomalies.update(quality_score.anomalies)

            evaluated_sources.append({
                "source": source,
                "quote": quote,
                "quality": quality_score
            })

        # 按质量评分排序
        evaluated_sources.sort(
            key=lambda x: x["quality"].score,
            reverse=True
        )

        # 选择最佳数据
        best = evaluated_sources[0]
        warnings = list(best["quality"].warnings)
        fallback_used = False

        # 根据质量等级决定
        if best["quality"].score >= self.quality_thresholds["use_without_warning"]:
            # 直接使用
            logger.debug(f"使用高质量数据: {best['source']} (得分: {best['quality'].score})")

        elif best["quality"].score >= self.quality_thresholds["use_with_warning"]:
            # 带警告使用
            warnings.append(f"数据质量一般 (得分: {best['quality'].score}), 建议谨慎使用")
            fallback_used = True
            logger.warning(f"使用低质量数据: {best['source']} (得分: {best['quality'].score})")

        elif best["quality"].score >= self.quality_thresholds["use_with_caution"]:
            # 谨慎使用，尝试合并数据
            warnings.append(f"数据质量较低 (得分: {best['quality'].score}), 使用需谨慎")
            fallback_used = True

            # 尝试使用多源合并数据
            if len(evaluated_sources) > 1:
                merged_quote = self._merge_quotes(evaluated_sources[:3])
                if merged_quote:
                    best["quote"] = merged_quote
                    warnings.append("使用了多源合并数据")
                    logger.warning(f"使用多源合并数据")

        else:
            # 拒绝使用，尝试多源合并
            fallback_used = True
            warnings.append(f"数据质量太低 (得分: {best['quality'].score}), 尝试多源合并")

            if len(evaluated_sources) > 1:
                merged_quote = self._merge_quotes(evaluated_sources)
                if merged_quote:
                    best["quote"] = merged_quote
                    warnings.append("使用了多源合并数据")
                else:
                    warnings.append("多源合并失败，数据不可用")
                    best["quote"] = None
            else:
                warnings.append("单源数据且质量过低，数据不可用")
                best["quote"] = None

        return {
            "quote": best["quote"],
            "quality": best["quality"],
            "source": best["source"],
            "warnings": warnings,
            "fallback_used": fallback_used,
            "all_scores": [
                {"source": e["source"], "score": e["quality"].score}
                for e in evaluated_sources
            ]
        }

    def _merge_quotes(self, evaluated_sources: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        合并多个数据源的数据

        Args:
            evaluated_sources: 已评估的数据源列表

        Returns:
            合并后的报价数据
        """
        if not evaluated_sources:
            return None

        # 收集有效数据
        valid_quotes = [
            e["quote"] for e in evaluated_sources
            if e["quality"].is_usable and e["quote"].get("price")
        ]

        if not valid_quotes:
            return None

        # 使用权重合并（权重基于质量评分）
        weights = [
            e["quality"].score for e in evaluated_sources
            if e["quality"].is_usable
        ]

        total_weight = sum(weights)
        if total_weight == 0:
            return None

        # 获取第一个数据作为模板
        merged = valid_quotes[0].copy()

        # 合并价格（加权平均）
        prices = [q.get("price", 0) for q in valid_quotes]
        if prices:
            merged["price"] = sum(
                p * w for p, w in zip(prices, weights)
            ) / total_weight

        # 合并成交量（加权平均）
        volumes = [q.get("volume", 0) for q in valid_quotes]
        if volumes:
            merged["volume"] = sum(
                v * w for v, w in zip(volumes, weights)
            ) / total_weight

        # 合并开高低价（加权平均）
        for field in ["open", "high", "low"]:
            values = [q.get(field, 0) for q in valid_quotes]
            if values and any(values):
                valid_values = [v for v in values if v and v > 0]
                if valid_values:
                    merged[field] = sum(valid_values) / len(valid_values)

        # 合并涨跌幅
        prev_close = merged.get("prev_close", 0)
        if prev_close > 0:
            merged["change"] = merged["price"] - prev_close
            merged["change_percent"] = (merged["change"] / prev_close) * 100

        # 添加来源标记
        merged["data_sources"] = [e["source"] for e in evaluated_sources]
        merged["is_merged"] = True
        merged["merge_weights"] = weights

        return merged

    def generate_fallback_data(
        self,
        symbol: str,
        historical_data: Optional[List[Dict[str, Any]]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        生成备份数据（当所有数据源都失败时）

        Args:
            symbol: 股票代码
            historical_data: 历史数据

        Returns:
            备份数据
        """
        warnings = []

        # 尝试基于历史数据生成
        if historical_data and len(historical_data) >= 1:
            latest = historical_data[-1]
            fallback = {
                "symbol": symbol,
                "price": latest.get("close", 0),
                "prev_close": latest.get("close", 0),
                "open": latest.get("close", 0),
                "high": latest.get("close", 0),
                "low": latest.get("close", 0),
                "volume": 0,
                "change": 0,
                "change_percent": 0,
                "timestamp": datetime.now(),
                "is_fallback": True,
                "fallback_source": "historical_data"
            }
            warnings.append("使用历史数据作为备份数据")
            return fallback

        # 生成最小备份数据
        fallback = {
            "symbol": symbol,
            "price": 0,
            "prev_close": 0,
            "open": 0,
            "high": 0,
            "low": 0,
            "volume": 0,
            "change": 0,
            "change_percent": 0,
            "timestamp": datetime.now(),
            "is_fallback": True,
            "fallback_source": "minimal",
            "warnings": ["所有数据源失败，使用最小备份数据"]
        }

        logger.error(f"所有数据源失败，使用最小备份数据: {symbol}")
        return fallback


# 全局实例
_quality_scorer: Optional[DataQualityScorer] = None
_fallback_strategy: Optional[DataFallbackStrategy] = None


def get_quality_scorer() -> DataQualityScorer:
    """获取数据质量评分器实例"""
    global _quality_scorer
    if _quality_scorer is None:
        _quality_scorer = DataQualityScorer()
    return _quality_scorer


def get_fallback_strategy() -> DataFallbackStrategy:
    """获取数据降级策略实例"""
    global _fallback_strategy
    if _fallback_strategy is None:
        _fallback_strategy = DataFallbackStrategy()
    return _fallback_strategy
