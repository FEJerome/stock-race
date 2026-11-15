#!/usr/bin/env python3
"""
测试API密钥验证逻辑（卫生版）

安全口径：
- 不打印任何密钥值，只报告「已设置/未设置」与验证布尔结果。
- 不读取 .env / .env.production 等实际环境文件。
- 待测密钥从环境变量 TEST_API_KEY 读取；不内置任何形似真实的密钥字面量。

用法：
    BACKEND_API_KEY=<本地值> TEST_API_KEY=<待测值> python test_api_key.py
"""

import os
import sys

# 添加AI服务路径（按本机checkout位置设置 AI_SERVICE_SRC 环境变量）
AI_SERVICE_SRC = os.getenv("AI_SERVICE_SRC")
if AI_SERVICE_SRC:
    sys.path.append(AI_SERVICE_SRC)

# 测试环境变量（只报状态，不报值）
print("=== 环境变量状态 ===")
print(f"BACKEND_API_KEY: {'已设置' if os.getenv('BACKEND_API_KEY') else '未设置'}")
print(f"当前目录: {os.getcwd()}")

# 测试配置加载（不打印 settings 内容，避免泄漏配置中的敏感项）
try:
    from ai_service.core.config import settings
    print("\n=== 配置加载 ===")
    print(f"BACKEND_API_KEY in settings: {'已设置' if getattr(settings, 'BACKEND_API_KEY', None) else '未设置'}")
except Exception as e:
    print(f"配置加载错误: {type(e).__name__}: {e}")

# 测试API密钥验证（只输出布尔结果）
try:
    from ai_service.core.security import validate_api_key

    print("\n=== API密钥验证测试 ===")

    candidate = os.getenv("TEST_API_KEY")
    if candidate:
        print(f"TEST_API_KEY 验证结果: {validate_api_key(candidate)}")
    else:
        print("未提供 TEST_API_KEY 环境变量，跳过有效密钥验证")

    # 永假样本：公开仓库中的固定无效串，仅验证拒绝路径
    print(f"无效密钥验证结果（应为 False）: {validate_api_key('definitely-invalid-key')}")

except Exception as e:
    print(f"API密钥验证错误: {type(e).__name__}: {e}")
