"""
Tests verifying that chat/dialogue endpoints are NOT present in this service.

Implements C4-TAI-001: Verify removal/absence of dialogue-related code.

Note: Per architecture decision C4-001, AI dialogue functionality is implemented
by the Backend service, not Trading AI Service.
"""

import pytest
from fastapi.testclient import TestClient
import sys
from pathlib import Path

# Add paths for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / "src"))
sys.path.insert(0, str(project_root.parent / "infra" / "service-state" / "src"))
sys.path.insert(0, str(project_root.parent / "infra" / "event-bus" / "src"))

from ai_service.main import app

client = TestClient(app)


class TestNoChatEndpoints:
    """Verify that chat/dialogue endpoints are not present."""

    def test_chat_endpoint_not_found(self):
        """Verify /chat endpoint returns 404."""
        response = client.post("/chat", json={"message": "test"})
        assert response.status_code == 404

    def test_chat_list_endpoint_not_found(self):
        """Verify /chat/list endpoint returns 404."""
        response = client.get("/chat/list")
        assert response.status_code == 404

    def test_conversation_endpoint_not_found(self):
        """Verify /conversation endpoint returns 404."""
        response = client.post("/conversation", json={"message": "test"})
        assert response.status_code == 404

    def test_dialogue_endpoint_not_found(self):
        """Verify /dialogue endpoint returns 404."""
        response = client.post("/dialogue", json={"message": "test"})
        assert response.status_code == 404

    def test_api_v1_chat_endpoint_not_found(self):
        """Verify /api/v1/chat endpoint returns 404."""
        response = client.post("/api/v1/chat", json={"message": "test"})
        assert response.status_code == 404

    def test_api_v1_conversation_endpoint_not_found(self):
        """Verify /api/v1/conversation endpoint returns 404."""
        response = client.get("/api/v1/conversation")
        assert response.status_code == 404

    def test_message_endpoint_not_found(self):
        """Verify /messages endpoint returns 404."""
        response = client.get("/messages")
        assert response.status_code == 404


class TestServiceScope:
    """Verify service scope matches architecture decision."""

    def test_decision_endpoint_exists(self):
        """Verify decision endpoint exists (core responsibility)."""
        # This should exist and return method not allowed (GET not allowed)
        response = client.get("/api/v1/decision/generate")
        # Should be 405 (Method Not Allowed) or 422 (validation error), not 404
        assert response.status_code in [405, 422, 403]

    def test_health_endpoint_exists(self):
        """Verify health endpoint exists."""
        response = client.get("/health")
        assert response.status_code == 200


class TestRoutesConfiguration:
    """Verify routes configuration doesn't include chat."""

    def test_routes_dont_include_chat(self):
        """Verify no chat routes are registered."""
        routes = [route.path for route in app.routes]

        # Check for any chat-related paths
        chat_paths = [r for r in routes if "chat" in r.lower()]
        conversation_paths = [r for r in routes if "conversation" in r.lower()]
        dialogue_paths = [r for r in routes if "dialogue" in r.lower()]

        assert len(chat_paths) == 0, f"Found chat routes: {chat_paths}"
        assert len(conversation_paths) == 0, f"Found conversation routes: {conversation_paths}"
        assert len(dialogue_paths) == 0, f"Found dialogue routes: {dialogue_paths}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
