"""
Integration tests for API endpoints.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock, MagicMock


class TestHealthEndpoints:
    """Test health check endpoints."""

    def test_health_check(self, test_client):
        """Test health check endpoint."""
        response = test_client.get("/health/")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["healthy", "degraded", "unhealthy"]
        assert data["service"] == "ai-service"
        assert data["version"] == "0.1.0"

    def test_ready_endpoint(self, test_client):
        """Test readiness probe endpoint."""
        response = test_client.get("/health/ready")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"

    def test_live_endpoint(self, test_client):
        """Test liveness probe endpoint."""
        response = test_client.get("/health/live")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "alive"


class TestDecisionEndpoints:
    """Test decision endpoints."""

    def test_list_ai_providers(self, test_client):
        """Test listing AI providers."""
        response = test_client.get("/decision/providers")

        assert response.status_code == 200
        data = response.json()
        assert "providers" in data
        assert "default_provider" in data
        assert "default_model" in data

        # Check provider structure
        providers = data["providers"]
        assert len(providers) > 0
        for provider in providers:
            assert "provider" in provider
            assert "name" in provider
            assert "models" in provider
            assert "enabled" in provider

    @patch('ai_service.api.endpoints.decision.DecisionService')
    @patch('ai_service.api.endpoints.decision.get_current_account')
    def test_generate_decision_success(
        self,
        mock_get_account,
        mock_decision_service_class,
        test_client,
        sample_decision_request,
    ):
        """Test successful decision generation."""
        # Mock account
        mock_get_account.return_value = "acc_123456"

        # Mock decision service
        mock_decision_service = AsyncMock()
        mock_decision_service.validate_decision_request = AsyncMock(return_value=[])
        mock_decision_service.generate_decision = AsyncMock(return_value=MagicMock(
            decision_id="dec_123",
            action="buy",
            symbol="AAPL",
            reasoning="Test reasoning",
            confidence_score=0.75,
            risk_level="medium",
            ai_provider="openai",
            model_name="gpt-3.5-turbo",
            timestamp="2024-01-01T00:00:00",
            processing_time_ms=1250,
            cost_usd=0.0025,
        ))
        mock_decision_service_class.return_value = mock_decision_service

        # Make request
        response = test_client.post(
            "/decision/generate",
            json=sample_decision_request,
            params={"use_cache": True},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["decision"]["decision_id"] == "dec_123"
        assert data["decision"]["action"] == "buy"
        assert data["warnings"] == []

    @patch('ai_service.api.endpoints.decision.get_current_account')
    def test_generate_decision_account_mismatch(
        self,
        mock_get_account,
        test_client,
        sample_decision_request,
    ):
        """Test decision generation with account mismatch."""
        # Mock account different from request
        mock_get_account.return_value = "acc_other"

        # Make request
        response = test_client.post(
            "/decision/generate",
            json=sample_decision_request,
        )

        assert response.status_code == 403
        data = response.json()
        assert "Account ID mismatch" in data["detail"]

    @patch('ai_service.api.endpoints.decision.RateLimiter')
    @patch('ai_service.api.endpoints.decision.get_current_account')
    def test_generate_decision_rate_limit(
        self,
        mock_get_account,
        mock_rate_limiter_class,
        test_client,
        sample_decision_request,
    ):
        """Test decision generation with rate limiting."""
        # Mock account
        mock_get_account.return_value = "acc_123456"

        # Mock rate limiter that denies request
        mock_rate_limiter = AsyncMock()
        mock_rate_limiter.check_rate_limit = AsyncMock(return_value=False)
        mock_rate_limiter_class.return_value = mock_rate_limiter

        # Make request
        response = test_client.post(
            "/decision/generate",
            json=sample_decision_request,
        )

        assert response.status_code == 429
        data = response.json()
        assert "Rate limit exceeded" in data["detail"]

    @patch('ai_service.api.endpoints.decision.DecisionService')
    @patch('ai_service.api.endpoints.decision.get_current_account')
    def test_generate_decision_service_error(
        self,
        mock_get_account,
        mock_decision_service_class,
        test_client,
        sample_decision_request,
    ):
        """Test decision generation with service error."""
        # Mock account
        mock_get_account.return_value = "acc_123456"

        # Mock decision service that raises exception
        mock_decision_service = AsyncMock()
        mock_decision_service.validate_decision_request = AsyncMock(return_value=[])
        mock_decision_service.generate_decision = AsyncMock(
            side_effect=Exception("Service error")
        )
        mock_decision_service_class.return_value = mock_decision_service

        # Make request
        response = test_client.post(
            "/decision/generate",
            json=sample_decision_request,
        )

        assert response.status_code == 200  # Error is captured in response
        data = response.json()
        assert data["success"] is False
        assert "error" in data
        assert "Service error" in data["error"]

    @patch('ai_service.api.endpoints.decision.DecisionService')
    @patch('ai_service.api.endpoints.decision.get_current_account')
    def test_batch_generate_decisions(
        self,
        mock_get_account,
        mock_decision_service_class,
        test_client,
        sample_decision_request,
    ):
        """Test batch decision generation."""
        # Mock account
        mock_get_account.return_value = "acc_123456"

        # Mock decision service
        mock_decision_service = AsyncMock()
        mock_decision_service.validate_decision_request = AsyncMock(return_value=[])
        mock_decision_service.generate_decision = AsyncMock(return_value=MagicMock(
            decision_id="dec_123",
            action="buy",
            symbol="AAPL",
            reasoning="Test reasoning",
            confidence_score=0.75,
            risk_level="medium",
            ai_provider="openai",
            model_name="gpt-3.5-turbo",
            timestamp="2024-01-01T00:00:00",
            processing_time_ms=1250,
            cost_usd=0.0025,
        ))
        mock_decision_service_class.return_value = mock_decision_service

        # Make batch request
        requests = [sample_decision_request, sample_decision_request]
        response = test_client.post(
            "/decision/batch-generate",
            json=requests,
            params={"use_cache": True},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        for item in data:
            assert item["success"] is True
            assert item["decision"]["decision_id"] == "dec_123"

    @patch('ai_service.api.endpoints.decision.get_current_account')
    def test_batch_generate_decisions_account_mismatch(
        self,
        mock_get_account,
        test_client,
        sample_decision_request,
    ):
        """Test batch decision generation with account mismatch."""
        # Mock account
        mock_get_account.return_value = "acc_123456"

        # Create request with different account ID
        request_with_different_account = sample_decision_request.copy()
        request_with_different_account["account_info"]["account_id"] = "acc_other"

        # Make batch request
        requests = [sample_decision_request, request_with_different_account]
        response = test_client.post(
            "/decision/batch-generate",
            json=requests,
        )

        assert response.status_code == 403
        data = response.json()
        assert "Account ID mismatch" in data["detail"]

    @patch('ai_service.api.endpoints.decision.DecisionService')
    @patch('ai_service.api.endpoints.decision.get_current_account')
    def test_get_decision_history(
        self,
        mock_get_account,
        mock_decision_service_class,
        test_client,
    ):
        """Test getting decision history."""
        # Mock account
        mock_get_account.return_value = "acc_123456"

        # Mock decision service
        mock_decision_service = AsyncMock()
        mock_decision_service.get_decision_history = AsyncMock(return_value=[
            {
                "decision_id": "dec_1",
                "action": "buy",
                "symbol": "AAPL",
                "timestamp": "2024-01-01T00:00:00",
            },
            {
                "decision_id": "dec_2",
                "action": "sell",
                "symbol": "GOOGL",
                "timestamp": "2024-01-02T00:00:00",
            },
        ])
        mock_decision_service_class.return_value = mock_decision_service

        # Make request
        response = test_client.get(
            "/decision/history",
            params={"limit": 10, "offset": 0},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["decision_id"] == "dec_1"
        assert data[1]["decision_id"] == "dec_2"

    @patch('ai_service.api.endpoints.decision.DecisionService')
    @patch('ai_service.api.endpoints.decision.get_current_account')
    def test_get_decision_history_error(
        self,
        mock_get_account,
        mock_decision_service_class,
        test_client,
    ):
        """Test getting decision history with error."""
        # Mock account
        mock_get_account.return_value = "acc_123456"

        # Mock decision service that raises exception
        mock_decision_service = AsyncMock()
        mock_decision_service.get_decision_history = AsyncMock(
            side_effect=Exception("Database error")
        )
        mock_decision_service_class.return_value = mock_decision_service

        # Make request
        response = test_client.get("/decision/history")

        assert response.status_code == 500
        data = response.json()
        assert "Failed to get decision history" in data["detail"]


class TestRootEndpoint:
    """Test root endpoint."""

    def test_root_endpoint(self, test_client):
        """Test root endpoint."""
        response = test_client.get("/")

        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "Stock Race AI Service"
        assert data["version"] == "0.1.0"
        assert "endpoints" in data
        assert "health" in data["endpoints"]
        assert "decision" in data["endpoints"]