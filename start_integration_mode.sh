#!/bin/bash
# 联调模式启动脚本 - 强制使用真实数据，禁用所有模拟/降级
#
# 使用方式:
#   ./start_integration_mode.sh [service_name]
#
# 参数:
#   无参数    - 启动所有服务
#   backend   - 仅启动Backend
#   market    - 仅启动Market Data Service
#   ai        - 仅启动Trading AI Service

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 严格模式标志
export STRICT_MODE=true
export DISABLE_MOCK_DATA=true
export DISABLE_DATA_FALLBACK=true
export FORCE_DB_CONNECTION=true

echo "========================================"
echo "  Stock Race - 联调模式启动"
echo "  强制使用真实数据 | 禁用模拟/降级"
echo "========================================"
echo ""

# 检查Docker基础设施
check_infrastructure() {
    echo -e "${YELLOW}[阶段1] 验证基础设施 (Docker)...${NC}"

    local all_ready=true

    # 检查Redis
    if docker exec stock-race-redis redis-cli ping > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ Redis${NC} - localhost:6379"
    else
        echo -e "  ${RED}✗ Redis未运行${NC}"
        echo "    请执行: docker-compose up -d redis"
        all_ready=false
    fi

    # 检查PostgreSQL
    if docker exec stock-race-postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ PostgreSQL${NC} - localhost:5434"
    else
        echo -e "  ${RED}✗ PostgreSQL未运行${NC}"
        echo "    请执行: docker-compose up -d postgres"
        all_ready=false
    fi

    # 检查TimescaleDB
    if docker exec stock-race-timescaledb pg_isready -U timescale > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ TimescaleDB${NC} - localhost:5433"
    else
        echo -e "  ${RED}✗ TimescaleDB未运行${NC}"
        echo "    请执行: docker-compose up -d timescaledb"
        all_ready=false
    fi

    if [ "$all_ready" = false ]; then
        echo ""
        echo -e "${RED}基础设施未就绪，请先启动Docker容器${NC}"
        exit 1
    fi

    echo ""
}

# 验证数据库连接
verify_database_connections() {
    echo -e "${YELLOW}[阶段2] 验证数据库连接...${NC}"

    # 测试PostgreSQL连接
    if docker exec stock-race-postgres psql -U postgres -d stock_race -c "SELECT 1;" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ PostgreSQL连接正常${NC}"
    else
        echo -e "  ${RED}✗ PostgreSQL连接失败${NC}"
        echo "    检查数据库是否存在: docker exec stock-race-postgres psql -U postgres -c \"\\l\""
        exit 1
    fi

    # 测试TimescaleDB连接
    if docker exec stock-race-timescaledb psql -U timescale -d stock_race_tsdb -c "SELECT 1;" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ TimescaleDB连接正常${NC}"
    else
        echo -e "  ${RED}✗ TimescaleDB连接失败${NC}"
        exit 1
    fi

    echo ""
}

# 验证环境变量配置
verify_env_config() {
    echo -e "${YELLOW}[阶段3] 验证环境配置...${NC}"

    # 检查Backend配置
    if [ -f "$SCRIPT_DIR/backend/.env" ]; then
        if grep -q "STRICT_MODE=true" "$SCRIPT_DIR/backend/.env"; then
            echo -e "  ${GREEN}✓ Backend严格模式已启用${NC}"
        else
            echo -e "  ${YELLOW}! Backend严格模式未配置${NC}"
        fi
    fi

    # 检查Market Data配置
    if [ -f "$SCRIPT_DIR/market-data-service/.env" ]; then
        if grep -q "STRICT_MODE=true" "$SCRIPT_DIR/market-data-service/.env"; then
            echo -e "  ${GREEN}✓ Market Data严格模式已启用${NC}"
        else
            echo -e "  ${YELLOW}! Market Data严格模式未配置${NC}"
        fi
    fi

    echo ""
}

# 启动Backend
start_backend() {
    echo -e "${YELLOW}[阶段4] 启动 Backend (端口:3001)...${NC}"
    cd "$SCRIPT_DIR/backend"

    if [ ! -d "node_modules" ]; then
        echo "  安装依赖..."
        npm install > /dev/null 2>&1
    fi

    # 使用环境变量强制严格模式
    export STRICT_MODE=true
    export DISABLE_DATA_FALLBACK=true

    npm run dev > backend.log 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > /tmp/stock-race-backend.pid
    echo -e "  ${GREEN}✓ Backend 启动中 (PID: $BACKEND_PID)${NC}"

    # 等待服务就绪
    echo "  等待服务就绪..."
    for i in {1..30}; do
        if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓ Backend 就绪${NC}"
            break
        fi
        sleep 1
    done

    echo ""
}

