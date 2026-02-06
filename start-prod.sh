#!/bin/bash

# Stock Race 生产环境启动脚本
# 使用方法: ./start-prod.sh [up|down|restart|logs|status]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 环境变量文件
ENV_FILE=".env.production"

# 检查环境变量文件
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}警告: 环境变量文件 $ENV_FILE 不存在${NC}"
    echo -e "${BLUE}正在从示例文件创建环境变量文件...${NC}"
    if [ -f ".env.production.example" ]; then
        cp .env.production.example .env.production
        echo -e "${GREEN}已创建环境变量文件，请编辑 $ENV_FILE 配置生产环境参数${NC}"
    else
        echo -e "${RED}错误: 找不到环境变量示例文件 .env.production.example${NC}"
        exit 1
    fi
fi

# 加载环境变量
echo -e "${BLUE}加载环境变量...${NC}"
export $(grep -v '^#' $ENV_FILE | xargs)

# Docker Compose 文件
COMPOSE_FILE="docker-compose.prod.yml"

# 检查 Docker Compose 文件
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}错误: Docker Compose 文件 $COMPOSE_FILE 不存在${NC}"
    exit 1
fi

# 函数定义
show_help() {
    echo -e "${BLUE}Stock Race 生产环境管理脚本${NC}"
    echo ""
    echo "使用方法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  up         启动所有服务"
    echo "  up-build   构建并启动所有服务"
    echo "  down       停止并移除所有服务"
    echo "  restart    重启所有服务"
    echo "  logs       查看服务日志"
    echo "  status     查看服务状态"
    echo "  health     检查服务健康状态"
    echo "  backup     备份数据库"
    echo "  help       显示此帮助信息"
    echo ""
}

start_services() {
    echo -e "${GREEN}启动 Stock Race 生产环境服务...${NC}"
    echo -e "${BLUE}使用配置文件: $COMPOSE_FILE${NC}"

    # 检查Docker是否运行
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}错误: Docker 服务未运行${NC}"
        exit 1
    fi

    # 启动服务
    docker-compose -f "$COMPOSE_FILE" up -d

    echo -e "${GREEN}服务启动完成！${NC}"
    echo ""
    show_service_info
}

start_services_with_build() {
    echo -e "${GREEN}构建并启动 Stock Race 生产环境服务...${NC}"
    echo -e "${BLUE}使用配置文件: $COMPOSE_FILE${NC}"

    # 检查Docker是否运行
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}错误: Docker 服务未运行${NC}"
        exit 1
    fi

    # 构建并启动服务
    docker-compose -f "$COMPOSE_FILE" up -d --build

    echo -e "${GREEN}服务构建并启动完成！${NC}"
    echo ""
    show_service_info
}

stop_services() {
    echo -e "${YELLOW}停止 Stock Race 生产环境服务...${NC}"
    docker-compose -f "$COMPOSE_FILE" down
    echo -e "${GREEN}服务已停止${NC}"
}

restart_services() {
    echo -e "${YELLOW}重启 Stock Race 生产环境服务...${NC}"
    docker-compose -f "$COMPOSE_FILE" restart
    echo -e "${GREEN}服务已重启${NC}"
}

show_logs() {
    echo -e "${BLUE}显示服务日志...${NC}"
    echo "按 Ctrl+C 退出日志查看"
    docker-compose -f "$COMPOSE_FILE" logs -f
}

show_status() {
    echo -e "${BLUE}服务状态:${NC}"
    docker-compose -f "$COMPOSE_FILE" ps

    echo ""
    echo -e "${BLUE}容器资源使用情况:${NC}"
    docker stats --no-stream $(docker-compose -f "$COMPOSE_FILE" ps -q) 2>/dev/null || echo "无法获取资源使用情况"
}

check_health() {
    echo -e "${BLUE}检查服务健康状态...${NC}"

    # 检查后端服务
    echo -n "后端服务 (http://localhost:${BACKEND_PORT:-3001}/api/health): "
    if curl -s -f "http://localhost:${BACKEND_PORT:-3001}/api/health" > /dev/null; then
        echo -e "${GREEN}✓ 健康${NC}"
    else
        echo -e "${RED}✗ 不健康${NC}"
    fi

    # 检查AI服务
    echo -n "AI服务 (http://localhost:${AI_SERVICE_PORT:-8000}/api/v1/health/): "
    if curl -s -f "http://localhost:${AI_SERVICE_PORT:-8000}/api/v1/health/" > /dev/null; then
        echo -e "${GREEN}✓ 健康${NC}"
    else
        echo -e "${RED}✗ 不健康${NC}"
    fi

    # 检查数据服务
    echo -n "数据服务 (http://localhost:${DATA_SERVICE_PORT:-8001}/health): "
    if curl -s -f "http://localhost:${DATA_SERVICE_PORT:-8001}/health" > /dev/null; then
        echo -e "${GREEN}✓ 健康${NC}"
    else
        echo -e "${RED}✗ 不健康${NC}"
    fi

    # 检查前端服务
    echo -n "前端服务 (http://localhost:${FRONTEND_PORT:-3000}/health): "
    if curl -s -f "http://localhost:${FRONTEND_PORT:-3000}/health" > /dev/null; then
        echo -e "${GREEN}✓ 健康${NC}"
    else
        echo -e "${RED}✗ 不健康${NC}"
    fi

    # 检查数据库
    echo -n "PostgreSQL数据库: "
    if docker exec stock-race-postgres-prod pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 健康${NC}"
    else
        echo -e "${RED}✗ 不健康${NC}"
    fi

    # 检查Redis
    echo -n "Redis缓存: "
    if docker exec stock-race-redis-prod redis-cli -a "${REDIS_PASSWORD:-redis_change_me_in_production}" ping > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 健康${NC}"
    else
        echo -e "${RED}✗ 不健康${NC}"
    fi
}

