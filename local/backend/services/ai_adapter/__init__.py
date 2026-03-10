"""
AI Adapter Service - Unified interface for multiple LLM providers

Supports: Kimi K2.5, DeepSeek, Qwen, GLM
"""
from .base import AIAdapter, DecisionRequest, DecisionResponse, TokenUsage, DecisionAction, MarketContext, PositionContext
from .kimi_adapter import KimiAdapter

__all__ = [
    'AIAdapter',
    'DecisionRequest',
    'DecisionResponse',
    'TokenUsage',
    'DecisionAction',
    'MarketContext',
    'PositionContext',
    'KimiAdapter',
]

# Factory function
def get_ai_adapter(provider: str = "kimi", model: str = "kimi-k2-5", api_key: str = None):
    """
    Get AI adapter instance

    Args:
        provider: Provider name (kimi/deepseek/qwen/glm)
        model: Model name
        api_key: API key (optional, will use env var if not provided)
    """
    provider = provider.lower()

    if provider == "kimi":
        return KimiAdapter(model_name=model, api_key=api_key)
    else:
        raise ValueError(f"Unsupported provider: {provider}")
