#!/bin/bash

echo "🚀 Stock-Race简化功能测试"
echo "========================"
echo ""

# 测试计数器
passed=0
failed=0

test_endpoint() {
    local name="$1"
    local method="$2"
    local url="$3"
    local data="$4"
    local expected="${5:-200}"

    echo "📋 测试: $name"
    echo "URL: $url"

    if [ -n "$data" ]; then
        response=$(curl -s -X "$method" "$url" -H "Content-Type: application/json" -d "$data" -w "|%{http_code}")
    else
        response=$(curl -s -X "$method" "$url" -w "|%{http_code}")
    fi

    http_code=$(echo "$response" | awk -F'|' '{print $NF}')
    body=$(echo "$response" | awk -F'|' '{print $1}')

    if [ "$http_code" = "$expected" ]; then
        echo "✅ 通过 (状态码: $http_code)"
        ((passed++))
        return 0
    else
        echo "❌ 失败 (状态码: $http_code, 期望: $expected)"
        echo "响应: $body"
        ((failed++))
        return 1
    fi
    echo ""
}

# 1. 基础服务健康检查
echo "1. 基础服务健康检查"
echo "------------------"
test_endpoint "后端服务" GET "http://localhost:3001/api/health"
test_endpoint "AI服务" GET "http://localhost:8000/api/v1/health/"
test_endpoint "数据服务" GET "http://localhost:8001/health"
test_endpoint "前端服务" GET "http://localhost:3000"

# 2. 用户认证测试
echo ""
echo "2. 用户认证测试"
echo "--------------"

# 先测试登录（使用默认用户）
echo "测试用户登录..."
login_response=$(curl -s -X POST "http://localhost:3001/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"${ADMIN_PASSWORD:-<your-admin-password>}\"}")

echo "登录响应: $login_response"

# 提取token
token=$(echo "$login_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$token" ]; then
    echo "✅ 成功获取token: ${token:0:20}..."

    # 测试受保护端点
    test_endpoint "受保护端点测试" GET "http://localhost:3001/api/portfolio/holdings" "" "" 200
else
    echo "❌ 无法获取token，检查登录响应"
    echo "响应体: $login_response"
fi

# 3. AI服务测试
echo ""
echo "3. AI服务测试"
echo "------------"
test_endpoint "AI模型状态" GET "http://localhost:8000/api/v1/models/status"

# 测试AI决策（使用模拟数据）
test_endpoint "AI决策生成" POST "http://localhost:8000/api/v1/decision/generate" \
  '{"symbol":"000001.SZ","current_price":10.5,"portfolio_value":10000,"available_cash":5000}'

# 4. 交易功能测试
echo ""
echo "4. 交易功能测试"
echo "--------------"

if [ -n "$token" ]; then
    # 测试获取账户列表
    test_endpoint "获取AI账户列表" GET "http://localhost:3001/api/ai-accounts"

    # 测试获取持仓
    test_endpoint "获取持仓信息" GET "http://localhost:3001/api/portfolio/holdings"

    # 测试获取交易历史
    test_endpoint "获取交易历史" GET "http://localhost:3001/api/trading/history"
else
    echo "⚠️  跳过交易功能测试（无有效token）"
fi

# 5. 数据服务测试（不依赖TimescaleDB）
echo ""
echo "5. 数据服务测试"
echo "--------------"
test_endpoint "数据服务状态" GET "http://localhost:8001/status"
test_endpoint "数据源列表" GET "http://localhost:8001/api/v1/data-sources"

# 6. 错误处理测试
echo ""
echo "6. 错误处理测试"
echo "--------------"
test_endpoint "无效端点" GET "http://localhost:3001/api/invalid-endpoint" "" "" 404
test_endpoint "无效token" GET "http://localhost:3001/api/portfolio/holdings" "" "" 401

# 总结
echo ""
echo "📊 测试结果总结"
echo "=============="
echo "总测试数: $((passed + failed))"
echo "✅ 通过: $passed"
echo "❌ 失败: $failed"

if [ $failed -eq 0 ]; then
    echo "🎉 所有测试通过！"
    exit 0
else
    echo "⚠️  有 $failed 个测试失败"
    exit 1
fi