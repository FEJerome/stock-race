#!/bin/bash
# 混合部署方案 - 本地服务启动脚本
# 基础设施(PostgreSQL/TimescaleDB/Redis)使用Docker，业务服务本地启动

set -e

echo "========================================"
echo "  Stock Race - 混合部署服务启动脚本"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查基础设施
check_infrastructure() {
    echo -e "${YELLOW}[1/4] 检查基础设施状态...${NC}"

    # 检查Redis
    if docker exec stock-race-redis redis-cli ping > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ Redis${NC} - localhost:6379"
    else
        echo -e "  ${RED}✗ Redis未运行${NC}"
        echo "    请执行: docker-compose up -d redis"
        exit 1
    fi

    # 检查PostgreSQL
    if docker exec stock-race-postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ PostgreSQL${NC} - localhost:5434"
    else
        echo -e "  ${RED}✗ PostgreSQL未运行${NC}"
        echo "    请执行: docker-compose up -d postgres"
        exit 1
    fi

    # 检查TimescaleDB
    if docker exec stock-race-timescaledb pg_isready -U timescale > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ TimescaleDB${NC} - localhost:5433"
    else
        echo -e "  ${RED}✗ TimescaleDB未运行${NC}"
        echo "    请执行: docker-compose up -d timescaledb"
        exit 1
    fi

    echo ""
}

# 启动Backend
start_backend() {
    echo -e "${YELLOW}[2/4] 启动 Backend 服务...${NC}"
    cd /home/fe-jerome/projects/stock-race/backend

    if [ ! -d "node_modules" ]; then
        echo "  安装依赖..."
        npm install
    fi

    echo "  启动 Backend (端口: 3001)..."
    echo "  日志文件: backend/logs/app.log"
    npm run dev > backend.log 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > /tmp/stock-race-backend.pid
    echo -e "  ${GREEN}✓ Backend 启动中 (PID: $BACKEND_PID)${NC}"
    echo ""
}

# 启动Market Data Service
start_market_data() {
    echo -e "${YELLOW}[3/4] 启动 Market Data Service...${NC}"
    cd /home/fe-jerome/projects/stock-race/market-data-service

    if ! pip list | grep -q "stock-race-data-service"; then
        echo "  安装依赖..."
        pip install -e . > /dev/null 2>&1
    fi

    echo "  启动 Market Data Service (端口: 8001)..."
    python -m uvicorn data_service.main:app --host 0.0.0.0 --port 8001 --reload > market-data.log 2>&1 &
    MARKET_DATA_PID=$!
    echo $MARKET_DATA_PID > /tmp/stock-race-market-data.pid
    echo -e "  ${GREEN}✓ Market Data Service 启动中 (PID: $MARKET_DATA_PID)${NC}"
    echo ""
}

# 启动Trading AI Service
start_trading_ai() {
    echo -e "${YELLOW}[4/4] 启动 Trading AI Service...${NC}"
    cd /home/fe-jerome/projects/stock-race/trading-ai-service

    if ! pip list | grep -q "stock-race-ai-service"; then
        echo "  安装依赖..."
        pip install -e . > /dev/null 2>&1
    fi

    echo "  启动 Trading AI Service (端口: 8000)..."
    python -m uvicorn ai_service.main:app --host 0.0.0.0 --port 8000 --reload > trading-ai.log 2>&1 &
    TRADING_AI_PID=$!
    echo $TRADING_AI_PID > /tmp/stock-race-trading-ai.pid
    echo -e "  ${GREEN}✓ Trading AI Service 启动中 (PID: $TRADING_AI_PID)${NC}"
    echo ""
}

# 等待服务就绪
wait_for_services() {
    echo -e "${YELLOW}等待服务就绪...${NC}"
    sleep 5

    # 检查Backend
    for i in {1..30}; do
        if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓ Backend 就绪${NC}"
            break
        fi
        sleep 1
    done

    # 检查Market Data
    for i in {1..30}; do
        if curl -s http://localhost:8001/health > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓ Market Data Service 就绪${NC}"
            break
        fi
        sleep 1
    done

    # 检查Trading AI
    for i in {1..30}; do
        if curl -s http://localhost:8000/api/v1/health/ > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓ Trading AI Service 就绪${NC}"
            break
        fi
        sleep 1
    done

    echo ""
}

# 显示状态
show_status() {
    echo "========================================"
    echo "  服务启动完成"
    echo "========================================"
    echo ""
    echo "基础设施 (Docker):"
    echo "  - Redis:          localhost:6379"
    echo "  - PostgreSQL:     localhost:5434"
    echo "  - TimescaleDB:    localhost:5433"
    echo ""
    echo "业务服务 (本地):"
    echo "  - Backend:        http://localhost:3001"
    echo "  - Market Data:    http://localhost:8001"
    echo "  - Trading AI:     http://localhost:8000"
    echo ""
    echo "健康检查:"
    echo "  curl http://localhost:3001/api/health"
    echo "  curl http://localhost:8001/health"
    echo "  curl http://localhost:8000/api/v1/health/"
    echo ""
    echo "日志文件:"
    echo "  - backend/backend.log"
    echo "  - market-data-service/market-data.log"
    echo "  - trading-ai-service/trading-ai.log"
    echo ""
    echo "停止服务: ./stop_services.sh"
    echo ""
}

# 主函数
main() {
    check_infrastructure
    start_backend
    start_market_data
    start_trading_ai
    wait_for_services
    show_status
}

main "$@"
