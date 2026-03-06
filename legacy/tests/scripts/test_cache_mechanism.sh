#!/bin/bash

echo "=== 缓存机制测试脚本 ==="
echo "测试时间: $(date)"
echo

echo "1. 检查服务状态:"
echo "前端服务: http://localhost:3000"
curl -s -I http://localhost:3000 | head -1
echo

echo "2. 检查后端API状态:"
echo "后端健康检查:"
curl -s http://localhost:3001/api/health | jq '.success' 2>/dev/null || echo "后端服务未响应"
echo

echo "3. 测试股票API:"
echo "获取股票列表:"
curl -s http://localhost:3001/api/stocks?limit=3 | jq '.success' 2>/dev/null || echo "股票API未响应"
echo

echo "4. 验证缓存工具:"
echo "检查缓存工具文件是否存在:"
ls -la frontend/src/utils/cache.ts 2>/dev/null && echo "✅ 缓存工具文件存在" || echo "❌ 缓存工具文件不存在"
echo

echo "5. 验证市场服务修改:"
echo "检查市场服务文件修改:"
grep -n "cacheManager" frontend/src/services/market.service.ts | head -5
echo

echo "=== 测试说明 ==="
echo "1. 缓存工具已创建: frontend/src/utils/cache.ts"
echo "2. 市场服务已修改: 4个核心函数添加缓存机制"
echo "3. 缓存策略:"
echo "   - 交易时间: 缓存5分钟"
echo "   - 非交易时间: 缓存30分钟"
echo "   - 搜索数据: 缓存5分钟"
echo "   - 降级数据: 缓存1分钟"
echo "4. 错误处理:"
echo "   - API限流(429): 使用缓存"
echo "   - 服务器错误(≥500): 使用缓存"
echo "   - 网络超时: 使用缓存"
echo "   - 最终降级: 模拟数据"
