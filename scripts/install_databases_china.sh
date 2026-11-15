#!/bin/bash

# 数据库安装脚本（中国优化版）
# 请使用sudo运行此脚本: sudo bash install_databases_china.sh

set -e

echo "🚀 开始安装Stock-Race项目所需的数据库服务（中国优化版）..."

# 更新apt包列表（使用国内源）
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
    echo "创建基本表结构..."
    sudo -u postgres psql -d stock_race << EOF
-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建股票表
CREATE TABLE IF NOT EXISTS stocks (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    exchange VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入示例数据
INSERT INTO users (username, password_hash, email) VALUES
('admin', '\$2b\$10\$ExampleHash', 'admin@stock-race.com')
ON CONFLICT (username) DO NOTHING;

INSERT INTO stocks (symbol, name, exchange) VALUES
('000001.SZ', '平安银行', 'SZ'),
('000002.SZ', '万科A', 'SZ'),
('600036.SH', '招商银行', 'SH'),
('600519.SH', '贵州茅台', 'SH')
ON CONFLICT (symbol) DO NOTHING;
EOF
    echo "✅ 基本表结构创建完成"
fi

echo "🐍 安装TimescaleDB（时序数据库）..."
echo "尝试安装TimescaleDB，如果失败将使用PostgreSQL替代..."

# 尝试安装TimescaleDB，如果失败则跳过
if curl -s --connect-timeout 10 "https://packagecloud.io/timescale/timescaledb/gpgkey" | apt-key add - 2>/dev/null; then
    echo "添加TimescaleDB仓库..."
    echo "deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -c -s) main" | tee /etc/apt/sources.list.d/timescaledb.list

    apt-get update -y
    if apt-get install -y timescaledb-2-postgresql-15; then
        echo "🔧 配置TimescaleDB..."
        timescaledb-tune --quiet --yes
        systemctl restart postgresql

        echo "🗄️ 创建TimescaleDB数据库..."
        sudo -u postgres psql -c "CREATE DATABASE stock_race_tsdb;" 2>/dev/null || echo "TimescaleDB数据库已存在，跳过创建"
        sudo -u postgres psql -c "CREATE USER timescale WITH PASSWORD 'password';" 2>/dev/null || echo "TimescaleDB用户已存在，跳过创建"
        sudo -u postgres psql -c "ALTER USER timescale WITH PASSWORD 'password';"
        sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE stock_race_tsdb TO timescale;"
        echo "✅ TimescaleDB安装成功"
    else
        echo "⚠️ TimescaleDB安装失败，将使用PostgreSQL作为替代"
        echo "创建替代的时序数据库..."
        sudo -u postgres psql -c "CREATE DATABASE stock_race_tsdb;" 2>/dev/null || echo "时序数据库已存在，跳过创建"
    fi
else
    echo "⚠️ 无法访问TimescaleDB仓库，将使用PostgreSQL作为替代"
    echo "创建替代的时序数据库..."
    sudo -u postgres psql -c "CREATE DATABASE stock_race_tsdb;" 2>/dev/null || echo "时序数据库已存在，跳过创建"
    sudo -u postgres psql -c "CREATE USER timescale WITH PASSWORD 'password';" 2>/dev/null || echo "时序数据库用户已存在，跳过创建"
    sudo -u postgres psql -c "ALTER USER timescale WITH PASSWORD 'password';"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE stock_race_tsdb TO timescale;"
fi

echo "🐳 安装Redis缓存..."
apt-get install -y redis-server

echo "🔧 配置Redis..."
# 启动Redis服务
systemctl start redis-server
systemctl enable redis-server

# 配置Redis允许本地连接
sed -i 's/bind 127.0.0.1 ::1/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
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
echo "2. 时序数据库"
echo "   - 端口: 5432"
echo "   - 数据库: stock_race_tsdb"
echo "   - 用户: timescale"
echo "   - 密码: password"
echo "   - 类型: $(sudo -u postgres psql -d stock_race_tsdb -c 'SELECT version();' 2>/dev/null | grep -i timescale >/dev/null && echo 'TimescaleDB' || echo 'PostgreSQL')"
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
echo "psql -h localhost -U postgres -d stock_race -c \"SELECT COUNT(*) FROM users;\" 2>/dev/null || echo '请安装psql客户端: sudo apt-get install postgresql-client'"
echo ""
echo "🚀 下一步：启动应用服务"
echo "1. 后端服务：cd /path/to/stock-race/backend && npm run dev"
echo "2. AI服务：cd /path/to/stock-race/ai-service && python -m uvicorn ai_service.main:app --reload --host 0.0.0.0 --port 8000"
echo "3. 数据服务：cd /path/to/stock-race/data-service && python -m uvicorn data_service.main:app --reload --host 0.0.0.0 --port 8001"
echo "4. 前端服务：cd /path/to/stock-race/frontend && npm run dev"
echo ""
echo "📝 注意："
echo "- 所有服务将使用localhost而不是Docker容器名"
echo "- 需要确保环境变量正确配置（参考各服务的.env.example文件）"
echo "- TimescaleDB如果安装失败，系统将使用普通PostgreSQL作为替代"