#!/bin/bash
# 验证脚本 - 确保联调环境使用真实数据
# 检查是否有模拟/mock/fallback数据被使用

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "========================================"
echo "  联调环境数据真实性验证"
echo "========================================"
echo ""

PASS=0
FAIL=0

# 检查函数
check_service() {
    local name=$1
    local url=$2
    local check_field=$3

    echo -n "检查 $name ... "
    if response=$(curl -s "$url" 2>/dev/null); then
        if echo "$response" | grep -q "$check_field"; then
            echo -e "${GREEN}✓ 正常${NC}"
            ((PASS++))
            return 0
        else
            echo -e "${YELLOW}! 响应异常${NC}"
            ((FAIL++))
            return 1
        fi
    else
        echo -e "${RED}✗ 无法连接${NC}"
        ((FAIL++))
        return 1
    fi
}

# 检查日志中是否有模拟数据关键词
check_logs_for_mock() {
    echo ""
    echo "检查日志中是否出现模拟/降级数据..."

    local found=false

    # 检查Backend日志
    if [ -f "backend/backend.log" ]; then
        if grep -iE "(模拟数据|mock|fallback|simulated|降级)" backend/backend.log > /dev/null 2>&1; then
            echo -e "  ${RED}✗ Backend日志中发现模拟数据关键词${NC}"
            grep -iE "(模拟数据|mock|fallback|simulated|降级)" backend/backend.log | tail -3
            found=true
        else
            echo -e "  ${GREEN}✓ Backend日志正常${NC}"
        fi
    fi

    # 检查Market Data日志
    if [ -f "market-data-service/market-data.log" ]; then
        if grep -iE "(in-memory|simulated|fallback|内存模式)" market-data-service/market-data.log > /dev/null 2>&1; then
            echo -e "  ${RED}✗ Market Data日志中发现模拟数据关键词${NC}"
            grep -iE "(in-memory|simulated|fallback|内存模式)" market-data-service/market-data.log | tail -3
            found=true
        else
            echo -e "  ${GREEN}✓ Market Data日志正常${NC}"
        fi
    fi

    if [ "$found" = true ]; then
        echo ""
        echo -e "${RED}警告: 检测到模拟/降级数据使用！${NC}"
        echo "请检查:"
        echo "  1. 环境变量 STRICT_MODE=true 是否设置"
        echo "  2. 服务是否已重启"
        echo "  3. 数据库连接是否正常"
        return 1
    fi
}

# 验证股票数据真实性
verify_stock_data() {
    echo ""
    echo "验证股票数据真实性..."

    # 获取平安银行数据
    response=$(curl -s http://localhost:8001/api/v1/stocks/000001.SZ/quote 2>/dev/null || echo "")

    if [ -z "$response" ]; then
        echo -e "  ${RED}✗ 无法获取股票数据${NC}"
        ((FAIL++))
        return 1
    fi

    # 检查是否有数据源字段
    if echo "$response" | grep -q "data_source"; then
        data_source=$(echo "$response" | grep -oP '"data_source":\s*"[^"]+"' | cut -d'"' -f4)
        echo "  数据源: $data_source"

        if [ "$data_source" = "simulated" ] || [ "$data_source" = "mock" ] || [ "$data_source" = "fallback" ]; then
            echo -e "  ${RED}✗ 数据源为模拟数据！${NC}"
            ((FAIL++))
            return 1
        else
            echo -e "  ${GREEN}✓ 使用真实数据源: $data_source${NC}"
            ((PASS++))
        fi
    else
        echo -e "  ${YELLOW}! 无法确定数据源${NC}"
    fi
}

# 主检查
echo "[1/4] 检查服务健康状态..."
check_service "Backend" "http://localhost:3001/api/health" "status"
check_service "Market Data" "http://localhost:8001/health" "status"
check_service "Trading AI" "http://localhost:8000/api/v1/health/" "status"

echo ""
echo "[2/4] 检查数据库连接..."
if docker exec stock-race-postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ PostgreSQL连接正常${NC}"
    ((PASS++))
else
    echo -e "  ${RED}✗ PostgreSQL连接失败${NC}"
    ((FAIL++))
fi

if docker exec stock-race-timescaledb pg_isready -U timescale > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ TimescaleDB连接正常${NC}"
    ((PASS++))
else
    echo -e "  ${RED}✗ TimescaleDB连接失败${NC}"
    ((FAIL++))
fi

if docker exec stock-race-redis redis-cli ping > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Redis连接正常${NC}"
    ((PASS++))
else
    echo -e "  ${RED}✗ Redis连接失败${NC}"
    ((FAIL++))
fi

echo ""
echo "[3/4] 验证股票数据真实性..."
verify_stock_data

echo ""
echo "[4/4] 检查日志..."
check_logs_for_mock || true

echo ""
echo "========================================"
echo "验证结果"
echo "========================================"
echo -e "通过: ${GREEN}$PASS${NC}"
echo -e "失败: ${RED}$FAIL${NC}"

if [ $FAIL -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ 所有检查通过，联调环境使用真实数据！${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}✗ 存在失败的检查，请修复后再进行联调测试${NC}"
    exit 1
fi
