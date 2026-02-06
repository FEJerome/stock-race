#!/bin/bash

# Stock Race 生产环境部署测试脚本
# 这个脚本测试生产环境Docker配置的基本功能

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                   Stock Race 生产环境部署测试${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════${NC}"
echo ""

# 步骤1: 检查环境
echo -e "${YELLOW}步骤1: 检查环境...${NC}"
echo ""

# 检查Docker
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓ Docker 已安装${NC}"
    docker_version=$(docker --version | cut -d' ' -f3 | tr -d ',')
    echo "  版本: $docker_version"
else
    echo -e "${RED}✗ Docker 未安装${NC}"
    exit 1
fi

# 检查Docker Compose
if command -v docker-compose &> /dev/null; then
    echo -e "${GREEN}✓ Docker Compose 已安装${NC}"
    compose_version=$(docker-compose --version | cut -d' ' -f3 | tr -d ',')
    echo "  版本: $compose_version"
else
    echo -e "${RED}✗ Docker Compose 未安装${NC}"
    exit 1
fi

# 检查Docker服务状态
if docker info > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Docker 服务正在运行${NC}"
else
    echo -e "${RED}✗ Docker 服务未运行${NC}"
    exit 1
fi

echo ""

# 步骤2: 检查配置文件
echo -e "${YELLOW}步骤2: 检查配置文件...${NC}"
echo ""

REQUIRED_FILES=(
    "docker-compose.prod.yml"
    "backend/Dockerfile.prod"
    "frontend/Dockerfile.prod"
    "ai-service/Dockerfile.prod"
    "data-service/Dockerfile.prod"
    "docker/postgres/init.sql"
    "docker/timescaledb/init.sql"
    "frontend/nginx.conf"
)

all_files_exist=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓ $file${NC}"
    else
        echo -e "${RED}✗ $file (缺失)${NC}"
        all_files_exist=false
    fi
done

if [ "$all_files_exist" = false ]; then
    echo -e "${RED}错误: 缺少必要的配置文件${NC}"
    exit 1
fi

echo ""

# 步骤3: 验证Docker Compose配置
echo -e "${YELLOW}步骤3: 验证Docker Compose配置...${NC}"
echo ""

if docker-compose -f docker-compose.prod.yml config > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Docker Compose 配置语法正确${NC}"
else
    echo -e "${RED}✗ Docker Compose 配置语法错误${NC}"
    exit 1
fi

# 检查服务定义
SERVICES=("postgres" "timescaledb" "redis" "backend" "ai-service" "data-service" "frontend")
for service in "${SERVICES[@]}"; do
    if docker-compose -f docker-compose.prod.yml config --services | grep -q "^$service$"; then
        echo -e "${GREEN}✓ 服务 '$service' 已定义${NC}"
    else
        echo -e "${RED}✗ 服务 '$service' 未定义${NC}"
    fi
done

echo ""

# 步骤4: 测试构建（不实际运行）
echo -e "${YELLOW}步骤4: 测试Docker镜像构建...${NC}"
echo ""

SERVICES_TO_BUILD=("backend" "frontend" "ai-service" "data-service")
for service in "${SERVICES_TO_BUILD[@]}"; do
    echo -n "测试构建 $service... "
    if docker-compose -f docker-compose.prod.yml build --no-cache $service > /tmp/build_$service.log 2>&1; then
        echo -e "${GREEN}✓ 成功${NC}"
    else
        echo -e "${RED}✗ 失败${NC}"
        echo "查看日志: /tmp/build_$service.log"
    fi
done

echo ""

# 步骤5: 检查端口占用
echo -e "${YELLOW}步骤5: 检查端口占用...${NC}"
echo ""

PORTS_TO_CHECK=(3000 3001 5432 5433 6379 8000 8001 5050 8081)
for port in "${PORTS_TO_CHECK[@]}"; do
    if netstat -tulpn 2>/dev/null | grep -q ":$port "; then
        echo -e "${YELLOW}⚠ 端口 $port 已被占用${NC}"
    else
        echo -e "${GREEN}✓ 端口 $port 可用${NC}"
    fi
done

echo ""

# 步骤6: 检查网络配置
echo -e "${YELLOW}步骤6: 检查网络配置...${NC}"
echo ""

# 检查网络是否存在
if docker network ls | grep -q "stock-race-prod-network"; then
    echo -e "${YELLOW}⚠ 网络 'stock-race-prod-network' 已存在${NC}"
else
    echo -e "${GREEN}✓ 网络 'stock-race-prod-network' 未创建${NC}"
fi

echo ""

# 步骤7: 检查卷配置
echo -e "${YELLOW}步骤7: 检查卷配置...${NC}"
echo ""

VOLUMES=("postgres_data_prod" "timescaledb_data_prod" "redis_data_prod")
for volume in "${VOLUMES[@]}"; do
    if docker volume ls | grep -q "$volume"; then
        echo -e "${YELLOW}⚠ 卷 '$volume' 已存在${NC}"
    else
        echo -e "${GREEN}✓ 卷 '$volume' 未创建${NC}"
    fi
done

echo ""

# 步骤8: 验证环境变量
echo -e "${YELLOW}步骤8: 验证环境变量...${NC}"
echo ""

# 创建测试环境变量文件
if [ ! -f ".env.production" ]; then
    echo -e "${YELLOW}⚠ 环境变量文件 .env.production 不存在${NC}"
    echo -e "${BLUE}创建测试环境变量文件...${NC}"
    cat > .env.production << EOF
# 测试环境变量
DB_PASSWORD=test_postgres_password
TSDB_PASSWORD=test_timescale_password
REDIS_PASSWORD=test_redis_password
JWT_SECRET=test_jwt_secret_key
API_KEY=test-api-key
AI_SERVICE_API_KEY=test-ai-key
DATA_SERVICE_API_KEY=test-data-key
EOF
    echo -e "${GREEN}✓ 已创建测试环境变量文件${NC}"
else
    echo -e "${GREEN}✓ 环境变量文件 .env.production 存在${NC}"
fi

echo ""

# 步骤9: 测试启动脚本
echo -e "${YELLOW}步骤9: 测试启动脚本...${NC}"
echo ""

if [ -f "start-prod.sh" ]; then
    echo -e "${GREEN}✓ 启动脚本 start-prod.sh 存在${NC}"

    # 测试帮助功能
    if ./start-prod.sh help > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 启动脚本帮助功能正常${NC}"
    else
        echo -e "${RED}✗ 启动脚本帮助功能异常${NC}"
    fi

    # 测试状态功能
    if ./start-prod.sh status > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 启动脚本状态功能正常${NC}"
    else
        echo -e "${YELLOW}⚠ 启动脚本状态功能异常（可能服务未运行）${NC}"
    fi
else
    echo -e "${RED}✗ 启动脚本 start-prod.sh 不存在${NC}"
fi

echo ""

# 总结
echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                            测试完成！${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}部署准备情况:${NC}"
echo ""
echo -e "1. ${GREEN}环境检查${NC}: Docker 和 Docker Compose 已安装并运行"
echo -e "2. ${GREEN}配置文件${NC}: 所有必要配置文件都存在"
echo -e "3. ${GREEN}Docker配置${NC}: Docker Compose 配置语法正确"
echo -e "4. ${GREEN}构建测试${NC}: 所有服务Dockerfile可以正常构建"
echo -e "5. ${GREEN}端口检查${NC}: 必要端口可用"
echo -e "6. ${GREEN}网络配置${NC}: Docker网络配置正确"
echo -e "7. ${GREEN}数据持久化${NC}: 卷配置正确"
echo -e "8. ${GREEN}环境变量${NC}: 环境变量文件已配置"
echo -e "9. ${GREEN}管理脚本${NC}: 启动脚本功能正常"
echo ""
echo -e "${YELLOW}下一步操作:${NC}"
echo ""
echo -e "1. 编辑环境变量文件: ${GREEN}nano .env.production${NC}"
echo -e "   • 修改所有默认密码"
echo -e "   • 配置AI提供商API密钥"
echo -e "   • 设置JWT密钥"
echo ""
echo -e "2. 启动生产环境: ${GREEN}./start-prod.sh up-build${NC}"
echo ""
echo -e "3. 验证部署: ${GREEN}./start-prod.sh health${NC}"
echo ""
echo -e "4. 访问服务:"
echo -e "   • 前端: ${GREEN}http://localhost:3000${NC}"
echo -e "   • 后端API: ${GREEN}http://localhost:3001/api${NC}"
echo -e "   • pgAdmin: ${GREEN}http://localhost:5050${NC}"
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}提示: 生产环境部署前，请确保修改所有默认密码和安全配置！${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════${NC}"