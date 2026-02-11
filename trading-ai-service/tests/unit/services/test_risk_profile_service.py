"""Unit tests for risk profile service."""
import pytest
from ai_service.services.risk_profile_service import (
    RiskProfileService, RiskProfile, RiskType, PortfolioData
)

@pytest.fixture
def risk_service():
    return RiskProfileService()

@pytest.fixture
def sample_portfolio():
    return PortfolioData(
        total_value=1000000.0,
        cash_ratio=0.2,
        positions=[
            {"symbol": "AAPL", "value": 200000.0, "weight": 0.25},
            {"symbol": "GOOGL", "value": 150000.0, "weight": 0.1875},
        ],
        daily_returns=[0.01, -0.02, 0.015, -0.01, 0.005],
        leverage=1.0,
        margin_used=0.0,
    )

@pytest.fixture
def high_risk_portfolio():
    return PortfolioData(
        total_value=500000.0,
        cash_ratio=0.05,
        positions=[
            {"symbol": "TSLA", "value": 300000.0, "weight": 0.6},
        ],
        daily_returns=[0.05, -0.08, 0.06],
        leverage=2.0,
        margin_used=250000.0,
    )

class TestRiskProfileService:
    def test_init(self, risk_service):
        assert risk_service is not None

    def test_generate_risk_profile(self, risk_service, sample_portfolio):
        profile = risk_service.generate_risk_profile(sample_portfolio)
        assert isinstance(profile, RiskProfile)
        assert 0 <= profile.overall_risk_score <= 100
        assert len(profile.risk_dimensions) > 0
        assert len(profile.risk_types) > 0

    def test_generate_risk_profile_high_risk(self, risk_service, high_risk_portfolio):
        profile = risk_service.generate_risk_profile(high_risk_portfolio)
        assert profile.overall_risk_score > 50

    def test_generate_natural_language_report(self, risk_service, sample_portfolio):
        profile = risk_service.generate_risk_profile(sample_portfolio)
        report = risk_service.generate_natural_language_report(profile)
        assert isinstance(report, str)
        assert len(report) > 0

    def test_get_risk_warnings(self, risk_service, high_risk_portfolio):
        profile = risk_service.generate_risk_profile(high_risk_portfolio)
        warnings = risk_service.get_risk_warnings(profile)
        assert isinstance(warnings, list)

    def test_categorize_risk_level(self, risk_service):
        assert risk_service._categorize_risk_level(15) == "minimal"
        assert risk_service._categorize_risk_level(30) == "low"
        assert risk_service._categorize_risk_level(50) == "medium"
        assert risk_service._categorize_risk_level(80) == "critical"
