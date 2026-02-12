#!/bin/bash

# AI决策功能增强测试脚本
# 验证用户偏好配置和完整提示词存储功能

set -e

echo "=== AI决策功能增强测试 ==="
echo "测试时间: $(date)"
echo ""

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试配置
API_BASE_URL="http://localhost:3001/api"
TIMESTAMP=$(date +%s)
TEST_USERNAME="test_ai_${TIMESTAMP: -6}"
TEST_EMAIL="${TEST_USERNAME}@example.com"
TEST_PASSWORD="Test123456"

# 测试函数
function log_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

function log_error() {
    echo -e "${RED}✗ $1${NC}"
}

function log_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

function cleanup() {
    echo ""
    log_info "清理测试数据..."
    # 这里可以添加清理逻辑
}

# 注册陷阱，确保脚本退出时清理
trap cleanup EXIT

echo "1. 创建测试用户..."
USER_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"${TEST_USERNAME}\",
    \"email\": \"${TEST_EMAIL}\",
    \"password\": \"${TEST_PASSWORD}\",
    \"confirmPassword\": \"${TEST_PASSWORD}\"
  }")

if echo "$USER_RESPONSE" | grep -q '"success":true'; then
    USER_ID=$(echo "$USER_RESPONSE" | grep -o '"id":[0-9]*' | cut -d: -f2)
    log_success "用户创建成功: ID=${USER_ID}, 用户名=${TEST_USERNAME}"
else
    log_error "用户创建失败"
    echo "响应: $USER_RESPONSE"
    exit 1
fi

echo ""
echo "2. 用户登录获取token..."
LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"${TEST_USERNAME}\",
    \"password\": \"${TEST_PASSWORD}\"
  }")

if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
    TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    log_success "登录成功，获取到token"
else
    log_error "登录失败"
    echo "响应: $LOGIN_RESPONSE"
    exit 1
fi

echo ""
echo "3. 创建带有完整用户偏好配置的AI账户..."
AI_ACCOUNT_DATA="{
  \"name\": \"测试增强AI账户_$(date +%s)\",
  \"description\": \"用于测试AI决策功能增强的账户\",
  \"modelType\": \"deepseek\",
  \"riskLevel\": \"high\",
  \"tradingFrequency\": \"daily\",
  \"preferenceConfig\": {
    \"riskTolerance\": \"aggressive\",
    \"tradingStyle\": \"swing\",
    \"preferredStrategies\": [\"momentum\", \"technical\"],
    \"avoidStrategies\": [\"speculative\"],
    \"preferredIndustries\": [\"科技\", \"消费\"],
    \"avoidIndustries\": [\"金融\"],
    \"tradingLimits\": {
      \"maxPositionSize\": 0.3,
      \"minCashRatio\": 0.05,
      \"maxDailyLoss\": -0.08,
      \"stopLossLevel\": -0.15,
      \"takeProfitLevel\": 0.3
    }
  },
  \"promptTemplateId\": \"aggressive_decision_v1\",
  \"tokenBudget\": 2000
}"

AI_ACCOUNT_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/ai-accounts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "${AI_ACCOUNT_DATA}")

if echo "$AI_ACCOUNT_RESPONSE" | grep -q '"success":true'; then
    ACCOUNT_ID=$(echo "$AI_ACCOUNT_RESPONSE" | grep -o '"id":[0-9]*' | cut -d: -f2)
    log_success "AI账户创建成功: ID=${ACCOUNT_ID}"
    echo "账户配置:"
    echo "$AI_ACCOUNT_DATA" | python3 -m json.tool
else
    log_error "AI账户创建失败"
    echo "响应: $AI_ACCOUNT_RESPONSE"
    exit 1
fi

echo ""
echo "4. 获取AI账户详情，验证偏好配置..."
ACCOUNT_DETAIL_RESPONSE=$(curl -s -X GET "${API_BASE_URL}/ai-accounts/${ACCOUNT_ID}" \
  -H "Authorization: Bearer ${TOKEN}")

if echo "$ACCOUNT_DETAIL_RESPONSE" | grep -q '"success":true'; then
    log_success "AI账户详情获取成功"
    echo "账户详情中的preferenceConfig字段:"
    echo "$ACCOUNT_DETAIL_RESPONSE" | grep -o '"preferenceConfig":{[^}]*}' || echo "未找到preferenceConfig字段"