backup_databases() {
    echo -e "${BLUE}备份数据库...${NC}"

    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_DIR="backups/production_$TIMESTAMP"

    mkdir -p "$BACKUP_DIR"

    # 备份PostgreSQL
    echo "备份PostgreSQL数据库..."
    docker exec stock-race-postgres-prod pg_dump -U postgres stock_race > "$BACKUP_DIR/postgres_backup.sql" 2>/dev/null && \
        echo -e "${GREEN}PostgreSQL备份完成: $BACKUP_DIR/postgres_backup.sql${NC}" || \
        echo -e "${RED}PostgreSQL备份失败${NC}"

    # 备份TimescaleDB
    echo "备份TimescaleDB数据库..."
    docker exec stock-race-timescaledb-prod pg_dump -U timescale stock_race_tsdb > "$BACKUP_DIR/timescaledb_backup.sql" 2>/dev/null && \
        echo -e "${GREEN}TimescaleDB备份完成: $BACKUP_DIR/timescaledb_backup.sql${NC}" || \
        echo -e "${RED}TimescaleDB备份失败${NC}"

    # 备份Redis
    echo "备份Redis数据..."
    docker exec stock-race-redis-prod redis-cli -a "${REDIS_PASSWORD:-redis_change_me_in_production}" --rdb /tmp/dump.rdb > /dev/null 2>&1
    docker cp stock-race-redis-prod:/tmp/dump.rdb "$BACKUP_DIR/redis_backup.rdb" 2>/dev/null && \
        echo -e "${GREEN}Redis备份完成: $BACKUP_DIR/redis_backup.rdb${NC}" || \
        echo -e "${RED}Redis备份失败${NC}"

    # 创建压缩包
    tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR" 2>/dev/null && \
        echo -e "${GREEN}备份压缩包创建完成: $BACKUP_DIR.tar.gz${NC}" || \
        echo -e "${RED}备份压缩包创建失败${NC}"

    # 清理临时目录
    rm -rf "$BACKUP_DIR"

    echo -e "${GREEN}数据库备份完成！${NC}"
}

show_service_info() {
    echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                    Stock Race 生产环境服务信息${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}核心服务:${NC}"
    echo -e "  • 前端应用: ${GREEN}http://localhost:${FRONTEND_PORT:-3000}${NC}"
    echo -e "  • 后端API:  ${GREEN}http://localhost:${BACKEND_PORT:-3001}/api${NC}"
    echo -e "  • AI服务:   ${GREEN}http://localhost:${AI_SERVICE_PORT:-8000}/api/v1${NC}"
    echo -e "  • 数据服务: ${GREEN}http://localhost:${DATA_SERVICE_PORT:-8001}${NC}"
    echo ""
    echo -e "${YELLOW}管理工具:${NC}"
    echo -e "  • pgAdmin (数据库管理): ${GREEN}http://localhost:${PGADMIN_PORT:-5050}${NC}"
    echo -e "    邮箱: ${PGADMIN_EMAIL:-admin@stock-race.com}"
    echo -e "    密码: ${PGADMIN_PASSWORD:-admin123}"
    echo -e "  • Redis Commander:      ${GREEN}http://localhost:${REDIS_COMMANDER_PORT:-8081}${NC}"
    echo ""
    echo -e "${YELLOW}数据库连接:${NC}"
    echo -e "  • PostgreSQL: localhost:${POSTGRES_PORT:-5432}"
    echo -e "    数据库: stock_race, 用户: postgres"
    echo -e "  • TimescaleDB: localhost:${TSDB_PORT:-5433}"
    echo -e "    数据库: stock_race_tsdb, 用户: timescale"
    echo -e "  • Redis: localhost:${REDIS_PORT:-6379}"
    echo ""
    echo -e "${YELLOW}健康检查:${NC}"
    echo -e "  运行 ${GREEN}./start-prod.sh health${NC} 检查所有服务健康状态"
    echo ""
    echo -e "${YELLOW}管理命令:${NC}"
    echo -e "  • 查看日志:   ${GREEN}./start-prod.sh logs${NC}"
    echo -e "  • 查看状态:   ${GREEN}./start-prod.sh status${NC}"
    echo -e "  • 重启服务:   ${GREEN}./start-prod.sh restart${NC}"
    echo -e "  • 停止服务:   ${GREEN}./start-prod.sh down${NC}"
    echo -e "  • 备份数据:   ${GREEN}./start-prod.sh backup${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════${NC}"
}

# 主逻辑
case "$1" in
    "up")
        start_services
        ;;
    "up-build")
        start_services_with_build
        ;;
    "down")
        stop_services
        ;;
    "restart")
        restart_services
        ;;
    "logs")
        show_logs
        ;;
    "status")
        show_status
        ;;
    "health")
        check_health
        ;;
    "backup")
        backup_databases
        ;;
    "help"|"-h"|"--help"|"")
        show_help
        ;;
    *)
        echo -e "${RED}错误: 未知命令 '$1'${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac