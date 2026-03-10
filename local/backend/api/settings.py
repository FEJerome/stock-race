"""
Settings API - API Key configuration and system settings

Used by frontend Settings.vue for API key management
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import os

router = APIRouter(prefix="/api", tags=["settings"])


class SettingsResponse(BaseModel):
    moonshot_api_key: Optional[str] = None
    deepseek_api_key: Optional[str] = None
    qwen_api_key: Optional[str] = None


class SettingsUpdate(BaseModel):
    moonshot_api_key: Optional[str] = None
    deepseek_api_key: Optional[str] = None
    qwen_api_key: Optional[str] = None


class TestConnectionRequest(BaseModel):
    api_key: str


class ApiResponse(BaseModel):
    code: int
    message: str
    data: Optional[dict] = None


def mask_api_key(key: str) -> str:
    """Mask API key for display: sk-***abc123"""
    if not key or len(key) < 10:
        return key
    return key[:3] + "***" + key[-6:]


@router.get("/settings", response_model=ApiResponse)
async def get_settings():
    """
    Get current settings (API keys are masked)
    """
    # Read from environment variables
    moonshot_key = os.environ.get("MOONSHOT_API_KEY", "")
    deepseek_key = os.environ.get("DEEPSEEK_API_KEY", "")
    qwen_key = os.environ.get("DASHSCOPE_API_KEY", "")

    return ApiResponse(
        code=0,
        message="success",
        data={
            "moonshot_api_key": mask_api_key(moonshot_key) if moonshot_key else "",
            "deepseek_api_key": mask_api_key(deepseek_key) if deepseek_key else "",
            "qwen_api_key": mask_api_key(qwen_key) if qwen_key else "",
        }
    )


@router.post("/settings", response_model=ApiResponse)
async def update_settings(settings: SettingsUpdate):
    """
    Update settings - updates environment variables for current session
    Note: Keys are not persisted to disk for security
    """
    updated = []

    if settings.moonshot_api_key and not settings.moonshot_api_key.startswith("***"):
        os.environ["MOONSHOT_API_KEY"] = settings.moonshot_api_key
        updated.append("moonshot")

    if settings.deepseek_api_key and not settings.deepseek_api_key.startswith("***"):
        os.environ["DEEPSEEK_API_KEY"] = settings.deepseek_api_key
        updated.append("deepseek")

    if settings.qwen_api_key and not settings.qwen_api_key.startswith("***"):
        os.environ["DASHSCOPE_API_KEY"] = settings.qwen_api_key
        updated.append("qwen")

    return ApiResponse(
        code=0,
        message=f"Settings updated: {', '.join(updated)}" if updated else "No changes",
        data={"updated": updated}
    )


@router.post("/test-connection/moonshot", response_model=ApiResponse)
async def test_moonshot_connection(request: TestConnectionRequest):
    """
    Test Moonshot API connection
    """
    import aiohttp

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://api.moonshot.cn/v1/models",
                headers={"Authorization": f"Bearer {request.api_key}"},
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    return ApiResponse(
                        code=0,
                        message="Connection successful",
                        data={"status": "ok"}
                    )
                elif response.status == 401:
                    return ApiResponse(
                        code=1,
                        message="Invalid API key",
                        data={"status": "error"}
                    )
                else:
                    return ApiResponse(
                        code=1,
                        message=f"API error: {response.status}",
                        data={"status": "error"}
                    )
    except Exception as e:
        return ApiResponse(
            code=1,
            message=f"Connection failed: {str(e)}",
            data={"status": "error"}
        )


@router.post("/test-connection/deepseek", response_model=ApiResponse)
async def test_deepseek_connection(request: TestConnectionRequest):
    """
    Test DeepSeek API connection
    """
    import aiohttp

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://api.deepseek.com/v1/models",
                headers={"Authorization": f"Bearer {request.api_key}"},
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    return ApiResponse(
                        code=0,
                        message="Connection successful",
                        data={"status": "ok"}
                    )
                elif response.status == 401:
                    return ApiResponse(
                        code=1,
                        message="Invalid API key",
                        data={"status": "error"}
                    )
                else:
                    return ApiResponse(
                        code=1,
                        message=f"API error: {response.status}",
                        data={"status": "error"}
                    )
    except Exception as e:
        return ApiResponse(
            code=1,
            message=f"Connection failed: {str(e)}",
            data={"status": "error"}
        )


@router.post("/test-connection/qwen", response_model=ApiResponse)
async def test_qwen_connection(request: TestConnectionRequest):
    """
    Test Qwen (DashScope) API connection
    """
    import aiohttp

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://dashscope.aliyuncs.com/api/v1/models",
                headers={"Authorization": f"Bearer {request.api_key}"},
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    return ApiResponse(
                        code=0,
                        message="Connection successful",
                        data={"status": "ok"}
                    )
                elif response.status == 401:
                    return ApiResponse(
                        code=1,
                        message="Invalid API key",
                        data={"status": "error"}
                    )
                else:
                    return ApiResponse(
                        code=1,
                        message=f"API error: {response.status}",
                        data={"status": "error"}
                    )
    except Exception as e:
        return ApiResponse(
            code=1,
            message=f"Connection failed: {str(e)}",
            data={"status": "error"}
        )


@router.get("/health", response_model=ApiResponse)
async def health_check():
    """
    Extended health check with system info
    """
    import sys

    return ApiResponse(
        code=0,
        message="healthy",
        data={
            "version": "1.0.0",
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "status": "running"
        }
    )