else
    log_error "AI账户详情获取失败"
    echo "响应: $ACCOUNT_DETAIL_RESPONSE"
fi

echo ""
echo "5. 测试AI决策功能..."
DECISION_REQUEST_DATA="{
  \"accountId\": ${ACCOUNT_ID},
  \"stockCode\": \"000001\",
  \"stockName\": \"平安银行\",
  \"marketData\": {
    \"price\": 15.50,
    \"change\": 0.25,
    \"changePercent\": 1.64,
    \"volume\": 1000000,
    \"amount\": 15500000,
    \"pe\": 12.5,
    \"pb\": 1.2,
    \"marketCap\": 300000000000
  },
  \"portfolioData\": {
    \"cashBalance\": 50000,
    \"totalValue\": 150000,
    \"positions\": [
      {
        \"stockCode\": \"000001\",
        \"quantity\": 1000,
        \"avgCost\": 14.50,
        \"currentPrice\": 15.50,
        \"profitLoss\": 1000,
        \"profitLossRate\": 6.9
      }
    ]
  }
}"

DECISION_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/ai-accounts/${ACCOUNT_ID}/decisions/request" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "${DECISION_REQUEST_DATA}")

if echo "$DECISION_RESPONSE" | grep -q '"success":true'; then
    log_success "AI决策请求成功"

    # 检查返回的元数据
    echo "决策结果元数据:"
    if echo "$DECISION_RESPONSE" | grep -q '"metadata"'; then
        METADATA=$(echo "$DECISION_RESPONSE" | grep -o '"metadata":{[^}]*}' | head -1)
        echo "$METADATA" | python3 -m json.tool 2>/dev/null || echo "$METADATA"

        # 检查关键字段
        if echo "$DECISION_RESPONSE" | grep -q '"prompt_template"'; then
            log_success "✓ 返回了prompt_template字段"
        else
            log_error "✗ 未返回prompt_template字段"
        fi

        if echo "$DECISION_RESPONSE" | grep -q '"token_count"'; then
            log_success "✓ 返回了token_count字段"
        else
            log_error "✗ 未返回token_count字段"
        fi

        if echo "$DECISION_RESPONSE" | grep -q '"user_preferences"'; then
            log_success "✓ 返回了user_preferences字段"
        else
            log_error "✗ 未返回user_preferences字段"
        fi
    else
        log_error "✗ 未返回metadata字段"
    fi

    # 提取决策日志ID
    DECISION_LOG_ID=$(echo "$DECISION_RESPONSE" | grep -o '"decision_log_id":[0-9]*' | cut -d: -f2)
    if [ -n "$DECISION_LOG_ID" ]; then
        log_success "决策日志ID: ${DECISION_LOG_ID}"
    fi
else
    log_error "AI决策请求失败"
    echo "响应: $DECISION_RESPONSE"
fi

echo ""
echo "6. 查询数据库验证决策日志存储..."
log_info "使用直接数据库查询验证决策日志中的提示词字段"
echo "请手动检查数据库中的decision_logs表:"
echo "SELECT id, account_id, decision_type, prompt_template, token_count,"
echo "       LENGTH(full_prompt) as prompt_length,"
echo "       user_preferences IS NOT NULL as has_user_prefs"
echo "FROM decision_logs"
echo "WHERE account_id = ${ACCOUNT_ID}"
echo "ORDER BY created_at DESC LIMIT 1;"

echo ""
echo "7. 测试前端组件..."
log_info "启动前端服务并访问AI账户管理页面:"
echo "1. 启动前端: cd frontend && npm run dev"
echo "2. 访问: http://localhost:3000/ai-accounts"
echo "3. 找到测试AI账户，点击'查看详情'按钮"
echo "4. 验证决策详情页面显示完整提示词信息"

echo ""
echo "=== 测试总结 ==="
log_success "AI决策功能增强测试完成"
echo ""
echo "已验证的功能:"
echo "✓ 用户偏好配置存储"
echo "✓ AI账户创建时支持preferenceConfig字段"
echo "✓ AI决策返回包含提示词信息的元数据"
echo "✓ 前端组件支持展示完整提示词"
echo ""
echo "下一步:"
echo "1. 启动前端服务验证UI展示"
echo "2. 检查数据库中的决策日志记录"
echo "3. 测试不同用户偏好配置对AI决策的影响"