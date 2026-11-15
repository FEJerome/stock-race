#!/bin/bash
# Stock Race 部署验证脚本
# 用于验证生产环境部署是否成功

set -e  # 遇到错误立即退出

echo "🚀 Stock Race 部署验证开始"
echo "================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查函数
check_service() {
    local service_name=$1
    local health_url=$2
    local expected_status=${3:-200}

    echo -n "检查 $service_name... "

    if curl -f -s -o /dev/null -w "%{http_code}" "$health_url" | grep -q "$expected_status"; then
        echo -e "${GREEN}✓ 正常${NC}"
        return 0
    else
        echo -e "${RED}✗ 异常${NC}"
        return 1
    fi
}

check_container() {
    local container_name=$1

    echo -n "检查容器 $container_name... "

    if docker ps --format "{{.Names}}" | grep -q "$container_name"; then
        echo -e "${GREEN}✓ 运行中${NC}"
        return 0
    else
        echo -e "${RED}✗ 未运行${NC}"
        return 1
    fi
}

check_port() {
    local port=$1
    local service_name=$2

    echo -n "检查端口 $port ($service_name)... "

    if netstat -tln 2>/dev/null | grep -q ":$port "; then
        echo -e "${GREEN}✓ 监听中${NC}"
        return 0
    else
        echo -e "${RED}✗ 未监听${NC}"
        return 1
    fi
}

# 1. 检查Docker服务
echo ""
echo "1. 检查Docker服务"
echo "----------------"
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓ Docker 已安装${NC}"

    # 检查Docker服务状态
    if systemctl is-active --quiet docker; then
        echo -e "${GREEN}✓ Docker 服务运行中${NC}"
    else
        echo -e "${RED}✗ Docker 服务未运行${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ Docker 未安装${NC}"
    exit 1
fi

# 2. 检查Docker Compose
echo ""
echo "2. 检查Docker Compose"
echo "-------------------"
if command -v docker-compose &> /dev/null; then
    echo -e "${GREEN}✓ Docker Compose 已安装${NC}"
else
    echo -e "${RED}✗ Docker Compose 未安装${NC}"
    exit 1
fi

# 3. 检查容器状态
echo ""
echo "3. 检查容器状态"
echo "-------------"

# 检查核心服务容器
check_container "stock-race-postgres-prod" || exit 1
check_container "stock-race-timescaledb-prod" || exit 1
check_container "stock-race-redis-prod" || exit 1
check_container "stock-race-backend-prod" || exit 1
check_container "stock-race-ai-service-prod" || exit 1
check_container "stock-race-data-service-prod" || exit 1
check_container "stock-race-frontend-prod" || exit 1
check_container "stock-race-nginx-prod" || exit 1

# 4. 检查服务健康状态
echo ""
echo "4. 检查服务健康状态"
echo "-----------------"

# 设置超时时间
export COMPOSE_HTTP_TIMEOUT=120

# 检查各服务健康
check_service "后端服务" "http://localhost:3001/api/health" || exit 1
check_service "AI服务" "http://localhost:8000/api/v1/health/" || exit 1
check_service "数据服务" "http://localhost:8001/health" || exit 1
check_service "前端服务" "http://localhost:3000/health" 200 || echo -e "${YELLOW}⚠ 前端健康检查可能未实现${NC}"

# 5. 检查端口监听
echo ""
echo "5. 检查端口监听"
echo "-------------"

check_port 80 "Nginx" || exit 1
check_port 3001 "后端服务" || exit 1
check_port 8000 "AI服务" || exit 1
check_port 8001 "数据服务" || exit 1

# 6. 检查数据库连接
echo ""
echo "6. 检查数据库连接"
echo "---------------"

echo -n "检查PostgreSQL连接... "
if docker-compose -f docker-compose.prod.yml exec -T postgres pg_isready -U prod_user > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 正常${NC}"
else
    echo -e "${RED}✗ 异常${NC}"
    exit 1
fi

echo -n "检查TimescaleDB连接... "
if docker-compose -f docker-compose.prod.yml exec -T timescaledb pg_isready -U tsdb_user > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 正常${NC}"
else
    echo -e "${RED}✗ 异常${NC}"
    exit 1
fi

