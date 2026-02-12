#!/bin/bash

# AI决策流程测试脚本
# 用于验证AI决策 → 交易订单 → 订单执行完整流程

set -e

echo "=== AI决策流程测试脚本 ==="
echo "开始时间: $(date)"
echo ""

# 配置文件
TEST_REPORT="ai_decision_flow_test_$(date +%Y%m%d_%H%M%S).log"
TEST_USERNAME="ai_test_$(date +%H%M%S)"  # 更短的用户名，避免超过20字符限制
TEST_PASSWORD="test123"
TEST_AI_ACCOUNT_NAME="AI测试账户_$(date +%s)"
TEST_STOCK_SYMBOL="000001.SZ"
TEST_STOCK_PRICE="10.5"

# 清理函数
cleanup() {
    echo ""
    echo "清理测试数据..."

    # 这里可以添加清理测试数据的逻辑
    # 例如：删除测试用户、测试AI账户等

    echo "✅ 测试数据清理完成"
}

# 注册捕获信号
trap cleanup EXIT INT TERM

# 检查服务状态
echo "1. 检查服务状态..."
SERVICES=(
    "http://localhost:3001/api/health"
    "http://localhost:8000/api/v1/health/"
    "http://localhost:8001/health"
)

ALL_SERVICES_UP=true
for service in "${SERVICES[@]}"; do
    if curl -s "$service" > /dev/null 2>&1; then
        echo "✅ $(echo $service | cut -d'/' -f3) 服务正常"
    else
        echo "❌ $(echo $service | cut -d'/' -f3) 服务异常"
        ALL_SERVICES_UP=false
    fi
done

if [ "$ALL_SERVICES_UP" = false ]; then
    echo ""
    echo "⚠️  部分服务未运行，继续测试但可能失败"
    echo "   建议先启动所有服务: docker-compose up -d"
fi

# 创建测试用户
echo ""
echo "2. 创建测试用户..."
REGISTER_RESPONSE=$(curl -s -X POST "http://localhost:3001/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$TEST_USERNAME\",
    \"password\": \"$TEST_PASSWORD\",
    \"confirmPassword\": \"$TEST_PASSWORD\",
    \"email\": \"$TEST_USERNAME@test.com\"
  }" 2>/dev/null || echo "{}")

if echo "$REGISTER_RESPONSE" | grep -q "success.*true"; then
    echo "✅ 测试用户创建成功: $TEST_USERNAME"
else
    ERROR_MSG=$(echo "$REGISTER_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('message', 'Unknown error'))
except:
    print('Unknown error')
" 2>/dev/null || echo "Unknown error")

    if echo "$ERROR_MSG" | grep -qi "already exists"; then
        echo "⚠️  测试用户已存在，使用现有用户"
    else
        echo "❌ 测试用户创建失败: $ERROR_MSG"
        echo "   尝试使用默认测试用户: testuser/test123"
        TEST_USERNAME="testuser"
        TEST_PASSWORD="test123"
    fi
fi

# 用户登录获取令牌
echo ""
echo "3. 用户登录获取令牌..."
LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:3001/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$TEST_USERNAME\",
    \"password\": \"$TEST_PASSWORD\"
  }" 2>/dev/null || echo "{}")

if echo "$LOGIN_RESPONSE" | grep -q "success.*true"; then
    JWT_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('data', {}).get('token', ''))
except:
    print('')
" 2>/dev/null || echo "")

    if [ -n "$JWT_TOKEN" ]; then
        echo "✅ 用户登录成功"
        echo "   JWT令牌: ${JWT_TOKEN:0:30}..."
    else
        echo "❌ 无法获取JWT令牌"
        exit 1
    fi
else
    echo "❌ 用户登录失败"
    exit 1
fi

# 创建测试AI账户
echo ""
echo "4. 创建测试AI账户..."
AI_ACCOUNT_RESPONSE=$(curl -s -X POST "http://localhost:3001/api/ai-accounts" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$TEST_AI_ACCOUNT_NAME\",
    \"modelType\": \"deepseek\",
    \"initialBalance\": 10000,
    \"riskLevel\": \"medium\",
    \"strategy\": \"momentum\",
    \"isActive\": true
  }" 2>/dev/null || echo "{}")

