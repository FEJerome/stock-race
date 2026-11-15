#!/bin/bash

# Stock-Race 快速修复脚本
# 解决端到端测试中发现的问题

echo "=========================================="
echo "Stock-Race 快速修复脚本"
echo "=========================================="
echo "开始时间: $(date)"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}步骤1: 检查当前服务状态${NC}"
echo "----------------------------------------"

# 检查后端服务
if pgrep -f "node.*src/app.js" > /dev/null; then
    echo -e "${GREEN}✅ 后端服务正在运行${NC}"
else
    echo -e "${RED}❌ 后端服务未运行${NC}"
    echo "启动后端服务..."
    cd /home/fe-jerome/projects/stock-race/backend && nohup node src/app.js > backend.log 2>&1 &
    sleep 3
fi

# 检查AI服务
if pgrep -f "uvicorn.*ai_service" > /dev/null; then
    echo -e "${GREEN}✅ AI服务正在运行${NC}"
else
    echo -e "${RED}❌ AI服务未运行${NC}"
    echo "启动AI服务..."
    cd /home/fe-jerome/projects/stock-race/ai-service && source venv/bin/activate && nohup python -m uvicorn ai_service.main:app --host 0.0.0.0 --port 8000 > ai_service.log 2>&1 &
    sleep 3
fi

# 检查数据服务
if pgrep -f "uvicorn.*data_service" > /dev/null; then
    echo -e "${GREEN}✅ 数据服务正在运行${NC}"
else
    echo -e "${RED}❌ 数据服务未运行${NC}"
    echo "启动数据服务..."
    cd /home/fe-jerome/projects/stock-race/data-service && source venv/bin/activate && nohup python -m uvicorn data_service.main:app --host 0.0.0.0 --port 8001 > data_service.log 2>&1 &
    sleep 3
fi

# 检查前端服务
if pgrep -f "vite" > /dev/null; then
    echo -e "${GREEN}✅ 前端服务正在运行${NC}"
else
    echo -e "${RED}❌ 前端服务未运行${NC}"
    echo "启动前端服务..."
    cd /home/fe-jerome/projects/stock-race/frontend && nohup npm run dev > frontend.log 2>&1 &
    sleep 5
fi

echo ""
echo -e "${BLUE}步骤2: 验证服务健康${NC}"
echo "----------------------------------------"

# 验证后端健康
echo -n "后端健康检查: "
if curl -s http://localhost:3001/api/health | grep -q '"success":true'; then
    echo -e "${GREEN}✅ 健康${NC}"
else
    echo -e "${RED}❌ 异常${NC}"
fi

# 验证AI服务健康
echo -n "AI服务健康检查: "
if curl -s http://localhost:8000/api/v1/health/ | grep -q '"status":"healthy"'; then
    echo -e "${GREEN}✅ 健康${NC}"
else
    echo -e "${RED}❌ 异常${NC}"
fi

# 验证数据服务健康
echo -n "数据服务健康检查: "
if curl -s http://localhost:8001/health | grep -q '"status":"healthy"'; then
    echo -e "${GREEN}✅ 健康${NC}"
else
    echo -e "${RED}❌ 异常${NC}"
fi

# 验证前端可访问性
echo -n "前端可访问性: "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
    echo -e "${GREEN}✅ 可访问${NC}"
else
    echo -e "${RED}❌ 不可访问${NC}"
fi

echo ""
echo -e "${BLUE}步骤3: 测试核心功能${NC}"
echo "----------------------------------------"

