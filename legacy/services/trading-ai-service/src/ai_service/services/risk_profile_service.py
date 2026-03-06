"""
Risk profile service.
多维度风险画像服务，实现12种主风险类型识别和4个维度评估。
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Dict, Any, Optional
import numpy as np
from loguru import logger


class RiskType(str, Enum):
    """12 main risk types."""
    MARKET = "market"  # 市场风险
    CREDIT = "credit"  # 信用风险
    LIQUIDITY = "liquidity"  # 流动性风险
    OPERATIONAL = "operational"  # 操作风险
    CONCENTRATION = "concentration"  # 集中度风险
    LEVERAGE = "leverage"  # 杠杆风险
    VOLATILITY = "volatility"  # 波动率风险
    CURRENCY = "currency"  # 汇率风险
    INTEREST_RATE = "interest_rate"  # 利率风险
    INFLATION = "inflation"  # 通胀风险
    REGULATORY = "regulatory"  # 监管风险
    COUNTERPARTY = "counterparty"  # 交易对手风险


class RiskLevel(str, Enum):
    """Risk levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class RiskDimension:
    """Risk dimension assessment."""
    name: str
    level: str
    score: float  # 0-100
    description: str
    factors: List[str] = field(default_factory=list)


@dataclass
class RiskItem:
    """Individual risk item."""
    type: RiskType
    level: RiskLevel
    score: float
    description: str
    mitigation: List[str] = field(default_factory=list)


@dataclass
class PortfolioData:
    """Portfolio data for risk analysis."""
    total_value: float
    cash_ratio: float
    positions: List[Dict[str, Any]]
    daily_returns: List[float]
    leverage: float
    margin_used: float
    investment_horizon_months: Optional[int] = None
    sector_exposure: Optional[Dict[str, float]] = None


@dataclass
class RiskProfile:
    """Complete risk profile."""
    overall_risk_score: float  # 0-100
    risk_level: str
    risk_dimensions: List[RiskDimension]
    risk_types: List[RiskItem]
    recommendations: List[str]
    generated_at: datetime = field(default_factory=datetime.now)
    risk_tolerance_suggestion: str = ""


