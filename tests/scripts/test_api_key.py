#!/usr/bin/env python3
"""
测试API密钥验证逻辑
"""

import os
import sys

# 添加AI服务路径
sys.path.append('/home/fe-jerome/projects/stock-race/ai-service/src')

# 测试环境变量
print("=== 环境变量测试 ===")
print(f"BACKEND_API_KEY: {os.getenv('BACKEND_API_KEY')}")
print(f"当前目录: {os.getcwd()}")

# 测试配置加载
try:
    from ai_service.core.config import settings
    print(f"\n=== 配置测试 ===")
    print(f"BACKEND_API_KEY from settings: {getattr(settings, 'BACKEND_API_KEY', 'NOT SET')}")
    print(f"所有设置: {settings.dict()}")
except Exception as e:
    print(f"配置加载错误: {e}")

# 测试API密钥验证
try:
    from ai_service.core.security import validate_api_key

    print(f"\n=== API密钥验证测试 ===")

    test_key = "stock-race-ai-key-production"
    print(f"测试密钥: {test_key}")
    print(f"验证结果: {validate_api_key(test_key)}")

    # 测试其他密钥
    test_keys = [
        "stock-race-api-key-123",
        "test-api-key",
        "stock-race-ai-key",
        "wrong-key"
    ]

    for key in test_keys:
        print(f"密钥 '{key}': {validate_api_key(key)}")

except Exception as e:
    print(f"API密钥验证错误: {e}")
    import traceback
    traceback.print_exc()

# 测试直接从.env文件读取
print(f"\n=== 直接读取.env文件 ===")
env_file = "/home/fe-jerome/projects/stock-race/ai-service/.env.production"
if os.path.exists(env_file):
    with open(env_file, 'r') as f:
        for line in f:
            if 'BACKEND_API_KEY' in line:
                print(f"从.env.production读取: {line.strip()}")
else:
    print(f"文件不存在: {env_file}")