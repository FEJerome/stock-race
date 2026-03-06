#!/bin/bash

# 管理员账号创建脚本
# 用于创建专属管理员账号，支持性能监控与告警机制

set -e

echo "=== 管理员账号创建脚本 ==="
echo "开始时间: $(date)"
echo ""

# 默认配置
DEFAULT_ADMIN_USERNAME="admin"
DEFAULT_ADMIN_PASSWORD="admin123"
DEFAULT_ADMIN_EMAIL="admin@stock-race.com"
DEFAULT_ADMIN_ROLE="admin"

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --username)
            ADMIN_USERNAME="$2"
            shift 2
            ;;
        --password)
            ADMIN_PASSWORD="$2"
            shift 2
            ;;
        --email)
            ADMIN_EMAIL="$2"
            shift 2
            ;;
        --role)
            ADMIN_ROLE="$2"
            shift 2
            ;;
        --help)
            echo "用法: $0 [选项]"
            echo "选项:"
            echo "  --username <用户名>   管理员用户名 (默认: $DEFAULT_ADMIN_USERNAME)"
            echo "  --password <密码>     管理员密码 (默认: $DEFAULT_ADMIN_PASSWORD)"
            echo "  --email <邮箱>        管理员邮箱 (默认: $DEFAULT_ADMIN_EMAIL)"
            echo "  --role <角色>         管理员角色 (默认: $DEFAULT_ADMIN_ROLE)"
            echo "  --help                显示帮助信息"
            exit 0
            ;;
        *)
            echo "未知选项: $1"
            echo "使用 --help 查看帮助"
            exit 1
            ;;
    esac
done

# 使用默认值
ADMIN_USERNAME=${ADMIN_USERNAME:-$DEFAULT_ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-$DEFAULT_ADMIN_PASSWORD}
ADMIN_EMAIL=${ADMIN_EMAIL:-$DEFAULT_ADMIN_EMAIL}
ADMIN_ROLE=${ADMIN_ROLE:-$DEFAULT_ADMIN_ROLE}

echo "1. 配置信息:"
echo "   用户名: $ADMIN_USERNAME"
echo "   密码:   ${ADMIN_PASSWORD:0:3}*****"
echo "   邮箱:   $ADMIN_EMAIL"
echo "   角色:   $ADMIN_ROLE"
echo ""

# 检查后端服务是否运行
echo "2. 检查后端服务状态..."
if curl -s "http://localhost:3001/api/health" > /dev/null 2>&1; then
    echo "✅ 后端服务运行正常"
else
    echo "⚠️  后端服务未运行，尝试启动..."

    # 检查是否在项目目录
    if [ -f "package.json" ]; then
        echo "   在项目根目录，尝试启动后端服务..."
        # 这里可以添加启动后端服务的逻辑
    else
        echo "❌ 无法启动后端服务，请手动启动后端服务"
        echo "   运行命令: cd backend && npm run dev"
        exit 1
    fi
fi

# 创建管理员账号
echo ""
echo "3. 创建管理员账号..."
REGISTER_RESPONSE=$(curl -s -X POST "http://localhost:3001/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$ADMIN_USERNAME\",
    \"password\": \"$ADMIN_PASSWORD\",
    \"confirmPassword\": \"$ADMIN_PASSWORD\",
    \"email\": \"$ADMIN_EMAIL\",
    \"role\": \"$ADMIN_ROLE\"
  }" 2>/dev/null || echo "{}")

# 解析响应
if echo "$REGISTER_RESPONSE" | grep -q "success.*true"; then
    echo "✅ 管理员账号创建成功"

    # 提取用户ID
    USER_ID=$(echo "$REGISTER_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('data', {}).get('user', {}).get('id', 'Unknown'))
except:
    print('Unknown')
" 2>/dev/null || echo "Unknown")

    echo "   用户ID: $USER_ID"

    # 测试登录
    echo ""
    echo "4. 测试管理员登录..."
    LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:3001/api/auth/login" \
      -H "Content-Type: application/json" \
      -d "{
        \"username\": \"$ADMIN_USERNAME\",
        \"password\": \"$ADMIN_PASSWORD\"
      }" 2>/dev/null || echo "{}")

    if echo "$LOGIN_RESPONSE" | grep -q "success.*true"; then
        echo "✅ 管理员登录成功"

        # 提取JWT令牌
        TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('data', {}).get('token', 'Unknown'))
except:
    print('Unknown')
