#!/bin/bash

# 端到端测试脚本 - 市场数据模块和持仓模块API测试
# 测试环境：后端API: http://localhost:3001/api
# 数据服务: http://localhost:8001

set -e

BASE_URL="http://localhost:3001/api"
TOKEN_FILE="/tmp/token.txt"
RESULTS_FILE="/tmp/api_test_results.json"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 初始化结果文件
echo "{" > $RESULTS_FILE
echo "  \"testTime\": \"$(date -Iseconds)\"," >> $RESULTS_FILE
echo "  \"baseUrl\": \"$BASE_URL\"," >> $RESULTS_FILE
echo "  \"results\": [" >> $RESULTS_FILE

FIRST_RESULT=true

# 测试计数器
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 获取Token
get_token() {
    if [ -f "$TOKEN_FILE" ]; then
        cat $TOKEN_FILE
    else
        echo ""
    fi
}

TOKEN=$(get_token)

# 记录测试结果的函数
record_result() {
    local api_endpoint=$1
    local method=$2
    local status_code=$3
    local response_time=$4
    local success=$5
    local error_msg=$6
    local request_example=$7
    local response_example=$8

    if [ "$FIRST_RESULT" = true ]; then
        FIRST_RESULT=false
    else
        echo "," >> $RESULTS_FILE
    fi

    cat >> $RESULTS_FILE << EOF
    {
      "apiEndpoint": "$api_endpoint",
      "method": "$method",
      "statusCode": $status_code,
      "responseTimeMs": $response_time,
      "success": $success,
      "errorMessage": "$error_msg",
      "requestExample": $(echo "$request_example" | jq -R .),
      "responseExample": $(echo "$response_example" | jq -R .)
    }
EOF
}