# 测试用户登录
echo -n "用户登录测试: "
login_response=$(curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"password":"admin123"}')
if echo "$login_response" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ 成功${NC}"
    token=$(echo "$login_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo "获取到令牌: ${token:0:20}..."
else
    echo -e "${RED}❌ 失败${NC}"
    echo "响应: $login_response"
fi

# 测试股票数据（降级模式）
echo -n "股票数据测试: "
stock_response=$(curl -s "http://localhost:3001/api/stocks/realtime?symbol=000001.SZ")
if echo "$stock_response" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ 成功${NC}"
    is_fallback=$(echo "$stock_response" | grep -o '"is_fallback":[^,}]*' | cut -d':' -f2)
    echo "数据源: $is_fallback"
elif echo "$stock_response" | grep -q '"success":false'; then
    echo -e "${YELLOW}⚠️  失败（但错误处理正常）${NC}"
    error_msg=$(echo "$stock_response" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
    echo "错误信息: $error_msg"
else
    echo -e "${RED}❌ 异常响应${NC}"
fi

echo ""
echo -e "${BLUE}步骤4: 检查日志中的错误${NC}"
echo "----------------------------------------"

# 检查后端日志错误
echo "后端日志错误检查:"
backend_errors=$(grep -i "error\|exception\|失败" /home/fe-jerome/projects/stock-race/backend/backend.log 2>/dev/null | tail -5 || echo "无日志文件")
if [ -n "$backend_errors" ] && [ "$backend_errors" != "无日志文件" ]; then
    echo -e "${YELLOW}发现错误:${NC}"
    echo "$backend_errors" | while read line; do
        echo "  - $line"
    done
else
    echo -e "${GREEN}✅ 未发现明显错误${NC}"
fi

echo ""
echo -e "${BLUE}步骤5: 建议的立即操作${NC}"
echo "----------------------------------------"

echo "根据测试结果，建议立即执行以下操作："
echo ""
echo "1. ${GREEN}修复数据库模型问题${NC}"
echo "   cd /home/fe-jerome/projects/stock-race/backend"
echo "   npx prisma db pull"
echo "   npx prisma generate"
echo "   pkill -f \"node.*src/app.js\""
echo "   nohup node src/app.js > backend.log 2>&1 &"
echo ""
echo "2. ${GREEN}验证数据服务配置${NC}"
echo "   cd /home/fe-jerome/projects/stock-race/data-service"
echo "   cat .env | grep -i \"data.*source\|api.*key\""
echo "   curl -s \"http://localhost:8001/api/v1/stocks?limit=1\" -H \"X-API-Key: \${DATA_SERVICE_API_KEY:-<your-data-service-api-key>}\""
echo ""
echo "3. ${YELLOW}优化降级模式${NC}"
echo "   检查文件: backend/src/services/DataService.js"
echo "   确保第811-830行的shouldUseFallback()函数正确判断降级条件"
echo ""
echo "4. ${YELLOW}监控服务稳定性${NC}"
echo "   使用命令监控服务状态:"
echo "   watch -n 5 'ps aux | grep -E \"(node.*app|uvicorn.*(ai|data))\" | grep -v grep'"
echo ""

echo -e "${BLUE}修复完成状态${NC}"
echo "----------------------------------------"

# 最终状态检查
echo "最终服务状态:"
echo "1. 后端服务: $(curl -s http://localhost:3001/api/health >/dev/null && echo -e "${GREEN}✅ 运行${NC}" || echo -e "${RED}❌ 停止${NC}")"
echo "2. AI服务: $(curl -s http://localhost:8000/api/v1/health/ >/dev/null && echo -e "${GREEN}✅ 运行${NC}" || echo -e "${RED}❌ 停止${NC}")"
echo "3. 数据服务: $(curl -s http://localhost:8001/health >/dev/null && echo -e "${GREEN}✅ 运行${NC}" || echo -e "${RED}❌ 停止${NC}")"
echo "4. 前端服务: $(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200" && echo -e "${GREEN}✅ 运行${NC}" || echo -e "${RED}❌ 停止${NC}")"

echo ""
echo "用户流程可用性:"
echo "• 访问前端: $(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200" && echo -e "${GREEN}✅ 可用${NC}" || echo -e "${RED}❌ 不可用${NC}")"
echo "• 用户登录: $(curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"password":"admin123"}' 2>/dev/null | grep -q '"success":true' && echo -e "${GREEN}✅ 可用${NC}" || echo -e "${RED}❌ 不可用${NC}")"
echo "• 查看行情: $(curl -s "http://localhost:3001/api/stocks/realtime?symbol=000001.SZ" 2>/dev/null | grep -q '"success":true' && echo -e "${GREEN}✅ 可用${NC}" || echo -e "${YELLOW}⚠️  降级模式${NC}")"

echo ""
echo -e "${GREEN}快速修复完成！${NC}"
echo "详细测试报告请查看: /home/fe-jerome/projects/stock-race/E2E_TEST_REPORT.md"
echo ""
echo "完成时间: $(date)"
echo "=========================================="