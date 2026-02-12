#!/bin/bash

# 管理员API测试脚本

set -e

echo "=== 管理员API测试脚本 ==="
echo "开始时间: $(date)"
echo ""

# 配置文件
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"
BASE_URL="http://localhost:3001/api"

# 管理员登录获取令牌
echo "1. 管理员登录获取令牌..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$ADMIN_USERNAME\",
    \"password\": \"$ADMIN_PASSWORD\"
  }" 2>/dev/null || echo "{}")

if echo "$LOGIN_RESPONSE" | grep -q "success.*true"; then
    JWT_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('data', {}).get('token', ''))
except:
    print('')
" 2>/dev/null || echo "")

    if [ -n "$JWT_TOKEN" ]; then
        echo "✅ 管理员登录成功"
        echo "   JWT令牌: ${JWT_TOKEN:0:30}..."
    else
        echo "❌ 无法获取JWT令牌"
        exit 1
    fi
else
    echo "❌ 管理员登录失败"
    echo "   响应: $LOGIN_RESPONSE"
    exit 1
fi

# 测试管理员系统指标API
echo ""
echo "2. 测试管理员系统指标API..."
SYSTEM_METRICS_RESPONSE=$(curl -s "$BASE_URL/admin/metrics/system" \
  -H "Authorization: Bearer $JWT_TOKEN" 2>/dev/null || echo "{}")

echo "系统指标响应: $SYSTEM_METRICS_RESPONSE"

if echo "$SYSTEM_METRICS_RESPONSE" | grep -q "success.*true"; then
    echo "✅ 管理员系统指标API测试成功"
else
    ERROR_MSG=$(echo "$SYSTEM_METRICS_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('message', 'Unknown error'))
except:
    print('Unknown error')
" 2>/dev/null || echo "Unknown error")

    if echo "$ERROR_MSG" | grep -qi "需要管理员权限"; then
        echo "⚠️  权限不足，需要管理员权限"
    else
        echo "❌ 管理员系统指标API测试失败: $ERROR_MSG"
    fi
fi

# 测试管理员用户统计API
echo ""
echo "3. 测试管理员用户统计API..."
USER_STATS_RESPONSE=$(curl -s "$BASE_URL/admin/stats/users" \
  -H "Authorization: Bearer $JWT_TOKEN" 2>/dev/null || echo "{}")

echo "用户统计响应: $USER_STATS_RESPONSE"

if echo "$USER_STATS_RESPONSE" | grep -q "success.*true"; then
    echo "✅ 管理员用户统计API测试成功"
else
    echo "⚠️  管理员用户统计API测试失败或权限不足"
fi

# 测试管理员服务健康检查API
echo ""
echo "4. 测试管理员服务健康检查API..."
SERVICE_HEALTH_RESPONSE=$(curl -s "$BASE_URL/admin/health/services" \
  -H "Authorization: Bearer $JWT_TOKEN" 2>/dev/null || echo "{}")

echo "服务健康检查响应: $SERVICE_HEALTH_RESPONSE"

if echo "$SERVICE_HEALTH_RESPONSE" | grep -q "success.*true"; then
    echo "✅ 管理员服务健康检查API测试成功"
else
    echo "⚠️  管理员服务健康检查API测试失败或权限不足"
fi

echo ""
echo "=== 管理员API测试完成 ==="
echo "完成时间: $(date)"
echo ""
echo "测试总结:"
echo "1. 管理员登录: $(if [ -n "$JWT_TOKEN" ]; then echo "✅ 成功"; else echo "❌ 失败"; fi)"
echo "2. 系统指标API: $(if echo "$SYSTEM_METRICS_RESPONSE" | grep -q "success.*true"; then echo "✅ 成功"; else echo "⚠️  失败或权限不足"; fi)"
echo "3. 用户统计API: $(if echo "$USER_STATS_RESPONSE" | grep -q "success.*true"; then echo "✅ 成功"; else echo "⚠️  失败或权限不足"; fi)"
echo "4. 服务健康API: $(if echo "$SERVICE_HEALTH_RESPONSE" | grep -q "success.*true"; then echo "✅ 成功"; else echo "⚠️  失败或权限不足"; fi)"