# 模型可见性配置化架构设计方案

> **文档编号**: CC-TAI-001
> **所属服务**: Trading AI Service
> **文档类型**: 架构设计
> **创建日期**: 2026-02-12
> **状态**: 设计中（待评审）
> **关联需求**: 用户要求仅展示国内AI模型（DeepSeek/GLM/Kimi），但保留国外模型适配器以备未来扩展

---

## 一、设计背景

### 1.1 现状问题

当前 `Trading AI Service` 实现了 **7个AI提供商** 的适配器：
- **国内模型**（应展示）: DeepSeek、GLM(智谱AI)、Moonshot(Kimi)
- **国外模型**（应隐藏）: OpenAI、Claude
- **其他国内模型**（暂隐藏）: Qwen(通义千问)、Wenxin(文心一言)

**问题**: 模型列表硬编码在代码中，无法动态调整展示策略。

### 1.2 设计目标

| 目标 | 说明 |
|------|------|
| **后向兼容** | 保留所有适配器代码，仅通过配置控制可见性 |
| **配置化** | 使用配置文件控制模型展示，非硬编码 |
| **平滑演进** | 当前YAML配置 → 未来配置中心，无缝迁移 |
| **灰度控制** | 支持按用户/区域/时间维度控制模型可见性 |

---

## 二、架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    配置中心 (未来阶段)                        │
│            (Nacos / Apollo / Consul / etcd)                 │
│                      │                                      │
│                      ▼                                      │
│   ┌──────────────────────────────────────┐                 │
│   │     配置热更新通道                    │                 │
│   │   • 模型白名单变更                    │                 │
│   │   • 默认模型切换                      │                 │
│   │   • 区域可用模型                      │                 │
│   └──────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   本地配置层 (当前阶段)                       │
│  ┌──────────────────────────────────────────────────┐       │
│  │ config/models.yaml                               │       │
│  │ • enabled_models: 用户可见模型列表                │       │
│  │ • default_model: 默认模型                        │       │
│  │ • regional_restrictions: 区域限制                │       │
│  └──────────────────────────────────────────────────┘       │
│                         │                                   │
│  ┌──────────────────────────────────────────────────┐       │
│  │ ModelConfigService (配置服务层)                   │       │
│  │ • 读取配置                                        │       │
│  │ • 提供查询接口                                    │       │
│  │ • 支持热更新                                      │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   适配器注册层 (代码层面)                     │
│  ┌──────────────────────────────────────────────────┐       │
│  │ AdapterFactory                                    │       │
│  │ • 注册全部7个适配器 (保留)                        │       │
│  │ • 通过配置过滤可见性                              │       │
│  │ • 不存在的适配器调用时抛出异常                    │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
│  适配器列表:                                                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │DeepSeek │ │  GLM    │ │ Moonshot│ │ OpenAI  │ ...       │
│  │  (可见) │ │  (可见) │ │  (可见) │ │ (隐藏)  │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 配置分层

```
┌─────────────────────────────────────────┐
│  Layer 1: 配置中心 (未来)               │  ← 动态配置，热更新
│  • 模型可见性白名单                      │
│  • 灰度发布百分比                        │
│  • 区域限制策略                          │
├─────────────────────────────────────────┤
│  Layer 2: 环境变量                      │  ← 部署时配置
│  • 配置中心地址                          │
│  • 配置中心命名空间                      │
├─────────────────────────────────────────┤
│  Layer 3: 本地配置文件                  │  ← 默认配置，降级保护
│  • config/models.yaml                    │
│  • 配置中心不可用时使用                  │
├─────────────────────────────────────────┤
│  Layer 4: 代码默认配置                  │  ← 硬编码保底
│  • 默认模型：deepseek-chat               │
│  • 最少保留1个模型                       │
└─────────────────────────────────────────┘
```

**优先级**: 配置中心 > 环境变量 > 本地文件 > 代码默认

---

## 三、配置结构设计

### 3.1 配置文件: `config/models.yaml`

