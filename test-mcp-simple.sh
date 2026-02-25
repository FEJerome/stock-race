#!/bin/bash
# MCP 连通性测试脚本

echo "========================================"
echo "  MCP 连通性测试"
echo "========================================"
echo ""

MCP_URL="http://192.168.110.146:9420"

# 测试 1: 健康检查
echo "[测试 1] 健康检查..."
HEALTH=$(curl -s ${MCP_URL}/health 2>/dev/null)
if [ $? -eq 0 ] && [ -n "$HEALTH" ]; then
    echo "✅ 健康检查通过"
    echo "   响应: $HEALTH"
else
    echo "❌ 健康检查失败"
    exit 1
fi

echo ""

# 测试 2: 服务状态
echo "[测试 2] 服务状态..."
STATUS=$(curl -s ${MCP_URL}/status 2>/dev/null)
if [ $? -eq 0 ] && [ -n "$STATUS" ]; then
    echo "✅ 服务状态正常"
    echo "   响应: $STATUS" | python3 -m json.tool 2>/dev/null || echo "   响应: $STATUS"
else
    echo "❌ 获取状态失败"
    exit 1
fi

echo ""

# 测试 3: MCP 端点
echo "[测试 3] MCP 端点..."
ENDPOINTS=$(curl -s ${MCP_URL} 2>/dev/null)
if [ $? -eq 0 ] && [ -n "$ENDPOINTS" ]; then
    echo "✅ MCP 端点可用"
    echo "   响应: $ENDPOINTS" | python3 -m json.tool 2>/dev/null || echo "   响应: $ENDPOINTS"
else
    echo "❌ 获取端点失败"
    exit 1
fi

echo ""
echo "========================================"
echo "  ✅ 所有测试通过！"
echo "========================================"
echo ""
echo "MCP 服务配置:"
echo "  URL: ${MCP_URL}"
echo "  SSE: ${MCP_URL}/sse"
echo ""
echo "可以在 Claude Code 中使用 MCP 工具了！"