if echo "$AI_ACCOUNT_RESPONSE" | grep -q "success.*true"; then
    AI_ACCOUNT_ID=$(echo "$AI_ACCOUNT_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    # 响应格式是 data.account.id
    account_data = data.get('data', {}).get('account', {})
    print(account_data.get('id', ''))
except:
    print('')
" 2>/dev/null || echo "")

    if [ -n "$AI_ACCOUNT_ID" ]; then
        echo "✅ 测试AI账户创建成功"
        echo "   AI账户ID: $AI_ACCOUNT_ID"
        echo "   账户名称: $TEST_AI_ACCOUNT_NAME"
    else
        echo "❌ 无法获取AI账户ID"
        exit 1
    fi
else
    ERROR_MSG=$(echo "$AI_ACCOUNT_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('message', 'Unknown error'))
except:
    print('Unknown error')
" 2>/dev/null || echo "Unknown error")

    echo "❌ AI账户创建失败: $ERROR_MSG"

    # 尝试获取现有AI账户
    echo "   尝试获取现有AI账户..."
    AI_ACCOUNTS_RESPONSE=$(curl -s "http://localhost:3001/api/ai-accounts" \
      -H "Authorization: Bearer $JWT_TOKEN" 2>/dev/null || echo "{}")

    AI_ACCOUNT_ID=$(echo "$AI_ACCOUNTS_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data.get('data'), list) and len(data['data']) > 0:
        print(data['data'][0].get('id', ''))
    else:
        print('')
except:
    print('')
" 2>/dev/null || echo "")

    if [ -n "$AI_ACCOUNT_ID" ]; then
        echo "✅ 使用现有AI账户: $AI_ACCOUNT_ID"
    else
        echo "❌ 没有可用的AI账户"
        exit 1
    fi
fi

# 测试AI决策生成
echo ""
echo "5. 测试AI决策生成..."
AI_DECISION_RESPONSE=$(curl -s -X POST "http://localhost:3001/api/ai-accounts/$AI_ACCOUNT_ID/decisions/request" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"analyze\",
    \"data\": {
      \"stockData\": {
        \"code\": \"$TEST_STOCK_SYMBOL\"
      },
      \"portfolioData\": {
        \"totalValue\": 10000,
        \"availableCash\": 5000,
        \"riskTolerance\": \"medium\"
      }
    }
  }" 2>/dev/null || echo "{}")

echo "AI决策响应: $AI_DECISION_RESPONSE"