```yaml
# ==========================================
# 模型可见性配置
# 文件位置: trading-ai-service/config/models.yaml
# 更新时间: 2026-02-12
# ==========================================

version: "1.0"
config_id: "model-visibility-v1"
last_updated: "2026-02-12T10:00:00Z"

# ==========================================
# 核心配置：用户可见模型列表
# ==========================================
enabled_models:
  - provider: deepseek
    display_name: "深度求索"
    models:
      - id: "deepseek-chat"
        name: "DeepSeek-V3"
        description: "深度求索通用对话模型，性价比高"
        is_default: true
        features: ["chat", "analysis"]

      - id: "deepseek-reasoner"
        name: "DeepSeek-R1"
        description: "深度求索推理模型，适合复杂决策"
        is_default: false
        features: ["reasoning", "analysis"]

  - provider: glm
    display_name: "智谱AI"
    models:
      - id: "glm-4"
        name: "GLM-4"
        description: "智谱AI标准版"
        is_default: false
        features: ["chat", "analysis"]

      - id: "glm-4-plus"
        name: "GLM-4 Plus"
        description: "智谱AI增强版"
        is_default: false
        features: ["chat", "analysis"]

      - id: "glm-4.7"
        name: "GLM-4.7"
        description: "智谱AI最新版本"
        is_recommended: true
        is_default: false
        features: ["chat", "analysis", "latest"]

      - id: "glm-4-air"
        name: "GLM-4 Air"
        description: "智谱AI轻量版，响应快速"
        is_default: false
        features: ["chat", "fast"]

  - provider: moonshot
    display_name: "月之暗面 (Kimi)"
    models:
      - id: "moonshot-v1-8k"
        name: "Kimi K1"
        description: "月之暗面8K上下文"
        is_default: false
        context_window: 8192
        features: ["chat", "short-context"]

      - id: "moonshot-v1-32k"
        name: "Kimi K2"
        description: "月之暗面32K上下文"
        is_default: false
        context_window: 32768
        features: ["chat", "medium-context"]

      - id: "moonshot-v1-128k"
        name: "Kimi K3"
        description: "月之暗面128K长上下文"
        is_default: false
        context_window: 128000
        features: ["chat", "long-context"]

# ==========================================
# 默认模型配置
# 当用户未指定模型时使用
# ==========================================
default_model:
  provider: deepseek
  model_id: "deepseek-chat"

# ==========================================
# 隐藏模型配置（适配器存在但不展示）
# 为未来扩展保留
# ==========================================
disabled_models:
  - provider: openai
    reason: "regional_restriction"  # 区域限制
    reason_desc: "根据当前业务策略，暂不开放海外模型"
    models:
      - gpt-4
      - gpt-4-turbo
      - gpt-3.5-turbo

  - provider: claude
    reason: "regional_restriction"
    reason_desc: "根据当前业务策略，暂不开放海外模型"
    models:
      - claude-3-opus
      - claude-3-sonnet
      - claude-3-haiku

  - provider: qwen
    reason: "business_decision"  # 业务决策
    reason_desc: "暂不开放，后续根据用户需求评估"
    models:
      - qwen-turbo
      - qwen-plus
      - qwen-max

  - provider: wenxin
    reason: "business_decision"
    reason_desc: "暂不开放，后续根据用户需求评估"
    models:
      - ernie-bot
      - ernie-bot-turbo

# ==========================================
# 高级配置：区域限制（为未来准备）
# ==========================================
regional_config:
  # 中国大陆区域配置
  CN:
    enabled_providers: [deepseek, glm, moonshot]
    default_model:
      provider: deepseek
      model_id: "deepseek-chat"
    restrictions:
      - "openai"
      - "claude"

  # 海外区域配置（为未来扩展准备）
  OVERSEAS:
    enabled_providers: [openai, claude, deepseek, glm, moonshot]
    default_model:
      provider: openai
      model_id: "gpt-4"
    restrictions: []

# ==========================================
# 灰度发布配置（为未来准备）
# ==========================================
feature_flags:
  glm-4.7:
    enabled: true
    rollout_percentage: 100
    target_users: ["all"]
    start_time: "2026-02-12T00:00:00Z"

  moonshot-v1-128k:
    enabled: true
    rollout_percentage: 50
    target_users: ["beta_users", "vip_users"]
    start_time: "2026-02-15T00:00:00Z"

  openai-gpt4:
    enabled: false
    rollout_percentage: 0
    target_users: []
    start_time: null

# ==========================================
# 配置验证规则
# ==========================================
validation:
  required_providers: [deepseek]  # 至少保留一个提供商
  max_enabled_models: 10          # 最多展示10个模型
  allow_empty: false              # 不允许空列表
```

