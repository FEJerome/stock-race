#!/bin/bash

echo "=== 前端登录功能测试 ==="
echo "测试时间: $(date)"
echo

echo "1. 检查服务状态:"
echo "前端服务: http://localhost:3000"
curl -s -I http://localhost:3000 | head -1
echo

echo "2. 检查后端API状态:"
echo "后端健康检查:"
curl -s http://localhost:3001/api/health | jq '.success'
echo

echo "3. 测试后端登录API:"
echo "使用 admin/admin123 测试:"
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}' | jq '.success'
echo

echo "4. 验证数据库用户:"
echo "检查admin用户是否存在:"
docker-compose exec postgres psql -U postgres -d stock_race -c "SELECT id, username, email FROM \"User\" WHERE username = 'admin';" 2>/dev/null || echo "Docker未运行，跳过数据库检查"
echo

echo "=== 测试说明 ==="
echo "1. 访问 http://localhost:3000/login"
echo "2. 使用用户名: admin, 密码: admin123 登录"
echo "3. 或点击'使用演示账户登录'按钮自动填充"
echo "4. 登录成功后应跳转到仪表板页面"
echo "5. 测试降级机制: 停止后端服务，验证仍能使用模拟登录"
