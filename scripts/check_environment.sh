#!/bin/bash

# Stock-Race环境检查脚本
# 检查所有依赖和服务状态

set -e

echo "🔍 Stock-Race项目环境检查"
echo "=========================="
echo ""

# 1. 检查Node.js和npm
echo "1. 检查Node.js和npm..."
node --version 2>/dev/null && echo "  ✅ Node.js: $(node --version)" || echo "  ❌ Node.js未安装"
npm --version 2>/dev/null && echo "  ✅ npm: $(npm --version)" || echo "  ❌ npm未安装"
echo ""

# 2. 检查Python
echo "2. 检查Python..."
python3 --version 2>/dev/null && echo "  ✅ Python3: $(python3 --version)" || echo "  ❌ Python3未安装"
python3 -c "import pip" 2>/dev/null && echo "  ✅ pip已安装" || echo "  ❌ pip未安装"
echo ""

# 3. 检查数据库服务
echo "3. 检查数据库服务..."

# PostgreSQL
if pgrep postgres >/dev/null; then
    echo "  ✅ PostgreSQL正在运行"
else
    echo "  ❌ PostgreSQL未运行"
    echo "    启动命令: sudo systemctl start postgresql"
fi

# Redis
if pgrep redis >/dev/null; then
    echo "  ✅ Redis正在运行"
else
    echo "  ❌ Redis未运行"
    echo "    安装命令: sudo apt-get install -y redis-server"
    echo "    启动命令: sudo systemctl start redis-server"
fi
echo ""

# 4. 检查项目依赖
echo "4. 检查项目依赖..."

# 后端依赖
if [ -d "/home/fe-jerome/projects/stock-race/backend/node_modules" ]; then
    echo "  ✅ 后端依赖已安装"
else
    echo "  ⚠️  后端依赖未安装"
    echo "    安装命令: cd backend && npm install"
fi

# 前端依赖
if [ -d "/home/fe-jerome/projects/stock-race/frontend/node_modules" ]; then
    echo "  ✅ 前端依赖已安装"
else
    echo "  ⚠️  前端依赖未安装"
    echo "    安装命令: cd frontend && npm install"
fi

# AI服务依赖
if [ -d "/home/fe-jerome/projects/stock-race/ai-service/venv" ] || python3 -c "import fastapi" 2>/dev/null; then
    echo "  ✅ AI服务依赖已安装"
else
    echo "  ⚠️  AI服务依赖未安装"
    echo "    安装命令: cd ai-service && pip install -r requirements.txt"
fi

# 数据服务依赖
if [ -d "/home/fe-jerome/projects/stock-race/data-service/venv" ] || python3 -c "import fastapi" 2>/dev/null; then
    echo "  ✅ 数据服务依赖已安装"
else
    echo "  ⚠️  数据服务依赖未安装"
    echo "    安装命令: cd data-service && pip install -r requirements.txt"
fi
echo ""

# 5. 检查端口占用
echo "5. 检查端口占用..."
ports=(3000 3001 8000 8001)
for port in "${ports[@]}"; do
    if ss -tuln | grep ":$port " >/dev/null; then
        echo "  ⚠️  端口 $port 已被占用"
    else
        echo "  ✅ 端口 $port 可用"
    fi
done
echo ""

# 6. 总结和建议
echo "📋 环境检查总结"
echo "==============="
echo ""
echo "🚀 启动所有服务（需要在4个终端分别执行）："
echo ""
echo "# 终端1：后端服务（端口3001）"
echo "cd /home/fe-jerome/projects/stock-race/backend"
echo "npm run dev"
echo ""
echo "# 终端2：AI服务（端口8000）"
echo "cd /home/fe-jerome/projects/stock-race/ai-service"
echo "python -m uvicorn ai_service.main:app --reload --host 0.0.0.0 --port 8000"
echo ""
echo "# 终端3：数据服务（端口8001）"
echo "cd /home/fe-jerome/projects/stock-race/data-service"
echo "python -m uvicorn data_service.main:app --reload --host 0.0.0.0 --port 8001"
echo ""
echo "# 终端4：前端服务（端口3000）"
echo "cd /home/fe-jerome/projects/stock-race/frontend"
echo "npm run dev"
echo ""
echo "🔍 验证服务健康："
echo "curl http://localhost:3001/api/health      # 后端"
echo "curl http://localhost:8000/api/v1/health/  # AI服务"
echo "curl http://localhost:8001/health          # 数据服务"
echo "curl http://localhost:3000                 # 前端"
echo ""
echo "📊 访问服务："
echo "- 前端界面: http://localhost:3000"
echo "- 后端API文档: http://localhost:3001/api-docs"
echo "- AI服务文档: http://localhost:8000/docs"
echo "- 数据服务文档: http://localhost:8001/docs"
echo ""
echo "⚠️  注意："
echo "1. 确保Redis服务已启动（如果未安装请先安装）"
echo "2. 确保所有依赖已安装"
echo "3. 如果端口被占用，需要停止占用端口的服务或修改配置"
echo "4. 首次启动可能需要一些时间初始化"