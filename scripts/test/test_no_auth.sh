#!/bin/bash

echo "🚀 Stock-Race核心功能测试（不依赖认证）"
echo "======================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数器
total_tests=0
passed_tests=0
failed_tests=0

# 测试函数
test_endpoint() {
    local name="$1"
    local method="$2"
    local url="$3"
    local data="$4"
    local expected="${5:-200}"

    ((total_tests++))

    echo "📋 测试: $name"
    echo "URL: $url"

    local curl_cmd="curl -s -X '$method' '$url'"

    if [ -n "$data" ]; then
        curl_cmd="$curl_cmd -H 'Content-Type: application/json' -d '$data'"
    fi

    curl_cmd="$curl_cmd -w '|%{http_code}'"

    if response=$(eval "$curl_cmd" 2>/dev/null); then
        http_code=$(echo "$response" | awk -F'|' '{print $NF}')
        body=$(echo "$response" | awk -F'|' '{print $1}')

        if [ "$http_code" = "$expected" ]; then
            echo -e "${GREEN}✅ 通过 (状态码: $http_code)${NC}"
            ((passed_tests++))
            return 0
        else
            echo -e "${RED}❌ 失败 (状态码: $http_code, 期望: $expected)${NC}"
            if [ -n "$body" ] && [ "$body" != "null" ]; then
                echo "响应: $(echo "$body" | head -c 200)..."
            fi
            ((failed_tests++))
            return 1
        fi
    else
        echo -e "${RED}❌ 失败 - 命令执行错误${NC}"
        ((failed_tests++))
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

# 2. 公开API端点测试
echo ""
echo "2. 公开API端点测试"
echo "----------------"

# 测试API信息端点
test_endpoint "API信息" GET "http://localhost:3001/api-info"

# 测试公开的市场数据端点
test_endpoint "市场数据" GET "http://localhost:3001/api/market/data"

# 测试股票搜索（公开）
test_endpoint "股票搜索" GET "http://localhost:3001/api/stocks/search?q=平安"

# 测试排行榜（公开）
test_endpoint "排行榜" GET "http://localhost:3001/api/market/rankings"

# 3. AI服务测试
echo ""
echo "3. AI服务测试"
echo "------------"

# 测试AI服务健康
test_endpoint "AI服务健康" GET "http://localhost:8000/api/v1/health/"

# 测试AI服务文档
test_endpoint "AI服务文档" GET "http://localhost:8000/docs"

# 4. 数据服务测试
echo ""
echo "4. 数据服务测试"
echo "--------------"

# 测试数据服务健康
test_endpoint "数据服务健康" GET "http://localhost:8001/health"

# 测试数据服务文档
test_endpoint "数据服务文档" GET "http://localhost:8001/docs"

# 测试数据源状态
test_endpoint "数据源状态" GET "http://localhost:8001/api/v1/data-sources/status"

# 5. 前端界面测试
echo ""
echo "5. 前端界面测试"
echo "--------------"

echo "测试前端服务访问..."
frontend_status=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000")
if [ "$frontend_status" = "200" ]; then
    echo -e "${GREEN}✅ 前端服务可访问 (状态码: 200)${NC}"
    ((passed_tests++))
else
    echo -e "${RED}❌ 前端服务不可访问 (状态码: $frontend_status)${NC}"
    ((failed_tests++))
fi
((total_tests++))

# 6. 错误处理测试
echo ""
echo "6. 错误处理测试"
echo "--------------"

# 测试无效端点
test_endpoint "无效端点" GET "http://localhost:3001/api/invalid-endpoint" "" "" 404

# 测试无效方法
test_endpoint "无效方法" POST "http://localhost:3001/api/health" "" "" 404

# 总结
echo ""
echo "📊 测试结果总结"
echo "=============="
echo "总测试数: $total_tests"
echo -e "${GREEN}通过测试: $passed_tests${NC}"
echo -e "${RED}失败测试: $failed_tests${NC}"

if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}🎉 所有测试通过！系统核心功能正常${NC}"

    echo ""
    echo "📋 已验证的核心功能："
    echo "✅ 所有服务健康状态正常"
    echo "✅ 公开API端点可访问"
    echo "✅ AI服务运行正常"
    echo "✅ 数据服务运行正常"
    echo "✅ 前端界面可访问"
    echo "✅ 错误处理机制正常"

    echo ""
    echo "⚠️  已知问题："
    echo "1. 用户认证失败（数据库连接问题）"
    echo "2. TimescaleDB连接问题影响真实数据获取"
    echo "3. AI服务决策API需要认证"

    echo ""
    echo "🚀 系统可用性评估："
    echo "系统基础架构正常，服务间通信正常。"
    echo "由于数据库连接问题，用户认证和部分数据相关功能受限。"
    echo "系统可以降级运行，使用模拟数据展示核心功能。"

    exit 0
else
    echo -e "${YELLOW}⚠️  有 $failed_tests 个测试失败${NC}"

    echo ""
    echo "🔧 建议修复措施："
    echo "1. 检查数据库连接配置"
    echo "2. 验证PostgreSQL服务状态"
    echo "3. 检查API端点权限设置"

    exit 1
fi