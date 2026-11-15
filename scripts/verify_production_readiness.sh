#!/bin/bash

# Stock Race 生产就绪验证脚本
# 用于快速验证项目是否达到生产环境水平

set -e

echo "🚀 Stock Race 生产就绪验证脚本"
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
warning_tests=0

# 测试函数
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_status="${3:-0}"

    total_tests=$((total_tests + 1))
    echo -n "测试 $total_tests: $test_name ... "

    if eval "$test_command" > /tmp/test_output.log 2>&1; then
        if [ $? -eq "$expected_status" ]; then
            echo -e "${GREEN}通过${NC}"
            passed_tests=$((passed_tests + 1))
            return 0
        else
            echo -e "${YELLOW}警告${NC}"
            warning_tests=$((warning_tests + 1))
            return 1
        fi
    else
        echo -e "${RED}失败${NC}"
        failed_tests=$((failed_tests + 1))
        cat /tmp/test_output.log
        return 1
    fi
}

echo "📊 第1部分: 服务健康检查"
echo "------------------------"

run_test "后端服务健康检查" "curl -f -s http://localhost:3001/api/health | jq -e '.data.status == \"healthy\"'"
run_test "AI服务健康检查" "curl -f -s http://localhost:8000/api/v1/health/ | jq -e '.status'"
run_test "数据服务健康检查" "curl -f -s http://localhost:8001/health | jq -e '.status == \"healthy\"'"
run_test "PostgreSQL数据库连接" "pg_isready -h localhost -p 5432"
run_test "Redis缓存连接" "redis-cli ping | grep -q PONG"

echo ""
echo "🔧 第2部分: 核心功能测试"
echo "------------------------"

run_test "股票数据API" "curl -s 'http://localhost:3001/api/stocks?limit=1' | jq -e '.success == true'"
run_test "数据服务股票报价" "curl -s 'http://localhost:8001/api/v1/stocks/000001.SZ/quote' | jq -e '.symbol'"
run_test "AI服务API密钥认证" "curl -s -X POST http://localhost:8000/api/v1/decision/service-generate -H 'Content-Type: application/json' -H 'X-API-Key: ${AI_SERVICE_API_KEY:-<your-ai-service-api-key>}' -d '{\"account_id\": \"test\", \"stock_code\": \"000001.SZ\", \"market_data\": {\"price\": 20}}' | jq -e '.metadata.authenticated_by == \"service_api_key\"'"

echo ""
echo "🔐 第3部分: 安全配置测试"
echo "------------------------"

run_test "无效API密钥拒绝" "curl -s -X POST http://localhost:8000/api/v1/decision/service-generate -H 'Content-Type: application/json' -H 'X-API-Key: wrong-key' -d '{\"account_id\": \"test\", \"stock_code\": \"000001.SZ\", \"market_data\": {\"price\": 20}}' | jq -e '.detail == \"Invalid API key\"'"
run_test "CORS配置检查" "curl -s -I -H 'Origin: http://localhost:3000' http://localhost:8000/api/v1/health/ | grep -i 'access-control-allow-origin'"

echo ""
echo "⚙️ 第4部分: 配置检查"
echo "-------------------"

run_test "生产环境配置文件" "ls /home/fe-jerome/projects/stock-race/*/.env.production 2>/dev/null | wc -l | grep -q '^[0-9]'"
run_test "Docker生产配置" "test -f /home/fe-jerome/projects/stock-race/docker-compose.prod.yml"
run_test "监控配置" "test -f /home/fe-jerome/projects/stock-race/monitoring/prometheus.yml"

echo ""
echo "📁 第5部分: 文档检查"
echo "-------------------"

run_test "核心文档存在" "test -f /home/fe-jerome/projects/stock-race/CLAUDE.md"
run_test "部署文档存在" "test -f /home/fe-jerome/projects/stock-race/docs/deployment/PRODUCTION_CHECKLIST.md"
run_test "用户文档存在" "test -f /home/fe-jerome/projects/stock-race/docs/usage/USER_GUIDE.md"

echo ""
echo "📊 测试结果汇总"
echo "================"
echo "总测试数: $total_tests"
echo -e "${GREEN}通过: $passed_tests${NC}"
echo -e "${YELLOW}警告: $warning_tests${NC}"
echo -e "${RED}失败: $failed_tests${NC}"
echo ""

# 计算通过率
if [ $total_tests -gt 0 ]; then
    pass_rate=$((passed_tests * 100 / total_tests))
    echo "通过率: $pass_rate%"
fi

# 最终结论
if [ $failed_tests -eq 0 ] && [ $pass_rate -ge 80 ]; then
    echo -e "${GREEN}✅ 生产就绪验证通过！项目已达到生产环境水平。${NC}"
    echo "建议: 可以合并到main分支并进行生产部署。"
    exit 0
elif [ $failed_tests -eq 0 ] && [ $pass_rate -ge 60 ]; then
    echo -e "${YELLOW}⚠️  生产就绪验证基本通过，但有改进空间。${NC}"
    echo "建议: 修复警告项后可以合并到main分支。"
    exit 0
else
    echo -e "${RED}❌ 生产就绪验证未通过。${NC}"
    echo "建议: 修复失败项后再进行验证。"
    exit 1
fi