---

## 四、代码架构设计

### 4.1 新增组件: ModelConfigService

```python
# trading-ai-service/src/ai_service/services/model_config_service.py

"""
模型配置服务
职责：
1. 从YAML文件或配置中心读取模型可见性配置
2. 提供统一的模型列表查询接口
3. 支持配置热更新
4. 向后兼容：配置中心不可用时使用本地文件
"""

import os
import yaml
import time
from typing import List, Dict, Optional, Tuple
from pathlib import Path
from dataclasses import dataclass
from loguru import logger

from ..models.schemas import AIProvider


@dataclass
class ModelInfo:
    """模型信息"""
    id: str
    name: str
    description: str
    provider: AIProvider
    is_default: bool = False
    is_recommended: bool = False
    features: List[str] = None
    context_window: Optional[int] = None


@dataclass
class ProviderInfo:
    """提供商信息"""
    provider: AIProvider
    display_name: str
    models: List[ModelInfo]


class ModelConfigService:
    """
    模型配置服务

    单例模式，全应用共享
    支持配置热更新（文件修改自动重载）
    """

    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not self._initialized:
            self._config_path = self._get_config_path()
            self._config = None
            self._last_modified = 0
            self._last_check = 0
            self._check_interval = 30  # 30秒检查一次文件变更
            self._callbacks = []

            self._load_config()
            ModelConfigService._initialized = True

    def _get_config_path(self) -> str:
        """获取配置文件路径"""
        # 优先从环境变量获取
        config_path = os.getenv("MODEL_CONFIG_PATH")
        if config_path:
            return config_path

        # 默认路径
        base_dir = Path(__file__).parent.parent.parent
        return str(base_dir / "config" / "models.yaml")

    def _load_config(self):
        """加载配置文件"""
        try:
            with open(self._config_path, 'r', encoding='utf-8') as f:
                self._config = yaml.safe_load(f)
            self._last_modified = os.path.getmtime(self._config_path)
            logger.info(f"Model config loaded from {self._config_path}")
        except FileNotFoundError:
            logger.error(f"Config file not found: {self._config_path}")
            self._config = self._get_default_config()
        except yaml.YAMLError as e:
            logger.error(f"Invalid YAML format: {e}")
            self._config = self._get_default_config()

    def _get_default_config(self) -> Dict:
        """获取默认配置（降级保护）"""
        return {
            "enabled_models": [
                {
                    "provider": "deepseek",
                    "models": [
                        {"id": "deepseek-chat", "name": "DeepSeek-V3", "is_default": True}
                    ]
                }
            ],
            "default_model": {"provider": "deepseek", "model_id": "deepseek-chat"}
        }

    def _check_reload(self):
        """检查是否需要重载配置"""
        current_time = time.time()
        if current_time - self._last_check < self._check_interval:
            return

        self._last_check = current_time

        try:
            current_mtime = os.path.getmtime(self._config_path)
            if current_mtime > self._last_modified:
                logger.info("Config file changed, reloading...")
                self._load_config()
                self._notify_callbacks()
        except FileNotFoundError:
            pass

    def _notify_callbacks(self):
        """通知配置变更"""
        for callback in self._callbacks:
            try:
                callback(self._config)
            except Exception as e:
                logger.error(f"Config change callback error: {e}")

    def on_config_change(self, callback):
        """注册配置变更回调"""
        self._callbacks.append(callback)

    # ==================== 公共查询接口 ====================

    def get_enabled_providers(self) -> List[AIProvider]:
        """获取用户可见的提供商列表"""
        self._check_reload()

        providers = []
        for item in self._config.get("enabled_models", []):
            provider_str = item.get("provider")
            try:
                providers.append(AIProvider(provider_str))
            except ValueError:
                logger.warning(f"Unknown provider: {provider_str}")

        return providers

    def get_enabled_models(self, provider: AIProvider) -> List[ModelInfo]:
        """获取指定提供商下用户可见的模型列表"""
        self._check_reload()

        for item in self._config.get("enabled_models", []):
            if item.get("provider") == provider.value:
                models = []
                for model_data in item.get("models", []):
                    models.append(ModelInfo(
                        id=model_data["id"],
                        name=model_data["name"],
                        description=model_data.get("description", ""),
                        provider=provider,
                        is_default=model_data.get("is_default", False),
                        is_recommended=model_data.get("is_recommended", False),
                        features=model_data.get("features", []),
                        context_window=model_data.get("context_window")
                    ))
                return models

        return []

    def get_all_enabled_models(self) -> List[ModelInfo]:
        """获取所有用户可见的模型"""
        models = []
        for provider in self.get_enabled_providers():
            models.extend(self.get_enabled_models(provider))
        return models

    def is_model_enabled(self, provider: AIProvider, model_id: str) -> bool:
        """检查指定模型是否对用户可见"""
        self._check_reload()

        models = self.get_enabled_models(provider)
        return any(m.id == model_id for m in models)

    def is_provider_enabled(self, provider: AIProvider) -> bool:
        """检查指定提供商是否对用户可见"""
        return provider in self.get_enabled_providers()

    def get_default_model(self) -> Tuple[AIProvider, str]:
        """获取默认模型"""
        self._check_reload()

        default = self._config.get("default_model", {})
        provider_str = default.get("provider", "deepseek")
        model_id = default.get("model_id", "deepseek-chat")

        try:
            provider = AIProvider(provider_str)
        except ValueError:
            provider = AIProvider.DEEPSEEK
            model_id = "deepseek-chat"

        # 验证默认模型是否在启用列表中
        if not self.is_model_enabled(provider, model_id):
            # 使用第一个启用的模型作为默认
            enabled_models = self.get_all_enabled_models()
            if enabled_models:
                first_model = enabled_models[0]
                return (first_model.provider, first_model.id)

        return (provider, model_id)

    def get_disabled_reason(self, provider: AIProvider) -> Optional[str]:
        """获取模型被禁用的原因（用于错误提示）"""
        self._check_reload()

        for item in self._config.get("disabled_models", []):
            if item.get("provider") == provider.value:
                return item.get("reason_desc", "该模型当前不可用")

        return None

    def validate_config(self) -> Tuple[bool, List[str]]:
        """验证配置有效性"""
        errors = []

        # 检查是否至少有一个启用的模型
        enabled_models = self.get_all_enabled_models()
        if not enabled_models:
            errors.append("至少需要一个启用的模型")

        # 检查默认模型是否在启用列表中
        default_provider, default_model = self.get_default_model()
        if not self.is_model_enabled(default_provider, default_model):
            errors.append(f"默认模型 {default_model} 不在启用列表中")

        # 检查是否有重复的模型ID
        model_ids = [m.id for m in enabled_models]
        if len(model_ids) != len(set(model_ids)):
            errors.append("存在重复的模型ID")

        return (len(errors) == 0, errors)
```

