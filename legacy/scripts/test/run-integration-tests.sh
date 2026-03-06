#!/bin/bash
#
# 集成测试启动脚本
# I-001: 完善集成测试环境
#
# 用法:
#   ./scripts/run-integration-tests.sh          # 运行所有集成测试
#   ./scripts/run-integration-tests.sh --quick  # 快速模式（跳过数据库重置）
#   ./scripts/run-integration-tests.sh --ci     # CI模式（使用docker-compose.test.yml）
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认配置
COMPOSE_FILE="docker-compose.integration.yml"
BACKEND_DIR="backend"
QUICK_MODE=false
CI_MODE=false

# 解析参数
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --quick)
      QUICK_MODE=true
      shift
      ;;
    --ci)
      CI_MODE=true
      COMPOSE_FILE="docker-compose.test.yml"
      shift
      ;;
    --help)
      echo "用法: $0 [选项]"
      echo "选项:"
      echo "  --quick  快速模式（跳过数据库重置）"
      echo "  --ci     CI模式（使用docker-compose.test.yml）"
      echo "  --help   显示帮助"
      exit 0
      ;;
    *)
      echo -e "${RED}未知选项: $1${NC}"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  集成测试环境启动脚本${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}错误: Docker 未运行${NC}"
  exit 1
fi

# 检查 docker-compose 是否安装
if ! command -v docker-compose &> /dev/null; then
  echo -e "${RED}错误: docker-compose 未安装${NC}"
  exit 1
fi

# 进入项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}步骤 1/6: 清理现有容器...${NC}"
docker-compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
echo -e "${GREEN}✓ 容器清理完成${NC}"
echo ""

echo -e "${YELLOW}步骤 2/6: 构建镜像...${NC}"
docker-compose -f "$COMPOSE_FILE" build --parallel
echo -e "${GREEN}✓ 镜像构建完成${NC}"
echo ""

echo -e "${YELLOW}步骤 3/6: 启动基础设施...${NC}"
docker-compose -f "$COMPOSE_FILE" up -d postgres redis timescaledb

# 等待数据库就绪
echo -e "${YELLOW}等待数据库就绪...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PostgreSQL 就绪${NC}"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "  等待 PostgreSQL... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo -e "${RED}✗ PostgreSQL 启动超时${NC}"
  exit 1
fi

# 等待 Redis 就绪
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if docker-compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Redis 就绪${NC}"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "  等待 Redis... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 1
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo -e "${RED}✗ Redis 启动超时${NC}"
  exit 1
fi

echo ""

# 数据库迁移
echo -e "${YELLOW}步骤 4/6: 执行数据库迁移...${NC}"
docker-compose -f "$COMPOSE_FILE" run --rm backend npx prisma migrate deploy
echo -e "${GREEN}✓ 数据库迁移完成${NC}"
echo ""

# 快速模式跳过数据重置
if [ "$QUICK_MODE" = false ]; then
  echo -e "${YELLOW}步骤 5/6: 初始化测试数据...${NC}"
  docker-compose -f "$COMPOSE_FILE" run --rm backend npm run db:seed || echo -e "${YELLOW}⚠ 数据初始化跳过（无seed脚本）${NC}"
  echo -e "${GREEN}✓ 测试数据初始化完成${NC}"
else
  echo -e "${YELLOW}步骤 5/6: 跳过数据初始化（快速模式）${NC}"
fi
echo ""

# 启动业务服务
echo -e "${YELLOW}步骤 6/6: 启动业务服务...${NC}"
docker-compose -f "$COMPOSE_FILE" up -d backend market-data-service trading-ai-service news-service

# 等待服务健康检查
echo -e "${YELLOW}等待服务就绪...${NC}"
services=("backend:3001/api/health" "market-data-service:8001/health" "trading-ai-service:8000/api/v1/health/")

for service in "${services[@]}"; do
  IFS=':' read -r name port_path <<< "$service"
  host="localhost"
  port="${port_path%%/*}"
  path="${port_path#*/}"

  RETRY_COUNT=0
  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf "http://${host}:${port}/${path}" > /dev/null 2>&1; then
      echo -e "${GREEN}✓ $name 就绪${NC}"
      break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "  等待 $name... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
  done

  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}✗ $name 启动超时${NC}"
    echo -e "${YELLOW}查看日志:${NC}"
    docker-compose -f "$COMPOSE_FILE" logs "$name" --tail=50
    exit 1
  fi
done

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  集成测试环境启动成功!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "服务地址:"
echo "  - Backend:           http://localhost:3001"
echo "  - Market Data:       http://localhost:8001"
echo "  - Trading AI:        http://localhost:8000"
echo "  - PostgreSQL:        localhost:5434"
echo "  - Redis:             localhost:6380"
echo "  - TimescaleDB:       localhost:5433"
echo ""
echo "测试命令:"
echo "  cd backend && npm run test:integration"
echo ""
echo "查看日志:"
echo "  docker-compose -f $COMPOSE_FILE logs -f [service-name]"
echo ""
echo "停止环境:"
echo "  docker-compose -f $COMPOSE_FILE down"
echo ""

# CI 模式下自动运行测试
if [ "$CI_MODE" = true ]; then
  echo -e "${YELLOW}CI模式: 自动运行集成测试...${NC}"
  cd "$BACKEND_DIR"
  npm run test:integration
fi
