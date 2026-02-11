"""
Unit tests for risk profile service.
"""

import pytest
from datetime import datetime
from typing import Dict, Any

from ai_service.services.risk_profile_service import (
    RiskProfileService,
    RiskProfile,
    RiskDimension,
    RiskType,
    PortfolioData,
)


@pytest.fixture
def risk_service():
    """Create a risk profile service instance."""
    return RiskProfileService()


@pytest.fixture
def sample_portfolio() -> PortfolioData:
    """Create sample portfolio data."""
    return PortfolioData(
        total_value=1000000.0,
        cash_ratio=0.2,
        positions=[
            {"symbol": "AAPL", "value": 200000.0, "weight": 0.25},
            {"symbol": "GOOGL", "value": 150000.0, "weight": 0.1875},
            {"symbol": "MSFT", "value": 150000.0, "weight": 0.1875},
            {"symbol": "TSLA", "value": 100000.0, "weight": 0.125},
            {"symbol": "AMZN", "value": 100000.0, "weight": 0.125},
        ],
        daily_returns=[0.01, -0.02, 0.015, -0.01, 0.005, 0.02, -0.015],
        leverage=1.0,
        margin_used=0.0,
    )


@pytest.fixture
def high_risk_portfolio() -> PortfolioData:
    """Create a high risk portfolio."""
    return PortfolioData(
        total_value=500000.0,
        cash_ratio=0.05,
        positions=[
            {"symbol": "TSLA", "value": 300000.0, "weight": 0.6},  # 60% in one stock
            {"symbol": "NVDA", "value": 150000.0, "weight": 0.3},
            {"symbol": "AMD", "value": 25000.0, "weight": 0.05},
        ],
        daily_returns=[0.05, -0.08, 0.06, -0.05, 0.03, -0.07, 0.04],  # High volatility
        leverage=2.0,
        margin_used=250000.0,
    )


class TestRiskProfileService:
    """Test suite for risk profile service."""

    def test_init(self, risk_service):
        """Test service initialization."""
        assert risk_service is not None

    def test_analyze_volatility_tolerance_low(self, risk_service):
        """Test low volatility tolerance detection."""
        returns = [0.001, 0.002, -0.001, 0.001, 0.002]  # Low volatility
        tolerance = risk_service._analyze_volatility_tolerance(returns)

        assert tolerance.level == "low"
        assert tolerance.score >= 0
        assert tolerance.score <= 100

    def test_analyze_volatility_tolerance_high(self, risk_service):
        """Test high volatility tolerance detection."""
        returns = [0.05, -0.08, 0.06, -0.05, 0.07]  # High volatility
        tolerance = risk_service._analyze_volatility_tolerance(returns)

        assert tolerance.level == "high"
        assert tolerance.score >= 0
        assert tolerance.score <= 100

    def test_analyze_investment_horizon_short(self, risk_service):
        """Test short investment horizon detection."""
        portfolio = PortfolioData(
            total_value=100000.0,
            cash_ratio=0.5,  # High cash ratio suggests short-term
            positions=[{"symbol": "AAPL", "value": 50000.0, "weight": 1.0}],
            daily_returns=[],
            leverage=1.0,
            margin_used=0.0,
        )
        horizon = risk_service._analyze_investment_horizon(portfolio)

        assert horizon.level == "short"

    def test_analyze_investment_horizon_long(self, risk_service):
        """Test long investment horizon detection."""
        portfolio = PortfolioData(
            total_value=1000000.0,
            cash_ratio=0.1,  # Low cash ratio
            positions=[{"symbol": "VTI", "value": 900000.0, "weight": 0.9}],  # Index fund
            daily_returns=[],
            leverage=1.0,
            margin_used=0.0,
        )
        horizon = risk_service._analyze_investment_horizon(portfolio)

        assert horizon.level == "long"

    def test_analyze_concentration_diversified(self, risk_service, sample_portfolio):
        """Test diversified concentration detection."""
        concentration = risk_service._analyze_concentration(sample_portfolio)

        assert concentration.level == "diversified"
        assert concentration.score >= 0
        assert concentration.score <= 100

    def test_analyze_concentration_concentrated(self, risk_service, high_risk_portfolio):
        """Test concentrated portfolio detection."""
        concentration = risk_service._analyze_concentration(high_risk_portfolio)

        assert concentration.level == "concentrated"

    def test_analyze_leverage_no_leverage(self, risk_service, sample_portfolio):
        """Test no leverage detection."""
        leverage = risk_service._analyze_leverage(sample_portfolio)

        assert leverage.level == "none"
        assert leverage.score == 0

    def test_analyze_leverage_high_leverage(self, risk_service, high_risk_portfolio):
        """Test high leverage detection."""
        leverage = risk_service._analyze_leverage(high_risk_portfolio)

        assert leverage.level == "high"
        assert leverage.score > 0

    def test_identify_risk_types_market_risk(self, risk_service, high_risk_portfolio):
        """Test market risk identification."""
        risks = risk_service._identify_risk_types(high_risk_portfolio)

        risk_types = [r.type for r in risks]
        assert RiskType.MARKET in risk_types

    def test_identify_risk_types_concentration_risk(self, risk_service, high_risk_portfolio):
        """Test concentration risk identification."""
        risks = risk_service._identify_risk_types(high_risk_portfolio)

        risk_types = [r.type for r in risks]
        assert RiskType.CONCENTRATION in risk_types

    def test_identify_risk_types_leverage_risk(self, risk_service, high_risk_portfolio):
        """Test leverage risk identification."""
        risks = risk_service._identify_risk_types(high_risk_portfolio)

        risk_types = [r.type for r in risks]
        assert RiskType.LEVERAGE in risk_types

    def test_calculate_overall_risk_score_low(self, risk_service, sample_portfolio):
        """Test low risk score calculation."""
        profile = risk_service.generate_risk_profile(sample_portfolio)

        assert profile.overall_risk_score >= 0
        assert profile.overall_risk_score <= 100
        # Diversified portfolio should have lower risk
        assert profile.overall_risk_score < 50

    def test_calculate_overall_risk_score_high(self, risk_service, high_risk_portfolio):
        """Test high risk score calculation."""
        profile = risk_service.generate_risk_profile(high_risk_portfolio)

        assert profile.overall_risk_score >= 0
        assert profile.overall_risk_score <= 100
        # High risk portfolio should have higher risk score
        assert profile.overall_risk_score > 50

    def test_generate_risk_profile(self, risk_service, sample_portfolio):
        """Test complete risk profile generation."""
        profile = risk_service.generate_risk_profile(sample_portfolio)

        assert isinstance(profile, RiskProfile)
        assert profile.overall_risk_score >= 0
        assert profile.overall_risk_score <= 100
        assert len(profile.risk_dimensions) > 0
        assert len(profile.risk_types) > 0
        assert len(profile.recommendations) >= 0

    def test_generate_natural_language_report(self, risk_service, sample_portfolio):
        """Test natural language report generation."""
        profile = risk_service.generate_risk_profile(sample_portfolio)
        report = risk_service.generate_natural_language_report(profile)

        assert isinstance(report, str)
        assert len(report) > 0
        assert "风险" in report or "risk" in report.lower()

    def test_get_risk_warnings(self, risk_service, high_risk_portfolio):
        """Test risk warnings generation."""
        profile = risk_service.generate_risk_profile(high_risk_portfolio)
        warnings = risk_service.get_risk_warnings(profile)

        assert isinstance(warnings, list)
        assert len(warnings) > 0
        for warning in warnings:
            assert "level" in warning
            assert "message" in warning

    def test_compare_risk_profiles(self, risk_service, sample_portfolio, high_risk_portfolio):
        """Test risk profile comparison."""
        profile1 = risk_service.generate_risk_profile(sample_portfolio)
        profile2 = risk_service.generate_risk_profile(high_risk_portfolio)

        comparison = risk_service.compare_risk_profiles(profile1, profile2)

        assert isinstance(comparison, dict)
        assert "risk_score_diff" in comparison
        assert profile2.overall_risk_score > profile1.overall_risk_score

    def test_empty_portfolio(self, risk_service):
        """Test handling of empty portfolio."""
        empty_portfolio = PortfolioData(
            total_value=0.0,
            cash_ratio=1.0,
            positions=[],
            daily_returns=[],
            leverage=1.0,
            margin_used=0.0,
        )

        with pytest.raises(ValueError):
            risk_service.generate_risk_profile(empty_portfolio)

    def test_risk_level_categorization(self, risk_service):
        """Test risk level categorization."""
        assert risk_service._categorize_risk_level(20) == "low"
        assert risk_service._categorize_risk_level(50) == "medium"
        assert risk_service._categorize_risk_level(80) == "high"
