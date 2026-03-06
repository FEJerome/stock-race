#!/bin/bash

# Stock-Race端到端功能测试脚本
# 测试不依赖真实股票数据的功能

set -e

echo "🚀 Stock-Race端到端功能测试"
echo "==========================="
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
run_test() {
    local test_name="$1"
    local command="$2"
    local expected_status="${3:-200}"

    ((total_tests++))

    echo "📋 测试: $test_name"
    echo "命令: $command"

    if response=$(eval "$command" 2>/dev/null); then
        status_code=$(echo "$response" | grep -oP '(?<=HTTP\/[0-9]+\.[0-9]+ )[0-9]+' | tail -1 || echo "0")

        if [ "$status_code" = "$expected_status" ]; then
            echo -e "${GREEN}✅ 通过${NC}"
            ((passed_tests++))
            return 0
        else
            echo -e "${RED}❌ 失败 - 状态码: $status_code (期望: $expected_status)${NC}"
            echo "响应: $response"
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

run_test "后端服务健康检查" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/health"
run_test "AI服务健康检查" "curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/api/v1/health/"
run_test "数据服务健康检查" "curl -s -o /dev/null -w '%{http_code}' http://localhost:8001/health"
run_test "前端服务访问" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000"

# 2. 用户认证流程测试
echo ""
echo "2. 用户认证流程测试"
echo "------------------"

# 测试用户注册
run_test "用户注册API" "curl -s -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{\"username\":\"testuser\",\"password\":\"testpass123\",\"email\":\"test@example.com\"}' \
  -o /dev/null -w '%{http_code}'"

# 测试用户登录
run_test "用户登录API" "curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{\"username\":\"testuser\",\"password\":\"testpass123\"}' \
  -o /dev/null -w '%{http_code}'"

# 获取token用于后续测试
echo "获取认证token..."
login_response=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{\"username\":\"testuser\",\"password\":\"testpass123\"}')

token=$(echo "$login_response" | grep -oP '"token":"\K[^"]+' || echo "")
if [ -n "$token" ]; then
    echo -e "${GREEN}✅ 成功获取token${NC}"
else
    echo -e "${YELLOW}⚠️  无法获取token，使用模拟token${NC}"
    token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoidGVzdHVzZXIiLCJpYXQiOjE3MzgwMjQwMDB9.test-token"
fi

# 3. AI服务功能测试
echo ""
echo "3. AI服务功能测试"
echo "----------------"

run_test "AI模型状态查询" "curl -s -X GET http://localhost:8000/api/v1/models/status \
  -o /dev/null -w '%{http_code}'"

# 测试AI决策生成（使用模拟数据）
run_test "AI决策生成API" "curl -s -X POST http://localhost:8000/api/v1/decision/generate \
  -H 'Content-Type: application/json' \
  -d '{\"symbol\":\"000001.SZ\",\"current_price\":10.5,\"portfolio_value\":10000,\"available_cash\":5000}' \
  -o /dev/null -w '%{http_code}'"

# 4. 交易功能测试
echo ""
echo "4. 交易功能测试"
echo "--------------"

# 测试创建AI账户
run_test "创建AI账户" "curl -s -X POST http://localhost:3001/api/ai-accounts \
  -H 'Content-Type: application/json' \
  -H \"Authorization: Bearer $token\" \
  -d '{\"name\":\"测试AI账户\",\"initial_balance\":10000,\"ai_model\":\"claude\"}' \
  -o /dev/null -w '%{http_code}'"

# 测试获取持仓信息
run_test "获取持仓列表" "curl -s -X GET http://localhost:3001/api/portfolio/holdings \
  -H \"Authorization: Bearer $token\" \
  -o /dev/null -w '%{http_code}'"

# 测试模拟交易API
run_test "模拟买入交易" "curl -s -X POST http://localhost:3001/api/trading/buy \
  -H 'Content-Type: application/json' \
  -H \"Authorization: Bearer $token\" \
  -d '{\"symbol\":\"000001.SZ\",\"quantity\":100,\"price\":10.5,\"account_id\":1}' \
  -o /dev/null -w '%{http_code}'"

run_test "模拟卖出交易" "curl -s -X POST http://localhost:3001/api/trading/sell \
  -H 'Content-Type: application/json' \
  -H \"Authorization: Bearer $token\" \
  -d '{\"symbol\":\"000001.SZ\",\"quantity\":50,\"price\":11.0,\"account_id\":1}' \
  -o /dev/null -w '%{http_code}'"

# 5. API集成测试
echo ""
echo "5. API集成测试"
echo "-------------"

run_test "获取股票列表" "curl -s -X GET http://localhost:3001/api/stocks \
  -H \"Authorization: Bearer $token\" \
  -o /dev/null -w '%{http_code}'"

run_test "获取交易历史" "curl -s -X GET http://localhost:3001/api/trading/history \
  -H \"Authorization: Bearer $token\" \
  -o /dev/null -w '%{http_code}'"

run_test "获取账户列表" "curl -s -X GET http://localhost:3001/api/ai-accounts \
  -H \"Authorization: Bearer $token\" \
  -o /dev/null -w '%{http_code}'"

# 6. 错误处理测试
echo ""
echo "6. 错误处理测试"
echo "-------------"

run_test "无效token访问" "curl -s -X GET http://localhost:3001/api/portfolio/holdings \
  -H 'Authorization: Bearer invalid-token' \
  -o /dev/null -w '%{http_code}'" "401"

run_test "无效端点访问" "curl -s -X GET http://localhost:3001/api/invalid-endpoint \
  -o /dev/null -w '%{http_code}'" "404"

# 总结
echo ""
echo "📊 测试结果总结"
echo "=============="
echo "总测试数: $total_tests"
echo -e "${GREEN}通过测试: $passed_tests${NC}"
echo -e "${RED}失败测试: $failed_tests${NC}"

if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}🎉 所有测试通过！${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  有 $failed_tests 个测试失败${NC}"
    exit 1
fi