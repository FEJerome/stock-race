#!/bin/bash

# AI服务API密钥验证脚本
# 用于验证用户提供的DeepSeek和GLM API密钥功能

set -e

echo "=== AI服务API密钥验证脚本 ==="
echo "开始时间: $(date)"
echo ""

# 检查环境变量
echo "1. 检查环境变量配置..."
if [ -f "../ai-service/.env" ]; then
    echo "✅ 找到AI服务环境变量文件"
    source "../ai-service/.env"
elif [ -f "../ai-service/.env.example" ]; then
    echo "⚠️  使用示例环境变量文件"
    source "../ai-service/.env.example"
else
    echo "❌ 未找到环境变量文件"
    exit 1
fi

# 检查必需的环境变量
echo ""
echo "2. 检查必需的环境变量..."
REQUIRED_VARS=("DEEPSEEK_API_KEY" "GLM_API_KEY")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
        echo "❌ 缺失环境变量: $var"
    else
        echo "✅ 环境变量 $var 已设置"
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo ""
    echo "⚠️  以下环境变量未设置: ${MISSING_VARS[*]}"
    echo "请在 ai-service/.env 文件中设置这些变量"
    exit 1
fi

# 测试DeepSeek API连接
echo ""
echo "3. 测试DeepSeek API连接..."
DEEPSEEK_TEST_RESPONSE=$(curl -s -X POST "https://api.deepseek.com/v1/chat/completions" \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {"role": "user", "content": "Hello, this is a test message."}
    ],
    "max_tokens": 10
  }' 2>/dev/null || echo "{}")

if echo "$DEEPSEEK_TEST_RESPONSE" | grep -q "error"; then
    ERROR_MSG=$(echo "$DEEPSEEK_TEST_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('error', {}).get('message', 'Unknown error'))" 2>/dev/null || echo "Unknown error")
    echo "❌ DeepSeek API连接失败: $ERROR_MSG"
else
    echo "✅ DeepSeek API连接成功"
fi

# 测试GLM API连接
echo ""
echo "4. 测试GLM API连接..."
GLM_TEST_RESPONSE=$(curl -s -X POST "https://open.bigmodel.cn/api/paas/v4/chat/completions" \
  -H "Authorization: Bearer $GLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-4",
    "messages": [
      {"role": "user", "content": "Hello, this is a test message."}
    ],
    "max_tokens": 10
  }' 2>/dev/null || echo "{}")

if echo "$GLM_TEST_RESPONSE" | grep -q "error"; then
    ERROR_MSG=$(echo "$GLM_TEST_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('error', {}).get('message', 'Unknown error'))" 2>/dev/null || echo "Unknown error")
    echo "❌ GLM API连接失败: $ERROR_MSG"
else
    echo "✅ GLM API连接成功"
fi

# 测试AI服务健康状态
echo ""
echo "5. 测试AI服务健康状态..."
if curl -s "http://localhost:8000/api/v1/health/" > /dev/null 2>&1; then
    echo "✅ AI服务运行正常"

    # 测试AI决策端点
    echo ""
    echo "6. 测试AI决策端点..."
    DECISION_TEST_RESPONSE=$(curl -s -X POST "http://localhost:8000/api/v1/decision/generate" \
      -H "Content-Type: application/json" \
      -d '{
        "account_id": 1,
        "symbol": "000001.SZ",
        "current_price": 10.5,
        "portfolio_value": 10000,
        "available_cash": 5000
      }' 2>/dev/null || echo "{}")

    if echo "$DECISION_TEST_RESPONSE" | grep -q "decision"; then
        echo "✅ AI决策端点正常工作"
        DECISION_TYPE=$(echo "$DECISION_TEST_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('decision', {}).get('action', 'Unknown'))" 2>/dev/null || echo "Unknown")
        echo "   决策类型: $DECISION_TYPE"
    else
        echo "⚠️  AI决策端点返回异常响应"
    fi
else
    echo "⚠️  AI服务未运行或无法访问"
fi

echo ""
echo "=== 验证完成 ==="
echo "完成时间: $(date)"

# 生成验证报告
echo ""
echo "生成验证报告..."
cat > "api_key_validation_report_$(date +%Y%m%d_%H%M%S).txt" << EOF
AI服务API密钥验证报告
=====================
验证时间: $(date)

环境变量检查:
- DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:0:10}... (已设置)
- GLM_API_KEY: ${GLM_API_KEY:0:10}... (已设置)

API连接测试:
- DeepSeek API: $(if echo "$DEEPSEEK_TEST_RESPONSE" | grep -q "error"; then echo "失败"; else echo "成功"; fi)
- GLM API: $(if echo "$GLM_TEST_RESPONSE" | grep -q "error"; then echo "失败"; else echo "成功"; fi)

AI服务测试:
- AI服务运行状态: $(if curl -s "http://localhost:8000/api/v1/health/" > /dev/null 2>&1; then echo "正常"; else echo "异常"; fi)
- AI决策端点: $(if echo "$DECISION_TEST_RESPONSE" | grep -q "decision"; then echo "正常"; else echo "异常"; fi)

建议:
1. 确保API密钥具有足够的权限和额度
2. 检查网络连接是否正常
3. 验证AI服务配置是否正确

EOF

echo "✅ 验证报告已生成: api_key_validation_report_$(date +%Y%m%d_%H%M%S).txt"