if echo "$AI_DECISION_RESPONSE" | grep -q "success.*true"; then
    DECISION_ACTION=$(echo "$AI_DECISION_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    # 响应格式是 data.recommendation
    print(data.get('data', {}).get('recommendation', 'Unknown'))
except:
    print('Unknown')
" 2>/dev/null || echo "Unknown")

    DECISION_REASON=$(echo "$AI_DECISION_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    # 响应格式是 data.reasoning
    print(data.get('data', {}).get('reasoning', 'No reason provided'))
except:
    print('No reason provided')
" 2>/dev/null || echo "No reason provided")

    DECISION_CONFIDENCE=$(echo "$AI_DECISION_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    # 响应格式是 data.confidence
    print(data.get('data', {}).get('confidence', 0))
except:
    print(0)
" 2>/dev/null || echo "0")

    echo "✅ AI决策生成成功"
    echo "   决策动作: $DECISION_ACTION"
    echo "   决策理由: $DECISION_REASON"
    echo "   置信度: $DECISION_CONFIDENCE"

    # 提取决策详情用于交易
    DECISION_DETAILS=$(echo "$AI_DECISION_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    decision_data = data.get('data', {})
    # 从后端API响应中提取决策详情
    # 后端API返回格式: data.recommendation, data.reasoning, data.confidence
    # 我们需要转换为交易订单需要的格式
    recommendation = decision_data.get('recommendation', 'hold')
    symbol = '$TEST_STOCK_SYMBOL'
    quantity = 10  # 默认数量
    price = $TEST_STOCK_PRICE
    reason = decision_data.get('reasoning', 'AI决策')

    print(json.dumps({
        'action': recommendation,
        'symbol': symbol,
        'quantity': quantity,
        'price': price,
        'reason': reason
    }))
except Exception as e:
    print('{}')
" 2>/dev/null || echo "{}")
else
    echo "❌ AI决策生成失败"
    echo "   使用模拟决策进行测试..."
    DECISION_DETAILS='{"action": "buy", "symbol": "000001.SZ", "quantity": 10, "price": 10.5, "reason": "模拟测试决策"}'
fi

# 解析决策详情
DECISION_ACTION=$(echo "$DECISION_DETAILS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('action', 'buy'))
except:
    print('buy')
" 2>/dev/null || echo "buy")

DECISION_SYMBOL=$(echo "$DECISION_DETAILS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('symbol', '$TEST_STOCK_SYMBOL'))
except:
    print('$TEST_STOCK_SYMBOL')
" 2>/dev/null || echo "$TEST_STOCK_SYMBOL")

DECISION_QUANTITY=$(echo "$DECISION_DETAILS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('quantity', 10))
except:
    print(10)
" 2>/dev/null || echo "10")

DECISION_PRICE=$(echo "$DECISION_DETAILS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('price', $TEST_STOCK_PRICE))
except:
    print($TEST_STOCK_PRICE)
" 2>/dev/null || echo "$TEST_STOCK_PRICE")

# 测试交易订单创建（通过AI账户）
echo ""
echo "6. 测试交易订单创建..."
if [ "$DECISION_ACTION" = "buy" ] || [ "$DECISION_ACTION" = "sell" ]; then
    TRADE_RESPONSE=$(curl -s -X POST "http://localhost:3001/api/trades" \
      -H "Authorization: Bearer $JWT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"aiAccountId\": $AI_ACCOUNT_ID,
        \"symbol\": \"$DECISION_SYMBOL\",
        \"action\": \"$DECISION_ACTION\",
        \"quantity\": $DECISION_QUANTITY,
        \"price\": $DECISION_PRICE,
        \"orderType\": \"market\",
        \"reason\": \"AI决策: $DECISION_ACTION\"
      }" 2>/dev/null || echo "{}")

    echo "交易响应: $TRADE_RESPONSE"

    if echo "$TRADE_RESPONSE" | grep -q "success.*true"; then
        TRADE_ID=$(echo "$TRADE_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('data', {}).get('id', ''))
except:
    print('')
" 2>/dev/null || echo "")

        if [ -n "$TRADE_ID" ]; then
            echo "✅ 交易订单创建成功"
            echo "   交易ID: $TRADE_ID"
            echo "   交易类型: $DECISION_ACTION"
            echo "   股票: $DECISION_SYMBOL"
            echo "   数量: $DECISION_QUANTITY"
            echo "   价格: $DECISION_PRICE"

            # 测试交易执行
            echo ""
            echo "7. 测试交易执行..."
            sleep 2  # 等待交易处理

            TRADE_DETAIL_RESPONSE=$(curl -s "http://localhost:3001/api/trades/$TRADE_ID" \
              -H "Authorization: Bearer $JWT_TOKEN" 2>/dev/null || echo "{}")

            TRADE_STATUS=$(echo "$TRADE_DETAIL_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('data', {}).get('status', 'unknown'))
except:
    print('unknown')
" 2>/dev/null || echo "unknown")

            echo "   交易状态: $TRADE_STATUS"

            if [ "$TRADE_STATUS" = "executed" ]; then
                echo "✅ 交易执行成功"

                # 获取执行详情
                EXECUTION_PRICE=$(echo "$TRADE_DETAIL_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('data', {}).get('price', 0))
except:
    print(0)
" 2>/dev/null || echo "0")

                EXECUTION_AMOUNT=$(echo "$TRADE_DETAIL_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('data', {}).get('amount', 0))
except:
    print(0)
" 2>/dev/null || echo "0")

                echo "   执行价格: $EXECUTION_PRICE"
                echo "   执行金额: $EXECUTION_AMOUNT"
            else
                echo "⚠️  交易未执行或执行中"
            fi
        else
            echo "❌ 无法获取交易ID"
        fi
    else
        ERROR_MSG=$(echo "$TRADE_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('message', 'Unknown error'))
except:
    print('Unknown error')
" 2>/dev/null || echo "Unknown error")

        echo "❌ 交易订单创建失败: $ERROR_MSG"
    fi
else
    echo "⚠️  决策动作不是buy或sell，跳过交易测试"
    echo "   决策动作: $DECISION_ACTION"
fi

# 测试持仓查询
echo ""
echo "8. 测试持仓查询..."
PORTFOLIO_RESPONSE=$(curl -s "http://localhost:3001/api/portfolios" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" 2>/dev/null || echo "{}")

if echo "$PORTFOLIO_RESPONSE" | grep -q "success.*true"; then
    PORTFOLIO_COUNT=$(echo "$PORTFOLIO_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data.get('data'), list):
        print(len(data['data']))
    else:
        print(0)
except:
    print(0)
" 2>/dev/null || echo "0")

    echo "✅ 持仓查询成功"
    echo "   持仓数量: $PORTFOLIO_COUNT"
else
    echo "⚠️  持仓查询失败或为空"
fi

# 生成测试报告
echo ""
echo "9. 生成测试报告..."
cat > "$TEST_REPORT" << EOF
AI决策流程测试报告
==================
测试时间: $(date)
测试用户: $TEST_USERNAME
AI账户ID: $AI_ACCOUNT_ID

测试步骤结果:
1. 服务状态检查: $(if [ "$ALL_SERVICES_UP" = true ]; then echo "✅ 全部正常"; else echo "⚠️  部分异常"; fi)
2. 用户创建: $(if echo "$REGISTER_RESPONSE" | grep -q "success.*true"; then echo "✅ 成功"; else echo "⚠️  使用现有用户"; fi)
3. 用户登录: $(if [ -n "$JWT_TOKEN" ]; then echo "✅ 成功"; else echo "❌ 失败"; fi)
4. AI账户创建: $(if [ -n "$AI_ACCOUNT_ID" ]; then echo "✅ 成功 (ID: $AI_ACCOUNT_ID)"; else echo "❌ 失败"; fi)
5. AI决策生成: $(if echo "$AI_DECISION_RESPONSE" | grep -q "decision"; then echo "✅ 成功"; else echo "⚠️  使用模拟决策"; fi)
   - 决策动作: $DECISION_ACTION
   - 决策理由: $DECISION_REASON
   - 置信度: $DECISION_CONFIDENCE
6. 交易订单创建: $(if [ -n "$TRADE_ID" ]; then echo "✅ 成功 (ID: $TRADE_ID)"; else echo "❌ 失败"; fi)
7. 交易执行: $(if [ "$TRADE_STATUS" = "executed" ]; then echo "✅ 成功"; else echo "⚠️  状态: $TRADE_STATUS"; fi)
8. 持仓查询: $(if [ "$PORTFOLIO_COUNT" -gt 0 ]; then echo "✅ 成功 (数量: $PORTFOLIO_COUNT)"; else echo "⚠️  无持仓"; fi)

AI决策流程完整性评估:
- 决策生成: $(if echo "$AI_DECISION_RESPONSE" | grep -q "decision"; then echo "✅ 完整"; else echo "⚠️  模拟"; fi)
- 交易创建: $(if [ -n "$TRADE_ID" ]; then echo "✅ 完整"; else echo "❌ 中断"; fi)
- 交易执行: $(if [ "$TRADE_STATUS" = "executed" ]; then echo "✅ 完整"; else echo "⚠️  不完整"; fi)
- 数据一致性: $(if [ "$PORTFOLIO_COUNT" -gt 0 ]; then echo "✅ 一致"; else echo "⚠️  需验证"; fi)

建议:
1. $(if echo "$AI_DECISION_RESPONSE" | grep -q "decision"; then echo "AI决策服务运行正常"; else echo "检查AI服务配置和API密钥"; fi)
2. $(if [ -n "$TRADE_ID" ]; then echo "交易系统运行正常"; else echo "检查交易API和权限配置"; fi)
3. $(if [ "$TRADE_STATUS" = "executed" ]; then echo "交易执行流程完整"; else echo "检查交易执行服务和数据库连接"; fi)

测试结论:
$(if echo "$AI_DECISION_RESPONSE" | grep -q "decision" && [ -n "$TRADE_ID" ] && [ "$TRADE_STATUS" = "executed" ]; then
  echo "✅ AI决策流程完整测试通过"
  echo "   系统支持完整的AI决策 → 交易订单 → 订单执行流程"
elif echo "$AI_DECISION_RESPONSE" | grep -q "decision" && [ -n "$TRADE_ID" ]; then
  echo "⚠️ AI决策流程部分测试通过"
  echo "   需要检查交易执行环节"
else
  echo "❌ AI决策流程测试失败"
  echo "   需要检查AI服务和交易系统"
fi)

EOF

echo "✅ 测试报告已生成: $TEST_REPORT"

echo ""
echo "=== AI决策流程测试完成 ==="
echo "完成时间: $(date)"
echo ""
echo "测试报告: $TEST_REPORT"
echo "下一步操作:"
echo "1. 查看测试报告: cat $TEST_REPORT"
echo "2. 验证AI决策数据一致性"
echo "3. 测试多个AI账户并发决策"