# 启动Market Data Service
start_market_data() {
    echo -e "${YELLOW}[阶段5] 启动 Market Data Service (端口:8001)...${NC}"
    cd "$SCRIPT_DIR/market-data-service"

    # 检查依赖是否安装
    if ! pip list | grep -q "stock-race-data-service"; then
        echo "  安装依赖..."
        pip install -e . > /dev/null 2>&1
    fi

    # 使用环境变量强制严格模式
    export STRICT_MODE=true
    export DISABLE_MOCK_DATA=true
    export FORCE_DB_CONNECTION=true

    python -m uvicorn data_service.main:app --host 0.0.0.0 --port 8001 --reload > market-data.log 2>&1 &
    MARKET_DATA_PID=$!
    echo $MARKET_DATA_PID > /tmp/stock-race-market-data.pid
    echo -e "  ${GREEN}✓ Market Data Service 启动中 (PID: $MARKET_DATA_PID)${NC}"

    # 等待服务就绪
    echo "  等待服务就绪..."
    for i in {1..30}; do
        if curl -s http://localhost:8001/health > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓ Market Data Service 就绪${NC}"
            break
        fi
        sleep 1
    done

    echo ""
}

# 启动Trading AI Service
start_trading_ai() {
    echo -e "${YELLOW}[阶段6] 启动 Trading AI Service (端口:8000)...${NC}"
    cd "$SCRIPT_DIR/trading-ai-service"

    # 检查依赖是否安装
    if ! pip list | grep -q "stock-race-ai-service"; then
        echo "  安装依赖..."
        pip install -e . > /dev/null 2>&1
    fi

    # 使用环境变量强制严格模式
    export STRICT_MODE=true

    python -m uvicorn ai_service.main:app --host 0.0.0.0 --port 8000 --reload > trading-ai.log 2>&1 &
    TRADING_AI_PID=$!
    echo $TRADING_AI_PID > /tmp/stock-race-trading-ai.pid
    echo -e "  ${GREEN}✓ Trading AI Service 启动中 (PID: $TRADING_AI_PID)${NC}"

    # 等待服务就绪
    echo "  等待服务就绪..."
    for i in {1..30}; do
        if curl -s http://localhost:8000/api/v1/health/ > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓ Trading AI Service 就绪${NC}"
            break
        fi
        sleep 1
    done

    echo ""
}

# 验证服务间通信
verify_service_communication() {
    echo -e "${YELLOW}[阶段7] 验证服务间通信...${NC}"

    # 测试Backend -> Market Data
    if curl -s http://localhost:3001/api/health | grep -q "data_service"; then
        echo -e "  ${GREEN}✓ Backend -> Market Data 连接正常${NC}"
    else
        echo -e "  ${YELLOW}! Backend -> Market Data 连接待确认${NC}"
    fi

    echo ""
}

# 显示状态
show_status() {
    echo "========================================"
    echo "  联调环境启动完成"
    echo "========================================"
    echo ""
    echo -e "${GREEN}基础设施 (Docker):${NC}"
    echo "  - Redis:          localhost:6379"
    echo "  - PostgreSQL:     localhost:5434"
    echo "  - TimescaleDB:    localhost:5433"
    echo ""
    echo -e "${GREEN}业务服务 (本地):${NC}"
    echo "  - Backend:        http://localhost:3001"
    echo "  - Market Data:    http://localhost:8001"
    echo "  - Trading AI:     http://localhost:8000"
    echo ""
    echo -e "${YELLOW}严格模式: 已启用${NC}"
    echo "  ✓ 禁用所有模拟数据"
    echo "  ✓ 禁用服务降级"
    echo "  ✓ 强制数据库连接"
    echo ""
    echo "健康检查:"
    echo "  curl http://localhost:3001/api/health"
    echo "  curl http://localhost:8001/health"
    echo "  curl http://localhost:8000/api/v1/health/"
    echo ""
    echo "停止服务: ./stop_services.sh"
    echo ""
}

# 主函数
main() {
    check_infrastructure
    verify_database_connections
    verify_env_config

    # 根据参数启动服务
    case "${1:-all}" in
        backend)
            start_backend
            ;;
        market)
            start_market_data
            ;;
        ai)
            start_trading_ai
            ;;
        all)
            start_backend
            start_market_data
            start_trading_ai
            verify_service_communication
            ;;
        *)
            echo "用法: $0 [backend|market|ai|all]"
            exit 1
            ;;
    esac

    show_status
}

main "$@"
