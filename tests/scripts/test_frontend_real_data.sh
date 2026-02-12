#!/bin/bash

# 前端模拟数据改造功能验证脚本
# 验证所有服务层和组件是否使用真实API

echo "=================================================="
echo "前端模拟数据改造功能验证"
echo "测试时间: $(date)"
echo "=================================================="
echo

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试结果计数
passed=0
failed=0
warning=0

# 函数：打印测试结果
print_result() {
    local status=$1
    local message=$2

    case $status in
        "PASS")
            echo -e "${GREEN}✅ PASS${NC}: $message"
            ((passed++))
            ;;
        "FAIL")
            echo -e "${RED}❌ FAIL${NC}: $message"
            ((failed++))
            ;;
        "WARN")
            echo -e "${YELLOW}⚠️ WARN${NC}: $message"
            ((warning++))
            ;;
    esac
}

# 1. 检查服务状态
echo "1. 服务状态检查"
echo "----------------------------------------"

# 后端健康检查
if curl -s http://localhost:3001/api/health | jq -e '.success' > /dev/null 2>&1; then
    print_result "PASS" "后端服务运行正常 (http://localhost:3001)"
else
    print_result "FAIL" "后端服务不可用"
fi

# 数据服务健康检查
if curl -s http://localhost:8001/health | jq -e '.status == "connected" or .status == "healthy"' > /dev/null 2>&1; then
    data_service_status=$(curl -s http://localhost:8001/health | jq -r '.status')
    data_source=$(curl -s http://localhost:8001/health | jq -r '.data_source // "unknown"')
    print_result "PASS" "数据服务运行正常 (状态: $data_service_status, 数据源: $data_source)"
else
    print_result "WARN" "数据服务可能不可用或处于降级模式"
fi

# AI服务健康检查
if curl -s http://localhost:8000/api/v1/health/ | jq -e '.status == "healthy" or .status == "degraded"' > /dev/null 2>&1; then
    ai_service_status=$(curl -s http://localhost:8000/api/v1/health/ | jq -r '.status')
    print_result "PASS" "AI服务运行正常 (状态: $ai_service_status)"
else
    print_result "WARN" "AI服务可能不可用"
fi

echo

# 2. 认证测试
echo "2. 认证系统测试"
echo "----------------------------------------"

# 获取JWT令牌
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}')
TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.data.token // empty')

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    print_result "PASS" "成功获取JWT令牌 (长度: ${#TOKEN} 字符)"
else
    print_result "FAIL" "获取JWT令牌失败"
    TOKEN=""
fi

echo

# 3. API功能测试 (使用有效令牌)
echo "3. API功能测试"
echo "----------------------------------------"

if [ -n "$TOKEN" ]; then
    # 测试股票API
    stocks_result=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/stocks | jq -r '.success')
    if [ "$stocks_result" = "true" ]; then
        stocks_count=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/stocks | jq '.data.items | length')
        print_result "PASS" "股票API工作正常 (返回 $stocks_count 只股票)"
    else
        print_result "WARN" "股票API返回失败，可能使用降级数据"
    fi

    # 测试AI账户API
    ai_accounts_result=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/ai-accounts | jq -r '.success')
    if [ "$ai_accounts_result" = "true" ]; then
        ai_accounts_count=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/ai-accounts | jq '.data.accounts | length')
        print_result "PASS" "AI账户API工作正常 (返回 $ai_accounts_count 个AI账户)"
    else
        print_result "FAIL" "AI账户API返回失败"
    fi

    # 测试持仓API (正确的端点)
    portfolios_result=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/portfolios | jq -r '.success')
    if [ "$portfolios_result" = "true" ]; then
        portfolio_summary=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/portfolios | jq '.data.summary')
        total_value=$(echo "$portfolio_summary" | jq '.totalValue')
        print_result "PASS" "持仓API工作正常 (总资产: ¥$total_value)"
    else
        print_result "WARN" "持仓API返回失败，前端将使用降级数据"
    fi

    # 测试不存在的端点 (应该返回400而不是500)
    invalid_endpoint_result=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/trades/portfolio-summary | jq -r '.success // "false"')
    if [ "$invalid_endpoint_result" = "false" ]; then
        status_code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/trades/portfolio-summary)
        if [ "$status_code" = "400" ]; then
            print_result "PASS" "不存在的端点返回正确的400状态码 (而不是500错误)"
        else
            print_result "WARN" "不存在的端点返回状态码: $status_code"
        fi
    fi
