#!/bin/bash
# Docker 联调环境一键启动脚本
# 使用方法: ./start_docker_integration.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "  Stock Race - Docker 联调环境启动"
echo "========================================"
echo ""

# 检查 Docker
echo -e "${YELLOW}[1/6] 检查 Docker 环境...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker 未安装${NC}"
    exit 1
fi

if ! docker-compose version &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}✗ Docker Compose 未安装${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker 环境正常${NC}"
echo ""

# 选择 docker compose 命令
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

# 停止现有服务（避免冲突）
echo -e "${YELLOW}[2/6] 停止现有服务...${NC}"
$COMPOSE_CMD -f docker-compose.integration.yml down 2>/dev/null || true
pkill -f "node src/app.js" 2>/dev/null || true
pkill -f "uvicorn.*main:app" 2>/dev/null || true
echo -e "${GREEN}✓ 已清理${NC}"
echo ""

# 构建镜像
echo -e "${YELLOW}[3/6] 构建服务镜像...${NC}"
$COMPOSE_CMD -f docker-compose.integration.yml build --parallel
echo -e "${GREEN}✓ 镜像构建完成${NC}"
echo ""

# 启动服务
echo -e "${YELLOW}[4/6] 启动所有服务...${NC}"
$COMPOSE_CMD -f docker-compose.integration.yml up -d
echo -e "${GREEN}✓ 服务已启动${NC}"
echo ""

# 等待服务就绪
echo -e "${YELLOW}[5/6] 等待服务就绪（约 30 秒）...${NC}"
sleep 5

# 健康检查函数
check_health() {
    local name=$1
    local url=$2
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓ $name 就绪${NC}"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done

    echo -e "  ${RED}✗ $name 启动超时${NC}"
    return 1
}

check_health "Backend" "http://localhost:3001/api/health"
check_health "Market Data" "http://localhost:8001/health"
check_health "Trading AI" "http://localhost:8000/api/v1/health/"

echo ""

# 显示状态
echo -e "${YELLOW}[6/6] 验证服务状态...${NC}"
echo ""
$COMPOSE_CMD -f docker-compose.integration.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "========================================"
echo -e "${GREEN}✓ 联调环境启动成功！${NC}"
echo "========================================"
echo ""
echo -e "${BLUE}服务访问地址：${NC}"
echo "  • Backend:        http://localhost:3001"
echo "  • Market Data:    http://localhost:8001"
echo "  • Trading AI:     http://localhost:8000"
echo "  • News Service:   http://localhost:8002 (事件总线模式)"
echo ""
echo -e "${BLUE}管理工具：${NC}"
echo "  • Redis Commander: http://localhost:8081"
echo "  • pgAdmin:         http://localhost:5050"
echo ""
echo -e "${BLUE}常用命令：${NC}"
echo "  查看日志:    $COMPOSE_CMD -f docker-compose.integration.yml logs -f"
echo "  查看后端:    $COMPOSE_CMD -f docker-compose.integration.yml logs -f backend"
echo "  停止环境:    $COMPOSE_CMD -f docker-compose.integration.yml down"
echo "  重启服务:    $COMPOSE_CMD -f docker-compose.integration.yml restart <service>"
echo ""
echo -e "${YELLOW}提示：代码修改后自动热重载，无需重启容器${NC}"
echo ""
