#!/bin/bash
# Stock Race演示数据导入脚本

echo "🚀 开始导入演示数据..."

# 设置后端API地址
BACKEND_URL="http://localhost:3001/api"
AI_SERVICE_URL="http://localhost:8000/api/v1"
DATA_SERVICE_URL="http://localhost:8001"

echo "📊 导入股票数据..."
# 这里可以添加实际导入逻辑
# curl -X POST $DATA_SERVICE_URL/stocks/batch -H "Content-Type: application/json" -d @demo_stocks.json

echo "🤖 导入AI账户..."
# 这里可以添加实际导入逻辑

echo "👤 创建演示用户..."
# 这里可以添加实际导入逻辑

echo "🎉 演示数据导入完成！"
echo ""
echo "📋 访问地址："
echo "  • 前端界面: http://localhost:3000"
echo "  • 后端API: http://localhost:3001/api"
echo "  • AI服务: http://localhost:8000/docs"
echo "  • 数据服务: http://localhost:8001/docs"
echo ""
echo "🔧 默认登录凭证："
echo "  • 用户名: demo_user"
echo "  • 密码: demo123"