class RiskProfileService:
    """Service for generating multi-dimensional risk profiles."""

    def __init__(self):
        self.risk_thresholds = {
            "low": 30,
            "medium": 60,
            "high": 80,
        }

    def generate_risk_profile(self, portfolio: PortfolioData) -> RiskProfile:
        """
        Generate a comprehensive risk profile for a portfolio.

        Args:
            portfolio: Portfolio data

        Returns:
            Complete risk profile
        """
        if portfolio.total_value <= 0:
            raise ValueError("Portfolio value must be positive")

        # Analyze 4 dimensions
        dimensions = self._analyze_dimensions(portfolio)

        # Identify 12 risk types
        risk_types = self._identify_risk_types(portfolio)

        # Calculate overall risk score
        overall_score = self._calculate_overall_risk_score(dimensions, risk_types)

        # Generate recommendations
        recommendations = self._generate_recommendations(dimensions, risk_types)

        # Determine risk level
        risk_level = self._categorize_risk_level(overall_score)

        # Suggest risk tolerance
        risk_tolerance = self._suggest_risk_tolerance(overall_score, dimensions)

        return RiskProfile(
            overall_risk_score=overall_score,
            risk_level=risk_level,
            risk_dimensions=dimensions,
            risk_types=risk_types,
            recommendations=recommendations,
            risk_tolerance_suggestion=risk_tolerance,
        )

    def _analyze_dimensions(self, portfolio: PortfolioData) -> List[RiskDimension]:
        """Analyze the 4 risk dimensions."""
        dimensions = []

        # 1. Volatility Tolerance (波动容忍度)
        vol_tolerance = self._analyze_volatility_tolerance(portfolio.daily_returns)
        dimensions.append(RiskDimension(
            name="volatility_tolerance",
            level=vol_tolerance["level"],
            score=vol_tolerance["score"],
            description=f"波动容忍度: {vol_tolerance['description']}",
            factors=vol_tolerance["factors"],
        ))

        # 2. Investment Horizon (投资期限)
        horizon = self._analyze_investment_horizon(portfolio)
        dimensions.append(RiskDimension(
            name="investment_horizon",
            level=horizon["level"],
            score=horizon["score"],
            description=f"投资期限: {horizon['description']}",
            factors=horizon["factors"],
        ))

        # 3. Concentration (集中度)
        concentration = self._analyze_concentration(portfolio)
        dimensions.append(RiskDimension(
            name="concentration",
            level=concentration["level"],
            score=concentration["score"],
            description=f"持仓集中度: {concentration['description']}",
            factors=concentration["factors"],
        ))

        # 4. Leverage (杠杆)
        leverage = self._analyze_leverage(portfolio)
        dimensions.append(RiskDimension(
            name="leverage",
            level=leverage["level"],
            score=leverage["score"],
            description=f"杠杆使用: {leverage['description']}",
            factors=leverage["factors"],
        ))

        return dimensions

    def _analyze_volatility_tolerance(self, daily_returns: List[float]) -> Dict[str, Any]:
        """Analyze volatility tolerance based on historical returns."""
        if not daily_returns or len(daily_returns) < 5:
            return {
                "level": "medium",
                "score": 50,
                "description": "数据不足，默认为中等波动容忍度",
                "factors": ["历史数据不足"],
            }

        volatility = np.std(daily_returns) * np.sqrt(252)  # Annualized volatility
        max_drawdown = self._calculate_max_drawdown(daily_returns)

        factors = []
        if volatility > 0.3:
            factors.append(f"高波动率: {volatility:.1%}")
        if max_drawdown < -0.2:
            factors.append(f"较大回撤: {max_drawdown:.1%}")

        if volatility > 0.4 or max_drawdown < -0.3:
            level = "high"
            score = 80
            description = "高波动容忍度，能承受大幅价格波动"
        elif volatility > 0.2 or max_drawdown < -0.15:
            level = "medium"
            score = 50
            description = "中等波动容忍度，能承受适度价格波动"
        else:
            level = "low"
            score = 20
            description = "低波动容忍度，偏好稳定收益"

        return {
            "level": level,
            "score": score,
            "description": description,
            "factors": factors or ["波动率在正常范围内"],
        }

    def _calculate_max_drawdown(self, returns: List[float]) -> float:
        """Calculate maximum drawdown from returns."""
        if not returns:
            return 0.0

        cumulative = [1.0]
        for r in returns:
            cumulative.append(cumulative[-1] * (1 + r))

        max_dd = 0.0
        peak = cumulative[0]
        for value in cumulative:
            if value > peak:
                peak = value
            dd = (peak - value) / peak
            max_dd = max(max_dd, dd)

        return -max_dd

    def _analyze_investment_horizon(self, portfolio: PortfolioData) -> Dict[str, Any]:
        """Analyze investment horizon."""
        factors = []

        # Check cash ratio
        if portfolio.cash_ratio > 0.3:
            factors.append("高现金比例，可能为短期投资")
            level = "short"
            score = 20
            description = "短期投资倾向（<1年）"
        elif portfolio.cash_ratio > 0.15:
            factors.append("中等现金比例")
            level = "medium"
            score = 50
            description = "中期投资倾向（1-3年）"
        else:
            factors.append("低现金比例，长期投资特征")
            level = "long"
            score = 80
            description = "长期投资倾向（>3年）"

        # Consider explicit horizon if provided
        if portfolio.investment_horizon_months:
            if portfolio.investment_horizon_months < 12:
                level = "short"
                score = min(score, 30)
            elif portfolio.investment_horizon_months > 36:
                level = "long"
                score = max(score, 70)

        return {
            "level": level,
            "score": score,
            "description": description,
            "factors": factors,
        }

    def _analyze_concentration(self, portfolio: PortfolioData) -> Dict[str, Any]:
        """Analyze portfolio concentration."""
        factors = []

        # Calculate position concentration
        weights = [p.get("weight", 0) for p in portfolio.positions]
        if weights:
            max_weight = max(weights)
            hhi = sum(w ** 2 for w in weights)  # Herfindahl-Hirschman Index
        else:
            max_weight = 0
            hhi = 0

        # Sector concentration
        sector_exposure = portfolio.sector_exposure or {}
        max_sector_exposure = max(sector_exposure.values()) if sector_exposure else 0

        if max_weight > 0.4:
            factors.append(f"单一持仓占比过高: {max_weight:.1%}")
        if max_sector_exposure > 0.5:
            factors.append(f"单一行业占比过高: {max_sector_exposure:.1%}")
        if hhi > 0.25:
            factors.append("持仓高度集中")

        if max_weight > 0.3 or hhi > 0.25 or max_sector_exposure > 0.5:
            level = "concentrated"
            score = 80
            description = "持仓高度集中，风险较高"
        elif max_weight > 0.2 or hhi > 0.15:
            level = "moderate"
            score = 50
            description = "持仓适度集中"
        else:
            level = "diversified"
            score = 20
            description = "持仓分散，风险分散良好"

        return {
            "level": level,
            "score": score,
            "description": description,
            "factors": factors or ["持仓分散度良好"],
        }

    def _analyze_leverage(self, portfolio: PortfolioData) -> Dict[str, Any]:
        """Analyze leverage usage."""
        factors = []

        leverage_ratio = portfolio.leverage
        margin_ratio = portfolio.margin_used / portfolio.total_value if portfolio.total_value > 0 else 0

        if leverage_ratio > 1.5:
            factors.append(f"使用杠杆: {leverage_ratio:.1f}x")
        if margin_ratio > 0.3:
            factors.append(f"高保证金使用: {margin_ratio:.1%}")

        if leverage_ratio > 2 or margin_ratio > 0.5:
            level = "high"
            score = 90
            description = "高杠杆使用，风险极高"
        elif leverage_ratio > 1.2 or margin_ratio > 0.2:
            level = "medium"
            score = 60
            description = "适度杠杆使用"
        else:
            level = "none"
            score = 0
            description = "无杠杆使用"

        return {
            "level": level,
            "score": score,
            "description": description,
            "factors": factors or ["无杠杆使用"],
        }

    def _identify_risk_types(self, portfolio: PortfolioData) -> List[RiskItem]:
        """Identify the 12 main risk types."""
        risks = []

        # 1. Market Risk
        if portfolio.daily_returns:
            volatility = np.std(portfolio.daily_returns) * np.sqrt(252)
            if volatility > 0.25:
                risks.append(RiskItem(
                    type=RiskType.MARKET,
                    level=RiskLevel.HIGH,
                    score=75,
                    description=f"高市场风险，年化波动率{volatility:.1%}",
                    mitigation=["考虑对冲策略", "分散投资"],
                ))

        # 2. Concentration Risk
        weights = [p.get("weight", 0) for p in portfolio.positions]
        if weights and max(weights) > 0.3:
            risks.append(RiskItem(
                type=RiskType.CONCENTRATION,
                level=RiskLevel.HIGH,
                score=70,
                description=f"集中度风险，最大持仓占比{max(weights):.1%}",
                mitigation=["增加持仓数量", "分散到不同行业"],
            ))

        # 3. Leverage Risk
        if portfolio.leverage > 1.2:
            risks.append(RiskItem(
                type=RiskType.LEVERAGE,
                level=RiskLevel.HIGH if portfolio.leverage > 2 else RiskLevel.MEDIUM,
                score=min(90, int(portfolio.leverage * 30)),
                description=f"杠杆风险，当前杠杆{portfolio.leverage:.1f}x",
                mitigation=["降低杠杆", "设置止损"],
            ))

        # 4. Liquidity Risk
        if portfolio.cash_ratio < 0.1:
            risks.append(RiskItem(
                type=RiskType.LIQUIDITY,
                level=RiskLevel.MEDIUM,
                score=50,
                description="流动性风险，现金比例过低",
                mitigation=["保持适当现金储备"],
            ))

        # 5. Volatility Risk
        if portfolio.daily_returns and np.std(portfolio.daily_returns) > 0.03:
            risks.append(RiskItem(
                type=RiskType.VOLATILITY,
                level=RiskLevel.MEDIUM,
                score=60,
                description="高波动率风险",
                mitigation=["使用期权对冲", "调整仓位"],
            ))

        # Add default low risks for other types
        covered_types = {r.type for r in risks}
        for risk_type in RiskType:
            if risk_type not in covered_types:
                risks.append(RiskItem(
                    type=risk_type,
                    level=RiskLevel.LOW,
                    score=20,
                    description=f"{risk_type.value}风险可控",
                    mitigation=["持续监控"],
                ))

        return risks

    def _calculate_overall_risk_score(
        self,
        dimensions: List[RiskDimension],
        risk_types: List[RiskItem]
    ) -> float:
        """Calculate overall risk score."""
        # Weight dimensions
        dim_weights = {
            "volatility_tolerance": 0.25,
            "investment_horizon": 0.20,
            "concentration": 0.30,
            "leverage": 0.25,
        }

        dim_score = sum(
            d.score * dim_weights.get(d.name, 0.25)
            for d in dimensions
        )

        # Weight risk types (top 3 highest risks)
        top_risks = sorted(risk_types, key=lambda r: r.score, reverse=True)[:3]
        risk_score = sum(r.score for r in top_risks) / len(top_risks) if top_risks else 0

        # Combine scores
        overall = dim_score * 0.4 + risk_score * 0.6

        return min(100, max(0, overall))

    def _generate_recommendations(
        self,
        dimensions: List[RiskDimension],
        risk_types: List[RiskItem]
    ) -> List[str]:
        """Generate risk management recommendations."""
        recommendations = []

        # Dimension-based recommendations
        for dim in dimensions:
            if dim.name == "concentration" and dim.score > 60:
                recommendations.append("建议分散投资，降低单一持仓比例")
            elif dim.name == "leverage" and dim.score > 50:
                recommendations.append("建议降低杠杆使用，控制爆仓风险")
            elif dim.name == "volatility_tolerance" and dim.score > 70:
                recommendations.append("当前波动容忍度较高，建议设置止损线")

        # Risk-based recommendations
        high_risks = [r for r in risk_types if r.level in (RiskLevel.HIGH, RiskLevel.CRITICAL)]
        for risk in high_risks:
            recommendations.extend(risk.mitigation)

        if not recommendations:
            recommendations.append("当前风险水平可控，继续保持")

        return list(set(recommendations))  # Remove duplicates

    def _categorize_risk_level(self, score: float) -> str:
        """Categorize overall risk score."""
        if score >= 80:
            return "critical"
        elif score >= 60:
            return "high"
        elif score >= 40:
            return "medium"
        elif score >= 20:
            return "low"
        else:
            return "minimal"

    def _suggest_risk_tolerance(self, score: float, dimensions: List[RiskDimension]) -> str:
        """Suggest appropriate risk tolerance level."""
        if score > 70:
            return "建议降低风险敞口，转为保守型投资策略"
        elif score > 50:
            return "当前风险水平偏高，建议适当降低仓位"
        elif score > 30:
            return "风险水平适中，可维持当前策略"
        else:
            return "风险水平较低，可根据收益目标适度增加风险敞口"

    def generate_natural_language_report(self, profile: RiskProfile) -> str:
        """Generate natural language risk report."""
        report_parts = []

        # Overall assessment
        report_parts.append(f"整体风险评分: {profile.overall_risk_score:.0f}/100 ({profile.risk_level})")

        # Dimension summaries
        report_parts.append("\n四维度风险评估:")
        for dim in profile.risk_dimensions:
            report_parts.append(f"  • {dim.description} (评分: {dim.score:.0f})")

        # Key risks
        high_risks = [r for r in profile.risk_types if r.level in (RiskLevel.HIGH, RiskLevel.CRITICAL)]
        if high_risks:
            report_parts.append("\n主要风险:")
            for risk in high_risks[:3]:
                report_parts.append(f"  • {risk.description}")

        # Recommendations
        report_parts.append("\n风险管理建议:")
        for rec in profile.recommendations[:5]:
            report_parts.append(f"  • {rec}")

        return "\n".join(report_parts)

    def get_risk_warnings(self, profile: RiskProfile) -> List[Dict[str, str]]:
        """Get risk warnings for the portfolio."""
        warnings = []

        for risk in profile.risk_types:
            if risk.level == RiskLevel.HIGH:
                warnings.append({
                    "level": "high",
                    "type": risk.type.value,
                    "message": risk.description,
                })
            elif risk.level == RiskLevel.CRITICAL:
                warnings.append({
                    "level": "critical",
                    "type": risk.type.value,
                    "message": f"严重: {risk.description}",
                })

        return warnings

    def compare_risk_profiles(self, profile1: RiskProfile, profile2: RiskProfile) -> Dict[str, Any]:
        """Compare two risk profiles."""
        return {
            "risk_score_diff": profile2.overall_risk_score - profile1.overall_risk_score,
            "profile1_level": profile1.risk_level,
            "profile2_level": profile2.risk_level,
            "higher_risk": "profile2" if profile2.overall_risk_score > profile1.overall_risk_score else "profile1",
        }
