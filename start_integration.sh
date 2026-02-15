#!/bin/bash
# 联调环境一键启动脚本（本地模式）
# 基于之前验证成功的配置

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================"
echo "  Stock Race - 联调环境一键启动"
echo "========================================"
echo ""

# 项目根目录
PROJECT_DIR="/home/fe-jerome/projects/stock-race"
cd "$PROJECT_DIR"

# 检查基础设施
check_infrastructure() {
    echo -e "${YELLOW}[1/5] 检查 Docker 基础设施...${NC}"

    # 检查 Redis
    if docker exec stock-race-redis redis-cli ping > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ Redis${NC} - localhost:6379"
    else
        echo -e "  ${RED}✗ Redis 未运行${NC}"
        echo "    正在启动..."
        docker-compose up -d redis
        sleep 3
    fi

    # 检查 PostgreSQL
    if docker exec stock-race-postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ PostgreSQL${NC} - localhost:5434"
    else
        echo -e "  ${RED}✗ PostgreSQL 未运行${NC}"
        echo "    正在启动..."
        docker-compose up -d postgres
        sleep 3
    fi

    # 检查 TimescaleDB
    if docker exec stock-race-timescaledb pg_isready -U timescale > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ TimescaleDB${NC} - localhost:5433"
    else
        echo -e "  ${RED}✗ TimescaleDB 未运行${NC}"
        echo "    正在启动..."
        docker-compose up -d timescaledb
        sleep 3
    fi

    echo ""
}

# 停止现有服务
stop_existing() {
    echo -e "${YELLOW}[2/5] 清理现有服务...${NC}"
    pkill -f "node src/app.js" 2>/dev/null || true
    pkill -f "uvicorn.*main:app" 2>/dev/null || true
    pkill -f "python.*news_service/main" 2>/dev/null || true
    lsof -ti:3001,8000,8001,8002 | xargs kill -9 2>/dev/null || true
    echo -e "  ${GREEN}✓ 已清理${NC}"
    echo ""
}

# 启动服务
start_services() {
    echo -e "${YELLOW}[3/5] 启动业务服务...${NC}"

    # Backend
    echo -e "  启动 ${BLUE}Backend${NC} (端口: 3001)..."
    cd "$PROJECT_DIR/backend"
    export STRICT_MODE=true
    export DISABLE_DATA_FALLBACK=true
    nohup node src/app.js > backend.log 2>&1 &
    echo $! > /tmp/stock-race-backend.pid

    # Market Data Service
    echo -e "  启动 ${BLUE}Market Data${NC} (端口: 8001)..."
    cd "$PROJECT_DIR/market-data-service"
    export STRICT_MODE=true
    export DISABLE_MOCK_DATA=true
    export FORCE_DB_CONNECTION=true
    nohup python3 -m uvicorn data_service.main:app --host 0.0.0.0 --port 8001 --reload > market-data.log 2>&1 &
    echo $! > /tmp/stock-race-market-data.pid

    # Trading AI Service
    echo -e "  启动 ${BLUE}Trading AI${NC} (端口: 8000)..."
    cd "$PROJECT_DIR/trading-ai-service"
    export STRICT_MODE=true
    nohup python3 -m uvicorn ai_service.main:app --host 0.0.0.0 --port 8000 --reload > trading-ai.log 2>&1 &
    echo $! > /tmp/stock-race-trading-ai.pid

    # News Service
    echo -e "  启动 ${BLUE}News Service${NC} (事件总线模式)..."
    cd "$PROJECT_DIR/news-service"
    export PYTHONPATH=/home/fe-jerome/projects/stock-race/news-service/src:/home/fe-jerome/projects/stock-race/infra/event-bus/src:/home/fe-jerome/projects/stock-race/infra/health-check/src
    export STRICT_MODE=true
    nohup python3 src/news_service/main.py > news-service.log 2>&1 &
    echo $! > /tmp/stock-race-news.pid

    echo ""
}

# 等待服务就绪
wait_for_ready() {
    echo -e "${YELLOW}[4/5] 等待服务就绪...${NC}"

    check_service() {
        local name=$1
        local url=$2
        local max_attempts=30
        local attempt=1

        while [ $attempt -le $max_attempts ]; do
            if curl -s "$url" > /dev/null 2>&1; then
                echo -e "  ${GREEN}✓ $name 就绪${NC}"
                return 0
            fi
            sleep 1
            attempt=$((attempt + 1))
        done

        echo -e "  ${RED}✗ $name 启动超时${NC}"
        return 1
    }

    sleep 5
    check_service "Backend" "http://localhost:3001/api/health"
    check_service "Market Data" "http://localhost:8001/health"
    check_service "Trading AI" "http://localhost:8000/api/v1/health/"

    echo ""
}

# 验证数据真实性
verify_real_data() {
    echo -e "${YELLOW}[5/5] 验证数据真实性...${NC}"

    # 检查日志中是否有模拟数据
    local has_mock=false

    if grep -iE "(模拟数据|mock|fallback|simulated|降级)" backend/backend.log 2>/dev/null | grep -v "DISABLE_DATA_FALLBACK" > /dev/null; then
        echo -e "  ${RED}✗ Backend 日志中发现模拟数据关键词${NC}"
        has_mock=true
    else
        echo -e "  ${GREEN}✓ Backend 使用真实数据${NC}"
    fi

    if grep -iE "(in-memory|simulated|fallback|内存模式)" market-data-service/market-data.log 2>/dev/null > /dev/null; then
        echo -e "  ${RED}✗ Market Data 日志中发现模拟数据关键词${NC}"
        has_mock=true
    else
        echo -e "  ${GREEN}✓ Market Data 使用真实数据${NC}"
    fi

    if [ "$has_mock" = true ]; then
        echo -e "\n${YELLOW}警告：检测到模拟/降级数据使用！${NC}"
        echo "请检查环境变量 STRICT_MODE=true 是否设置"
    fi

    echo ""
}

# 显示状态
show_status() {
    echo "========================================"
    echo -e "${GREEN}✓ 联调环境启动成功！${NC}"
    echo "========================================"
    echo ""
    echo -e "${BLUE}服务地址：${NC}"
    echo "  • Backend:      http://localhost:3001"
    echo "  • Market Data:  http://localhost:8001"
    echo "  • Trading AI:   http://localhost:8000"
    echo ""
    echo -e "${BLUE}健康检查：${NC}"
    echo "  curl http://localhost:3001/api/health"
    echo "  curl http://localhost:8001/health"
    echo "  curl http://localhost:8000/api/v1/health/"
    echo ""
    echo -e "${BLUE}日志文件：${NC}"
    echo "  tail -f backend/backend.log"
    echo "  tail -f market-data-service/market-data.log"
    echo "  tail -f trading-ai-service/trading-ai.log"
    echo ""
    echo -e "${BLUE}停止服务：${NC}"
    echo "  ./stop_integration.sh"
    echo ""
    echo -e "${YELLOW}✨ 现在可以开始联调测试了！${NC}"
    echo ""
}

# 主函数
main() {
    check_infrastructure
    stop_existing
    start_services
    wait_for_ready
    verify_real_data
    show_status
}

main "$@"