else
    print_result "FAIL" "缺少有效令牌，跳过API测试"
fi

echo

# 4. 前端组件检查
echo "4. 前端组件检查"
echo "----------------------------------------"

# 检查关键服务文件
check_service_file() {
    local file=$1
    local description=$2

    if [ -f "$file" ]; then
        # 检查是否调用真实API (包含api.get或api.post调用)
        if grep -q "api\.\(get\|post\|put\|delete\)" "$file"; then
            print_result "PASS" "$description - 包含真实API调用"
        else
            print_result "WARN" "$description - 可能仍使用模拟数据"
        fi
    else
        print_result "FAIL" "$description - 文件不存在"
    fi
}

check_service_file "frontend/src/services/auth.service.ts" "认证服务"
check_service_file "frontend/src/services/market.service.ts" "市场数据服务"
check_service_file "frontend/src/services/trading.service.ts" "交易服务"
check_service_file "frontend/src/services/ai.service.ts" "AI服务"
# 缓存工具不需要检查API调用，它只是工具类
if [ -f "frontend/src/utils/cache.ts" ]; then
    print_result "PASS" "缓存工具文件存在"
else
    print_result "FAIL" "缓存工具文件不存在"
fi

echo

# 5. 缓存机制验证
echo "5. 缓存机制验证"
echo "----------------------------------------"

if [ -f "frontend/src/utils/cache.ts" ]; then
    # 检查缓存类是否包含关键方法
    if grep -q "class CacheManager" "frontend/src/utils/cache.ts" && \
       grep -q "getWithMarketTime" "frontend/src/utils/cache.ts"; then
        print_result "PASS" "缓存工具包含市场时间感知的缓存方法"
    else
        print_result "WARN" "缓存工具可能不完整"
    fi

    # 检查市场时间判断逻辑
    if grep -q "isTradingTime" "frontend/src/utils/cache.ts"; then
        print_result "PASS" "缓存工具包含A股交易时间判断逻辑"
    else
        print_result "WARN" "缓存工具缺少交易时间判断"
    fi
else
    print_result "FAIL" "缓存工具文件不存在"
fi

echo

# 6. 降级机制检查
echo "6. 降级机制检查"
echo "----------------------------------------"

# 检查服务文件是否包含降级逻辑
check_fallback_logic() {
    local file=$1
    local service=$2

    if [ -f "$file" ]; then
        if grep -q "catch.*error" "$file" && grep -q "降级\|fallback\|模拟\|mock" "$file"; then
            print_result "PASS" "$service - 包含降级处理逻辑"
        else
            print_result "WARN" "$service - 可能缺少降级处理"
        fi
    fi
}

check_fallback_logic "frontend/src/services/auth.service.ts" "认证服务"
check_fallback_logic "frontend/src/services/market.service.ts" "市场数据服务"
check_fallback_logic "frontend/src/services/trading.service.ts" "交易服务"
check_fallback_logic "frontend/src/services/ai.service.ts" "AI服务"

echo

# 7. 测试结果汇总
echo "=================================================="
echo "测试结果汇总"
echo "=================================================="
echo -e "总测试项: $((passed + failed + warning))"
echo -e "${GREEN}通过: $passed${NC}"
echo -e "${RED}失败: $failed${NC}"
echo -e "${YELLOW}警告: $warning${NC}"
echo

# 总体评估
if [ $failed -eq 0 ] && [ $warning -eq 0 ]; then
    echo -e "${GREEN}🎉 所有测试通过！前端模拟数据改造成功完成。${NC}"
    exit 0
elif [ $failed -eq 0 ] && [ $warning -gt 0 ]; then
    echo -e "${YELLOW}⚠️  基本功能正常，但存在一些警告需要关注。${NC}"
    exit 0
else
    echo -e "${RED}❌ 存在失败项，需要修复问题。${NC}"
    exit 1
fi