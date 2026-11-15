#!/bin/bash

# 数据库安装脚本
# 请使用sudo运行此脚本: sudo bash install_databases.sh

set -e

echo "🚀 开始安装Stock-Race项目所需的数据库服务..."

# 更新apt包列表
echo "📦 更新软件包列表..."
apt-get update -y

echo "🐘 安装PostgreSQL数据库..."
apt-get install -y postgresql postgresql-contrib

echo "🔧 配置PostgreSQL..."
# 启动PostgreSQL服务
systemctl start postgresql
systemctl enable postgresql

echo "🗄️ 创建stock_race数据库和用户..."
# 创建数据库和用户
sudo -u postgres psql -c "CREATE DATABASE stock_race;" 2>/dev/null || echo "数据库已存在，跳过创建"
sudo -u postgres psql -c "CREATE USER postgres WITH PASSWORD 'postgres';" 2>/dev/null || echo "用户已存在，跳过创建"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE stock_race TO postgres;"

echo "📋 导入数据库初始化脚本..."
# 导入初始化脚本
if [ -f "/path/to/stock-race/docker/postgres/init.sql" ]; then
    sudo -u postgres psql -d stock_race -f /path/to/stock-race/docker/postgres/init.sql
    echo "✅ 数据库初始化脚本导入成功"
else
    echo "⚠️ 警告：数据库初始化脚本未找到"
fi

echo "🐍 安装TimescaleDB（时序数据库）..."
# 添加TimescaleDB仓库
echo "deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -c -s) main" | tee /etc/apt/sources.list.d/timescaledb.list

# 导入仓库密钥
curl -L https://packagecloud.io/timescale/timescaledb/gpgkey | apt-key add -

# 安装TimescaleDB
apt-get update -y
apt-get install -y timescaledb-2-postgresql-15

echo "🔧 配置TimescaleDB..."
# 配置TimescaleDB
timescaledb-tune --quiet --yes

# 重启PostgreSQL
systemctl restart postgresql

echo "🗄️ 创建TimescaleDB数据库..."
# 创建TimescaleDB数据库
sudo -u postgres psql -c "CREATE DATABASE stock_race_tsdb;" 2>/dev/null || echo "TimescaleDB数据库已存在，跳过创建"
sudo -u postgres psql -c "CREATE USER timescale WITH PASSWORD 'password';" 2>/dev/null || echo "TimescaleDB用户已存在，跳过创建"
sudo -u postgres psql -c "ALTER USER timescale WITH PASSWORD 'password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE stock_race_tsdb TO timescale;"

echo "📋 导入TimescaleDB初始化脚本..."
# 导入TimescaleDB初始化脚本
if [ -f "/path/to/stock-race/docker/timescaledb/init.sql" ]; then
    sudo -u postgres psql -d stock_race_tsdb -f /path/to/stock-race/docker/timescaledb/init.sql
    echo "✅ TimescaleDB初始化脚本导入成功"
else
    echo "⚠️ 警告：TimescaleDB初始化脚本未找到"
fi

echo "🐳 安装Redis缓存..."
apt-get install -y redis-server

echo "🔧 配置Redis..."
# 启动Redis服务
systemctl start redis-server
systemctl enable redis-server

# 配置Redis允许远程连接（仅用于开发）
sed -i 's/bind 127.0.0.1 ::1/bind 127.0.0.1 ::1 0.0.0.0/' /etc/redis/redis.conf
sed -i 's/protected-mode yes/protected-mode no/' /etc/redis/redis.conf

# 重启Redis
systemctl restart redis-server

echo "✅ 所有数据库服务安装完成！"
echo ""
echo "📊 安装的服务状态："
echo ""
echo "1. PostgreSQL (主数据库)"
echo "   - 端口: 5432"
echo "   - 数据库: stock_race"
echo "   - 用户: postgres"
echo "   - 密码: postgres"
echo ""
echo "2. TimescaleDB (时序数据库)"
echo "   - 端口: 5432 (共享PostgreSQL端口)"
echo "   - 数据库: stock_race_tsdb"
echo "   - 用户: timescale"
echo "   - 密码: password"
echo ""
echo "3. Redis (缓存)"
echo "   - 端口: 6379"
echo "   - 密码: 无密码"
echo ""
echo "🔍 验证安装："
echo ""
echo "# 检查PostgreSQL"
echo "sudo -u postgres psql -c \"SELECT version();\""
echo ""
echo "# 检查Redis"
echo "redis-cli ping"
echo ""
echo "# 检查数据库连接"
echo "psql -h localhost -U postgres -d stock_race -c \"SELECT COUNT(*) FROM users;\""
echo ""
echo "🚀 下一步：启动应用服务"
echo "1. 后端服务：cd /path/to/stock-race/backend && npm run dev"
echo "2. AI服务：cd /path/to/stock-race/ai-service && python -m uvicorn ai_service.main:app --reload"
echo "3. 数据服务：cd /path/to/stock-race/data-service && python -m uvicorn data_service.main:app --reload"
echo "4. 前端服务：cd /path/to/stock-race/frontend && npm run dev"
echo ""
echo "📝 注意："
echo "- 所有服务将使用localhost而不是Docker容器名"
echo "- 需要确保环境变量正确配置（参考各服务的.env.example文件）"
echo "- 首次运行需要安装各个服务的依赖"