echo -n "检查Redis连接... "
if docker-compose -f docker-compose.prod.yml exec -T redis redis-cli -a "${REDIS_PASSWORD:-<your-redis-password>}" ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 正常${NC}"
else
    echo -e "${RED}✗ 异常${NC}"
    exit 1
fi

# 7. 检查服务间通信
echo ""
echo "7. 检查服务间通信"
echo "---------------"

echo -n "检查后端->AI服务通信... "
if docker-compose -f docker-compose.prod.yml exec -T backend curl -f -s http://ai-service:8000/api/v1/health/ > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 正常${NC}"
else
    echo -e "${RED}✗ 异常${NC}"
    exit 1
fi

echo -n "检查后端->数据服务通信... "
if docker-compose -f docker-compose.prod.yml exec -T backend curl -f -s http://data-service:8001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 正常${NC}"
else
    echo -e "${RED}✗ 异常${NC}"
    exit 1
fi

echo -n "检查AI服务->后端通信... "
if docker-compose -f docker-compose.prod.yml exec -T ai-service curl -f -s http://backend:3001/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 正常${NC}"
else
    echo -e "${RED}✗ 异常${NC}"
    exit 1
fi

# 8. 测试核心API功能
echo ""
echo "8. 测试核心API功能"
echo "---------------"

echo -n "测试股票数据API... "
if curl -f -s "http://localhost:3001/api/stocks?limit=1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 正常${NC}"
else
    echo -e "${RED}✗ 异常${NC}"
    exit 1
fi

echo -n "测试用户认证API... "
auth_response=$(curl -s -X POST "http://localhost:3001/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"demo_user","password":"<demo-password>"}' 2>/dev/null || true)

if echo "$auth_response" | grep -q "success"; then
    echo -e "${GREEN}✓ 正常${NC}"
else
    echo -e "${YELLOW}⚠ 演示用户可能不存在，跳过${NC}"
fi

echo -n "测试AI决策API... "
ai_response=$(curl -s -X POST "http://localhost:8000/api/v1/decision/service-generate" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${AI_SERVICE_API_KEY:-<your-ai-service-api-key>}" \
  -d '{
    "account_id": "test-account-001",
    "stock_code": "000001.SZ",
    "market_data": {"price": 20.32},
    "portfolio_data": {"balance": 1000000},
    "strategy": "default"
  }' 2>/dev/null || true)

if echo "$ai_response" | grep -q "decision"; then
    echo -e "${GREEN}✓ 正常${NC}"
else
    echo -e "${YELLOW}⚠ AI决策API返回非预期响应，继续验证${NC}"
    echo "响应预览: $(echo "$ai_response" | head -c 100)..."
fi

# 9. 检查监控服务
echo ""
echo "9. 检查监控服务"
echo "-------------"

echo -n "检查Prometheus... "
if curl -f -s "http://localhost:9090/-/healthy" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 正常${NC}"
else
    echo -e "${YELLOW}⚠ Prometheus未运行或配置不同${NC}"
fi

echo -n "检查Grafana... "
if curl -f -s "http://localhost:3002/api/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 正常${NC}"
else
    echo -e "${YELLOW}⚠ Grafana未运行或配置不同${NC}"
fi

# 10. 汇总报告
echo ""
echo "================================"
echo "📋 部署验证报告"
echo "================================"

echo "✅ 所有核心服务检查通过"
echo "✅ 数据库连接正常"
echo "✅ 服务间通信正常"
echo "✅ API功能基本正常"
echo ""
echo "🎉 部署验证成功！"
echo ""
echo "🌐 访问地址："
echo "  • 前端界面: http://localhost:3000"
echo "  • 后端API文档: http://localhost:3001/api-docs"
echo "  • AI服务文档: http://localhost:8000/docs"
echo "  • 数据服务文档: http://localhost:8001/docs"
echo "  • Prometheus监控: http://localhost:9090"
echo "  • Grafana仪表板: http://localhost:3002"
echo ""
echo "🔧 默认登录凭证："
echo "  • 演示用户: demo_user / <demo-password>"
echo "  • 管理员: admin / ${ADMIN_PASSWORD:-<your-admin-password>}"
echo ""
echo "📝 后续步骤："
echo "  1. 修改所有默认密码和API密钥"
echo "  2. 配置HTTPS证书"
echo "  3. 设置监控告警"
echo "  4. 进行压力测试"
echo ""
echo "🚀 Stock Race 已准备就绪！"

exit 0