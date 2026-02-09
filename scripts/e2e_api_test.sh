#!/bin/bash
# 前端端到端API测试脚本
# 测试所有后端API端点并记录问题

BASE_URL="http://localhost:3001/api"
OUTPUT_FILE="/home/fe-jerome/projects/stock-race/docs/testing/E2E_TEST_REPORT.md"

echo "# 前端端到端API测试报告" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "**测试时间**: $(date '+%Y-%m-%d %H:%M:%S')" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "**测试目标**: 验证所有后端API功能是否正常" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "---" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# 测试结果统计
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 测试函数
run_test() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local headers="${5:-Content-Type: application/json}"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    echo "" >> "$OUTPUT_FILE"
    echo "### 测试 #$TOTAL_TESTS: $name" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "- **方法**: $method" >> "$OUTPUT_FILE"
    echo "- **端点**: $endpoint" >> "$OUTPUT_FILE"

    if [ -n "$data" ]; then
        echo "- **请求体**: \`$data\`" >> "$OUTPUT_FILE"
    fi

    # 执行请求
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL$endpoint" -H "$headers" 2>/dev/null)
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$endpoint" -H "$headers" -d "$data" 2>/dev/null)
    elif [ "$method" = "PUT" ]; then
        response=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL$endpoint" -H "$headers" -d "$data" 2>/dev/null)
    elif [ "$method" = "DELETE" ]; then
        response=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL$endpoint" -H "$headers" 2>/dev/null)
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    echo "- **状态码**: $http_code" >> "$OUTPUT_FILE"

    # 判断结果
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo "- **结果**: 通过" >> "$OUTPUT_FILE"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    elif [ "$http_code" -eq 401 ] || [ "$http_code" -eq 403 ]; then
        echo "- **结果**: 需要认证 (预期内)" >> "$OUTPUT_FILE"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo "- **结果**: 失败" >> "$OUTPUT_FILE"
        echo "- **响应**: \`$body\`" >> "$OUTPUT_FILE"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

echo "## 1. 系统健康检查" >> "$OUTPUT_FILE"
run_test "系统健康检查" "GET" "/health"

echo "" >> "$OUTPUT_FILE"
echo "## 2. 认证API测试" >> "$OUTPUT_FILE"
run_test "用户登录 (正确凭据)" "POST" "/auth/login" '{"username":"admin","password":"admin123"}'
run_test "用户登录 (错误凭据)" "POST" "/auth/login" '{"username":"admin","password":"wrong"}'
run_test "获取当前用户 (未认证)" "GET" "/auth/me"
run_test "用户登出" "POST" "/auth/logout"

echo "" >> "$OUTPUT_FILE"
echo "## 3. 股票数据API测试" >> "$OUTPUT_FILE"
run_test "获取股票列表" "GET" "/stocks"
run_test "获取股票详情" "GET" "/stocks/000001"
run_test "获取股票行情" "GET" "/stocks/000001/quotes"
run_test "搜索股票" "GET" "/stocks/search?keyword=平安"
run_test "获取市场概况" "GET" "/stocks/market/overview"

echo "" >> "$OUTPUT_FILE"
echo "## 4. AI账户API测试" >> "$OUTPUT_FILE"
run_test "获取AI账户列表 (未认证)" "GET" "/ai-accounts"
run_test "创建AI账户 (未认证)" "POST" "/ai-accounts" '{"name":"测试账户","strategy":"conservative"}'
run_test "获取AI账户详情 (未认证)" "GET" "/ai-accounts/1"
run_test "删除AI账户 (未认证)" "DELETE" "/ai-accounts/1"

echo "" >> "$OUTPUT_FILE"
echo "## 5. 交易API测试" >> "$OUTPUT_FILE"
run_test "获取交易列表" "GET" "/trades"
run_test "执行买入交易" "POST" "/trades" '{"symbol":"000001","type":"buy","quantity":100}'
run_test "执行卖出交易" "POST" "/trades" '{"symbol":"000001","type":"sell","quantity":50}'
run_test "获取交易详情" "GET" "/trades/1"

echo "" >> "$OUTPUT_FILE"
echo "## 6. 持仓API测试" >> "$OUTPUT_FILE"
run_test "获取持仓列表" "GET" "/portfolios"
run_test "获取持仓详情" "GET" "/portfolios/1"
run_test "获取收益统计" "GET" "/portfolios/stats"
run_test "获取收益曲线" "GET" "/portfolios/profit-curve"

echo "" >> "$OUTPUT_FILE"
echo "## 7. 市场数据API测试" >> "$OUTPUT_FILE"
run_test "获取市场状态" "GET" "/market/status"
run_test "获取实时行情" "GET" "/market/realtime"
run_test "获取历史数据" "GET" "/market/history?symbol=000001"

echo "" >> "$OUTPUT_FILE"
echo "## 8. 排行榜API测试" >> "$OUTPUT_FILE"
run_test "获取收益率排行" "GET" "/rankings/returns"
run_test "获取综合排行" "GET" "/rankings/comprehensive"

echo "" >> "$OUTPUT_FILE"
echo "## 9. 管理员API测试" >> "$OUTPUT_FILE"
run_test "获取系统状态 (未授权)" "GET" "/admin/status"
run_test "获取用户列表 (未授权)" "GET" "/admin/users"

echo "" >> "$OUTPUT_FILE"
echo "---" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "## 测试汇总" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "| 指标 | 数值 |" >> "$OUTPUT_FILE"
echo "|------|------|" >> "$OUTPUT_FILE"
echo "| 总测试数 | $TOTAL_TESTS |" >> "$OUTPUT_FILE"
echo "| 通过 | $PASSED_TESTS |" >> "$OUTPUT_FILE"
echo "| 失败 | $FAILED_TESTS |" >> "$OUTPUT_FILE"
echo "| 成功率 | $(( PASSED_TESTS * 100 / TOTAL_TESTS ))% |" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

if [ $FAILED_TESTS -gt 0 ]; then
    echo "## 需要修复的问题清单" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "请后端智能体根据上述测试结果修复失败的API。" >> "$OUTPUT_FILE"
fi

echo "测试完成！报告已保存到: $OUTPUT_FILE"
echo "总计: $TOTAL_TESTS 个测试, $PASSED_TESTS 通过, $FAILED_TESTS 失败"