" 2>/dev/null || echo "Unknown")

        echo "   JWT令牌: ${TOKEN:0:30}..."

        # 测试管理员权限
        echo ""
        echo "5. 测试管理员权限..."
        ADMIN_TEST_RESPONSE=$(curl -s "http://localhost:3001/api/auth/me" \
          -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "{}")

        if echo "$ADMIN_TEST_RESPONSE" | grep -q "success.*true"; then
            USER_ROLE=$(echo "$ADMIN_TEST_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('data', {}).get('role', 'Unknown'))
except:
    print('Unknown')
" 2>/dev/null || echo "Unknown")

            echo "✅ 管理员权限验证成功"
            echo "   用户角色: $USER_ROLE"
        else
            echo "⚠️  管理员权限验证失败"
        fi
    else
        echo "❌ 管理员登录失败"
    fi
else
    ERROR_MSG=$(echo "$REGISTER_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('message', 'Unknown error'))
except:
    print('Unknown error')
" 2>/dev/null || echo "Unknown error")

    echo "❌ 管理员账号创建失败: $ERROR_MSG"

    # 检查是否已存在管理员账号
    echo ""
    echo "尝试登录现有管理员账号..."
    EXISTING_LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:3001/api/auth/login" \
      -H "Content-Type: application/json" \
      -d "{
        \"username\": \"$ADMIN_USERNAME\",
        \"password\": \"$ADMIN_PASSWORD\"
      }" 2>/dev/null || echo "{}")

    if echo "$EXISTING_LOGIN_RESPONSE" | grep -q "success.*true"; then
        echo "✅ 管理员账号已存在，登录成功"
    else
        echo "❌ 管理员账号不存在且创建失败"
    fi
fi

# 创建管理员配置文件
echo ""
echo "6. 创建管理员配置文件..."
cat > "admin_account_config_$(date +%Y%m%d_%H%M%S).env" << EOF
# 管理员账号配置
# 生成时间: $(date)

ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_ROLE=$ADMIN_ROLE

# 前端配置
VITE_ADMIN_USERNAME=$ADMIN_USERNAME
VITE_ADMIN_ROLE=$ADMIN_ROLE

# 后端配置
ADMIN_DEFAULT_USERNAME=$ADMIN_USERNAME
ADMIN_DEFAULT_PASSWORD=$ADMIN_PASSWORD

# 使用说明:
# 1. 将本文件重命名为 .env.admin 并放置在项目根目录
# 2. 在启动脚本中加载此配置: source .env.admin
# 3. 确保只有管理员可以访问此文件

EOF

echo "✅ 管理员配置文件已生成: admin_account_config_$(date +%Y%m%d_%H%M%S).env"

# 生成使用指南
echo ""
echo "7. 生成管理员使用指南..."
cat > "admin_usage_guide_$(date +%Y%m%d_%H%M%S).md" << EOF
# 管理员账号使用指南

## 账号信息
- **用户名**: $ADMIN_USERNAME
- **密码**: $ADMIN_PASSWORD
- **角色**: $ADMIN_ROLE
- **创建时间**: $(date)

## 权限说明
作为管理员，您拥有以下权限:

### 1. 系统管理权限
- 查看所有用户信息
- 管理用户账号（启用/禁用）
- 查看系统日志
- 配置系统参数

### 2. 监控权限
- 访问性能监控仪表板
- 查看实时系统指标
- 配置告警规则
- 查看审计日志

### 3. 数据管理权限
- 导出系统数据
- 管理数据库备份
- 查看统计数据
- 生成分析报告

## 访问方式

### 1. 前端访问
1. 访问前端应用: http://localhost:3000
2. 使用管理员账号登录
3. 导航到"管理员"菜单

### 2. API访问
使用以下命令通过API访问管理员功能:

\`\`\`bash
# 获取管理员令牌
TOKEN=\$(curl -s -X POST http://localhost:3001/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username": "$ADMIN_USERNAME", "password": "$ADMIN_PASSWORD"}' \\
  | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('token', ''))")

# 访问管理员端点
curl -s http://localhost:3001/api/admin/dashboard \\
  -H "Authorization: Bearer \$TOKEN"
\`\`\`

## 安全建议

1. **定期更换密码**: 建议每90天更换一次管理员密码
2. **访问控制**: 仅从可信网络访问管理员功能
3. **日志审计**: 定期检查管理员操作日志
4. **备份配置**: 定期备份管理员配置和权限设置

## 故障排除

### 常见问题
1. **无法登录**: 检查密码是否正确，确认后端服务运行正常
2. **权限不足**: 确认用户角色为"admin"
3. **API访问失败**: 检查JWT令牌是否有效

### 联系支持
如有问题，请联系系统管理员或查看系统日志。

---
*文档生成时间: $(date)*
*文档版本: 1.0.0*

EOF

echo "✅ 管理员使用指南已生成: admin_usage_guide_$(date +%Y%m%d_%H%M%S).md"

echo ""
echo "=== 管理员账号创建完成 ==="
echo "完成时间: $(date)"
echo ""
echo "下一步操作:"
echo "1. 启动前端服务并访问管理员界面"
echo "2. 配置性能监控系统"
echo "3. 设置告警规则和通知"