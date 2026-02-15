#!/bin/bash
# 停止本地运行的服务

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "========================================"
echo "  停止 Stock Race 本地服务"
echo "========================================"
echo ""

stop_service() {
    local name=$1
    local pid_file=$2

    if [ -f "$pid_file" ]; then
        PID=$(cat "$pid_file")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            rm -f "$pid_file"
            echo -e "  ${GREEN}✓ $name 已停止 (PID: $PID)${NC}"
        else
            rm -f "$pid_file"
            echo -e "  ${YELLOW}! $name 未运行${NC}"
        fi
    else
        echo -e "  ${YELLOW}! $name 未找到PID文件${NC}"
    fi
}

stop_service "Backend" "/tmp/stock-race-backend.pid"
stop_service "Market Data Service" "/tmp/stock-race-market-data.pid"
stop_service "Trading AI Service" "/tmp/stock-race-trading-ai.pid"

echo ""
echo -e "${GREEN}所有服务已停止${NC}"