# 测试API的通用函数
test_api() {
    local description=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local requires_auth=$5

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    local url="${BASE_URL}${endpoint}"
    local headers="-H 'Content-Type: application/json'"
    local auth_header=""

    if [ "$requires_auth" = "true" ] && [ -n "$TOKEN" ]; then
        auth_header="-H 'Authorization: Bearer $TOKEN'"
    fi

    echo -e "\n${YELLOW}Testing: $description${NC}"
    echo "  Method: $method"
    echo "  Endpoint: $endpoint"

    local start_time=$(date +%s%N)
    local response
    local http_code
    local curl_cmd

    if [ "$method" = "GET" ]; then
        curl_cmd="curl -s -w '\n%{http_code}' $auth_header '$url'"
    elif [ "$method" = "DELETE" ]; then
        curl_cmd="curl -s -w '\n%{http_code}' -X DELETE $auth_header '$url'"
    else
        curl_cmd="curl -s -w '\n%{http_code}' -X $method $headers $auth_header -d '$data' '$url'"
    fi

    response=$(eval $curl_cmd 2>&1) || true
    local end_time=$(date +%s%N)
    local response_time=$(( (end_time - start_time) / 1000000 ))

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    # 截断响应体用于显示
    local display_body=$(echo "$body" | head -c 500)
    if [ ${#body} -gt 500 ]; then
        display_body="${display_body}..."
    fi

    local success=false
    local error_msg=""

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        success=true
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo -e "  Status: ${GREEN}$http_code${NC}"
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        error_msg=$(echo "$body" | grep -o '"message":"[^"]*"' | cut -d'"' -f4 || echo "Unknown error")
        echo -e "  Status: ${RED}$http_code${NC}"
        echo -e "  Error: ${RED}$error_msg${NC}"
    fi

    echo "  Response Time: ${response_time}ms"
    echo "  Response: $display_body"

    record_result "$endpoint" "$method" "$http_code" "$response_time" "$success" "$error_msg" "$data" "$body"
}

echo "=========================================="
echo "  端到端API测试 - 市场数据与持仓模块"
echo "=========================================="
echo ""
echo "测试开始时间: $(date)"
echo ""

# ============ 市场数据API测试 ============
echo -e "\n${YELLOW}========== 市场数据API测试 ==========${NC}"

# 1. 获取市场指数
test_api "获取市场指数" "GET" "/market/indices" "" "true"

# 2. 获取市场状态
test_api "获取市场状态" "GET" "/market/status" "" "false"

# 3. 获取市场数据
test_api "获取市场数据" "GET" "/market/data" "" "true"

# 4. 获取市场趋势
test_api "获取市场趋势" "GET" "/market/trends" "" "true"

# 5. 获取交易大厅数据
test_api "获取交易大厅数据" "GET" "/market/trading-hall" "" "true"

# 6. 获取排行榜
test_api "获取排行榜" "GET" "/market/rankings" "" "true"

# 7. 获取竞赛列表
test_api "获取竞赛列表" "GET" "/market/competitions" "" "true"

# ============ 股票API测试 ============
echo -e "\n${YELLOW}========== 股票API测试 ==========${NC}"

# 8. 获取股票列表
test_api "获取股票列表" "GET" "/stocks?page=1&limit=10" "" "true"

# 9. 搜索股票
test_api "搜索股票(q=茅台)" "GET" "/stocks/search?q=茅台" "" "true"

# 10. 获取单个股票详情
test_api "获取股票详情(600519)" "GET" "/stocks/600519" "" "true"

# 11. 获取股票实时行情
test_api "获取股票实时行情(600519)" "GET" "/stocks/600519/realtime" "" "true"

# 12. 获取股票K线数据
test_api "获取股票K线(600519)" "GET" "/stocks/600519/kline?interval=1d&limit=30" "" "true"

# 13. 获取市场统计
test_api "获取市场统计" "GET" "/stocks/market/stats" "" "true"

# 14. 获取股票排行榜
test_api "获取股票排行榜" "GET" "/stocks/rankings?limit=10" "" "true"

# 15. 批量获取股票实时数据
test_api "批量获取股票实时数据" "POST" "/stocks/realtime/batch" '{"stockCodes":["600519","000001","000002"]}' "true"

# ============ 持仓API测试 ============
echo -e "\n${YELLOW}========== 持仓API测试 ==========${NC}"

# 16. 获取持仓列表
test_api "获取持仓列表" "GET" "/portfolios" "" "true"

# 17. 获取持仓统计
test_api "获取持仓统计" "GET" "/portfolios/stats" "" "true"

# 18. 获取持仓风险分析
test_api "获取持仓风险分析" "GET" "/portfolios/risk-analysis" "" "true"

# 19. 获取持仓历史
test_api "获取持仓历史" "GET" "/portfolios/history?limit=10" "" "true"

# 20. 更新持仓市值
test_api "更新持仓市值" "POST" "/portfolios/update-market-values" '{}' "true"

# 完成结果文件
echo "" >> $RESULTS_FILE
echo "  ]," >> $RESULTS_FILE
echo "  \"summary\": {" >> $RESULTS_FILE
echo "    \"totalTests\": $TOTAL_TESTS," >> $RESULTS_FILE
echo "    \"passed\": $PASSED_TESTS," >> $RESULTS_FILE
echo "    \"failed\": $FAILED_TESTS," >> $RESULTS_FILE
echo "    \"passRate\": $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l || echo "0")" >> $RESULTS_FILE
echo "  }" >> $RESULTS_FILE
echo "}" >> $RESULTS_FILE

# 输出测试摘要
echo ""
echo "=========================================="
echo "           测试摘要"
echo "=========================================="
echo "总测试数: $TOTAL_TESTS"
echo -e "通过: ${GREEN}$PASSED_TESTS${NC}"
echo -e "失败: ${RED}$FAILED_TESTS${NC}"
if [ $TOTAL_TESTS -gt 0 ]; then
    PASS_RATE=$(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l)
    echo "通过率: ${PASS_RATE}%"
fi
echo ""
echo "详细结果已保存到: $RESULTS_FILE"
echo "测试完成时间: $(date)"