### 4.2 AdapterFactory 修改

```python
# trading-ai-service/src/ai_service/adapters/base.py

class AdapterFactory:
    """
    适配器工厂 - 修改方案

    1. 保留所有适配器注册（7个）
    2. 通过配置服务过滤可见性
    3. 提供两个接口：
       - get_available_adapters(): 用户可见
       - get_adapter(): 获取具体适配器（需权限检查）
    """

    _adapters: Dict[AIProvider, BaseAdapter] = {}
    _config_service: Optional['ModelConfigService'] = None

    @classmethod
    def _get_config_service(cls) -> 'ModelConfigService':
        """获取配置服务"""
        if cls._config_service is None:
            from ..services.model_config_service import ModelConfigService
            cls._config_service = ModelConfigService()
        return cls._config_service

    @classmethod
    def get_available_adapters(cls) -> List[AIProvider]:
        """
        获取用户可见的适配器列表
        用于API端点: GET /decision/providers
        """
        return cls._get_config_service().get_enabled_providers()

    @classmethod
    def get_available_models(cls, provider: AIProvider) -> List[Dict]:
        """
        获取指定提供商下用户可见的模型列表
        用于API端点: GET /decision/providers/{provider}/models
        """
        config_service = cls._get_config_service()
        models = config_service.get_enabled_models(provider)
        return [
            {
                "id": m.id,
                "name": m.name,
                "description": m.description,
                "is_default": m.is_default,
                "is_recommended": m.is_recommended,
                "features": m.features
            }
            for m in models
        ]

    @classmethod
    async def get_adapter(
        cls,
        provider: AIProvider,
        model_id: Optional[str] = None,
        force_recreate: bool = False,
    ) -> BaseAdapter:
        """
        获取或创建适配器

        新增：检查模型是否在用户可见列表中
        注意：保留所有适配器的创建能力，但检查可见性
        """
        # 检查模型是否对用户可见
        config_service = cls._get_config_service()
        if model_id and not config_service.is_model_enabled(provider, model_id):
            # 模型被隐藏，记录警告但允许调用（后台任务等场景）
            logger.warning(
                f"Model {provider.value}/{model_id} is not in enabled list, "
                f"but adapter creation is allowed for internal use"
            )

        # 原有逻辑：创建适配器
        if not force_recreate and provider in cls._adapters:
            adapter = cls._adapters[provider]
            if adapter.is_initialized:
                return adapter

        adapter = cls._create_adapter(provider)
        await adapter.initialize()
        cls._adapters[provider] = adapter
        return adapter

    @classmethod
    def _create_adapter(cls, provider: AIProvider) -> BaseAdapter:
        """创建适配器实例 - 保留所有适配器"""
        if provider == AIProvider.OPENAI:
            from .openai_adapter import OpenAIAdapter
            return OpenAIAdapter()
        elif provider == AIProvider.CLAUDE:
            from .claude_adapter import ClaudeAdapter
            return ClaudeAdapter()
        elif provider == AIProvider.DEEPSEEK:
            from .deepseek_adapter import DeepSeekAdapter
            return DeepSeekAdapter()
        elif provider == AIProvider.QWEN:
            from .qwen_adapter import QwenAdapter
            return QwenAdapter()
        elif provider == AIProvider.WENXIN:
            from .wenxin_adapter import WenxinAdapter
            return WenxinAdapter()
        elif provider == AIProvider.GLM:
            from .glm_adapter import GLMAdapter
            return GLMAdapter()
        elif provider == AIProvider.MOONSHOT:
            from .moonshot_adapter import MoonshotAdapter
            return MoonshotAdapter()
        else:
            raise ValueError(f"Unsupported provider: {provider}")
```

