#!/bin/bash

echo "=== 市场状态优化功能测试 ==="
echo "测试时间: $(date)"
echo

# 1. 测试数据服务端点
echo "1. 测试数据服务端点 (http://localhost:8001/api/v2/market/status)"
DATA_SERVICE_RESPONSE=$(curl -s -f http://localhost:8001/api/v2/market/status 2>/dev/null)
if [ $? -eq 0 ]; then
  echo "   ✓ 数据服务端点访问成功"
  echo "   响应内容:"
  echo "$DATA_SERVICE_RESPONSE" | python3 -m json.tool | head -30
else
  echo "   ✗ 数据服务端点访问失败"
fi
echo

# 2. 测试后端API端点
echo "2. 测试后端API端点 (http://localhost:3001/api/market/status)"
BACKEND_RESPONSE=$(curl -s -f http://localhost:3001/api/market/status 2>/dev/null)
if [ $? -eq 0 ]; then
  echo "   ✓ 后端API端点访问成功"
  echo "   响应内容:"
  echo "$BACKEND_RESPONSE" | python3 -m json.tool | head -30

  # 解析关键字段
  STATUS=$(echo "$BACKEND_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['data']['status'])" 2>/dev/null)
  DESCRIPTION=$(echo "$BACKEND_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['data']['description'])" 2>/dev/null)
  DATA_SERVICE_STATUS=$(echo "$BACKEND_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['data']['data_service_status'])" 2>/dev/null)
  DATA_STATUS=$(echo "$BACKEND_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['data']['data_status'])" 2>/dev/null)

  echo
  echo "   关键字段分析:"
  echo "   - 市场状态: $STATUS"
  echo "   - 描述: $DESCRIPTION"
  echo "   - 数据服务状态: $DATA_SERVICE_STATUS"
  echo "   - 数据状态: $DATA_STATUS"

  # 验证市场状态不是"unknown"
  if [ "$STATUS" != "unknown" ]; then
    echo "   ✓ 市场状态明确: $STATUS"
  else
    echo "   ⚠️  市场状态为unknown"
  fi

  # 验证描述不包含"降级"
  if [[ ! "$DESCRIPTION" == *"降级"* ]]; then
    echo "   ✓ 描述不包含'降级'字样"
  else
    echo "   ⚠️  描述包含'降级'字样: $DESCRIPTION"
  fi
else
  echo "   ✗ 后端API端点访问失败"
fi
echo

# 3. 检查服务运行状态
echo "3. 检查服务运行状态"
echo "   前端服务 (localhost:3000): $(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)"
echo "   后端服务 (localhost:3001): $(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health)"
echo "   数据服务 (localhost:8001): $(curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/health)"
echo "   AI服务 (localhost:8000): $(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/health/)"
echo

# 4. 当前时间分析
echo "4. 当前时间分析"
CURRENT_HOUR=$(date +%H)
CURRENT_MINUTE=$(date +%M)
CURRENT_DAY=$(date +%u)  # 1=周一, 7=周日
echo "   当前时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "   星期: $CURRENT_DAY (1=周一, 7=周日)"
echo "   小时:分钟: $CURRENT_HOUR:$CURRENT_MINUTE"

# 判断A股交易时间
if [ $CURRENT_DAY -ge 1 ] && [ $CURRENT_DAY -le 5 ]; then
  if ([ $CURRENT_HOUR -eq 9 ] && [ $CURRENT_MINUTE -ge 30 ]) || \
     ([ $CURRENT_HOUR -ge 10 ] && [ $CURRENT_HOUR -lt 11 ]) || \
     ([ $CURRENT_HOUR -eq 11 ] && [ $CURRENT_MINUTE -lt 30 ]) || \
     ([ $CURRENT_HOUR -eq 13 ] && [ $CURRENT_MINUTE -ge 0 ]) || \
     ([ $CURRENT_HOUR -ge 14 ] && [ $CURRENT_HOUR -lt 15 ]) || \
     ([ $CURRENT_HOUR -eq 15 ] && [ $CURRENT_MINUTE -eq 0 ]); then
    EXPECTED_STATUS="open"
    echo "   📈 当前是A股交易时间"
  elif ([ $CURRENT_HOUR -eq 11 ] && [ $CURRENT_MINUTE -ge 30 ]) || \
       ([ $CURRENT_HOUR -eq 12 ]) || \
       ([ $CURRENT_HOUR -eq 13 ] && [ $CURRENT_MINUTE -lt 0 ]); then
    EXPECTED_STATUS="lunch_break"
    echo "   🍱 当前是午间休市时间"
  elif ([ $CURRENT_HOUR -lt 9 ]) || ([ $CURRENT_HOUR -eq 9 ] && [ $CURRENT_MINUTE -lt 30 ]); then
    EXPECTED_STATUS="pre_open"
    echo "   ⏰ 当前是开盘前时间"
  elif ([ $CURRENT_HOUR -ge 15 ]) || ([ $CURRENT_HOUR -eq 15 ] && [ $CURRENT_MINUTE -gt 0 ]); then
    EXPECTED_STATUS="after_hours"
    echo "   🌙 当前是收盘后时间"
  else
    EXPECTED_STATUS="closed"
    echo "   🔒 当前是收盘时间"
  fi
else
  EXPECTED_STATUS="weekend"
  echo "   🏖️  当前是周末休市时间"
fi

echo
echo "=== 测试完成 ==="
echo "预期市场状态: $EXPECTED_STATUS"
echo "实际市场状态: $STATUS"
echo
if [ "$STATUS" == "$EXPECTED_STATUS" ]; then
  echo "✅ 市场状态分类正确！"
else
  echo "⚠️  市场状态分类可能需要调整"
fi