#!/bin/bash
# MCP SSE 连接测试

echo "=== MCP SSE 连接测试 ==="
echo ""

# 使用 curl 连接到 SSE 端点
echo "连接到 SSE 端点..."
curl -s -N http://192.168.110.146:9420/sse \
  -H "Accept: text/event-stream" \
  -H "Cache-Control: no-cache" &

CURL_PID=$!
echo "连接 PID: $CURL_PID"

# 等待几秒接收事件
sleep 3

# 结束连接
kill $CURL_PID 2>/dev/null

echo ""
echo "SSE 测试完成"