### 4.3 API层修改

```python
# trading-ai-service/src/ai_service/api/endpoints/decision.py

@router.get("/providers")
async def get_available_providers():
    """
    获取可用AI提供商列表（用户可见）

    修改：从配置服务读取，而非硬编码
    """
    from ...services.model_config_service import ModelConfigService
    from ...adapters.base import AdapterFactory

    config_service = ModelConfigService()
    providers = AdapterFactory.get_available_adapters()

    result = []
    for provider in providers:
        provider_info = config_service.get_enabled_models(provider)
        if provider_info:  # 只返回有可用模型的提供商
            # 获取提供商显示名称
            display_name = _get_provider_display_name(provider)

            result.append({
                "id": provider.value,
                "name": display_name,
                "models": [
                    {
                        "id": m.id,
                        "name": m.name,
                        "description": m.description,
                        "is_default": m.is_default,
                        "is_recommended": m.is_recommended,
                    }
                    for m in provider_info
                ]
            })

    # 获取默认模型
    default_provider, default_model = config_service.get_default_model()

    return {
        "providers": result,
        "default_provider": default_provider.value,
        "default_model": default_model,
        "total_enabled": len(result)
    }


@router.post("/generate")
async def generate_decision(request: DecisionRequest):
    """
    生成交易决策

    新增：验证所选模型是否在用户可见列表中
    """
    from ...services.model_config_service import ModelConfigService

    config_service = ModelConfigService()

    # 新增：检查模型是否对用户可见
    selected_model = request.model_name
    if selected_model and not config_service.is_model_enabled(
        request.ai_provider, selected_model
    ):
        # 获取禁用原因
        reason = config_service.get_disabled_reason(request.ai_provider)
        raise HTTPException(
            status_code=403,
            detail={
                "error": "MODEL_NOT_AVAILABLE",
                "message": f"模型 {selected_model} 当前不可用",
                "reason": reason or "该模型不在当前可用列表中",
                "suggestion": "请选择其他可用模型"
            }
        )

    # 原有逻辑...
    pass


def _get_provider_display_name(provider: AIProvider) -> str:
    """获取提供商显示名称"""
    display_names = {
        AIProvider.DEEPSEEK: "深度求索",
        AIProvider.GLM: "智谱AI",
        AIProvider.MOONSHOT: "月之暗面 (Kimi)",
        AIProvider.OPENAI: "OpenAI",
        AIProvider.CLAUDE: "Anthropic Claude",
        AIProvider.QWEN: "阿里通义千问",
        AIProvider.WENXIN: "百度文心一言",
    }
    return display_names.get(provider, provider.value)
```

---

## 五、配置中心迁移路径

| 阶段 | 时间 | 配置源 | 关键变更 |
|------|------|--------|----------|
| **当前** | 2026-02 | `models.yaml` 本地文件 | 新增YAML配置，ModelConfigService读取本地文件 |
| **过渡** | 2026-03 | 本地文件 + 环境变量 | 关键配置（如默认模型）可通过环境变量覆盖 |
| **配置中心** | 2026-04+ | Nacos/Apollo/Consul | 接入配置中心，支持热更新，本地文件作为降级 |
| **完整** | 2026-05+ | 配置中心 + 本地降级 | 配置中心为主，本地文件为备份 |

### 5.1 配置中心接入方案

```python
# 未来扩展：配置中心适配器

class ConfigCenterAdapter(ABC):
    """配置中心适配器基类"""

    @abstractmethod
    def get_config(self, key: str) -> Dict:
        pass

    @abstractmethod
    def subscribe(self, key: str, callback: Callable):
        """订阅配置变更"""
        pass


class NacosConfigAdapter(ConfigCenterAdapter):
    """Nacos配置中心适配器"""
    pass


class ApolloConfigAdapter(ConfigCenterAdapter):
    """Apollo配置中心适配器"""
    pass
```

---

## 六、风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 配置文件格式错误 | 中 | 高 | 启动时验证，使用默认配置降级 |
| 配置与代码不同步 | 低 | 中 | CI/CD流程检查配置有效性 |
| 用户绕过前端调用禁用模型 | 低 | 高 | API层增加权限检查 |
| GLM 4.7 API不兼容 | 中 | 低 | 适配器支持动态探测，失败时记录日志 |
| 配置中心迁移困难 | 低 | 中 | 抽象配置接口，便于切换实现 |

---

## 七、相关文档

- [配置中心文档中心](./README.md) - 配置中心架构设计总入口
- [六服务架构设计](../SERVICE_ARCHITECTURE.md) - 整体服务架构
- [Trading AI Service TODO](../../../../modules/trading-ai-service/TODO.md) - 实施任务跟踪

---

## 八、待决策事项

| 事项 | 选项 | 建议 |
|------|------|------|
| 默认模型 | A) deepseek-chat B) glm-4 C) glm-4.7 | 建议 A（成本最低） |
| Kimi是否默认展示 | A) 全部展示 B) 仅8K C) 暂不展示 | 建议 A |
| 配置校验时机 | A) 启动时 B) 每次请求 C) 定时 | 建议 A+C |

---

*文档版本: v1.0*
*创建日期: 2026-02-12*
*维护者: 架构师*
*评审状态: 待评审*
