# AI股票竞赛平台 - 数据库设计文档

## 1. 数据库架构概述

### 1.1 数据库选型
- **主数据库**：PostgreSQL 15+（关系型数据，ACID事务）
- **缓存数据库**：Redis 7+（会话、实时数据、任务队列）
- **时序数据库**：TimescaleDB 2.11+（股票行情时序数据）
- **ORM工具**：Prisma（Node.js）、SQLAlchemy（Python）

### 1.2 设计原则
1. **规范化设计**：第三范式，减少数据冗余
2. **性能优化**：合理索引，查询优化
3. **扩展性**：支持未来功能扩展
4. **安全性**：敏感数据加密，访问控制
5. **审计追踪**：完整操作日志

## 2. 实体关系图（ER Diagram）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                             数据库ER图                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐        │
│  │   用户表     │        │   AI账户表   │        │   股票表     │        │
│  │  users      │        │  ai_accounts│        │   stocks    │        │
│  ├─────────────┤        ├─────────────┤        ├─────────────┤        │
│  │ • id (PK)   │        │ • id (PK)   │        │ • id (PK)   │        │
│  │ • username  │        │ • user_id   │        │ • code      │        │
│  │ • email     │        │ • name      │        │ • name      │        │
│  │ • password  │        │ • model_type│        │ • market    │        │
│  │ • status    │        │ • balance   │        │ • industry  │        │
│  │ • created_at│        │ • status    │        │ • created_at│        │
│  └──────┬──────┘        │ • created_at│        └──────┬──────┘        │
│         │1              └──────┬──────┘               │1               │
│         │                      │1                     │                │
│         │                      │                      │                │
│         │               ┌──────▼──────┐               │                │
│         │               │   持仓表     │               │                │
│         │               │  portfolios │               │                │
│         │               ├─────────────┤               │                │
│         │               │ • id (PK)   │               │                │
│         │               │ • account_id│               │                │
│         │               │ • stock_id  │               │                │
│         │               │ • quantity  │               │                │
│         │               │ • avg_cost  │               │                │
│         │               │ • updated_at│               │                │
│         │               └──────┬──────┘               │                │
│         │                      │                      │                │
│         │               ┌──────▼──────┐               │                │
│         │               │   交易表     │◄──────────────┘                │
│         │               │   trades    │                                 │
│         │               ├─────────────┤                                 │
│         │               │ • id (PK)   │                                 │
│         │               │ • account_id│                                 │
│         │               │ • stock_id  │                                 │
│         │               │ • type      │                                 │
│         │               │ • quantity  │                                 │
│         │               │ • price     │                                 │
│         │               │ • status    │                                 │
│         │               │ • executed_at│                                │
│         │               └──────┬──────┘                                 │
│         │                      │                                        │
│         │               ┌──────▼──────┐                                 │
│         │               │ AI决策日志表 │                                 │
│         │               │decision_logs│                                 │
│         │               ├─────────────┤                                 │
│         │               │ • id (PK)   │                                 │
│         │               │ • account_id│                                 │
│         │               │ • trade_id  │                                 │
│         │               │ • reasoning │                                 │
│         │               │ • risk_level│                                 │
│         │               │ • created_at│                                 │
│         │               └─────────────┘                                 │
│         │                                                               │
│         │        ┌─────────────┐        ┌─────────────┐                │
│         │        │  排行榜表    │        │  系统日志表  │                │
│         │        │  rankings   │        │ system_logs │                │
│         │        ├─────────────┤        ├─────────────┤                │
│         │        │ • id (PK)   │        │ • id (PK)   │                │
│         │        │ • account_id│        │ • level     │                │
│         │        │ • period    │        │ • message   │                │
│         │        │ • rank      │        │ • metadata  │                │
│         │        │ • return_rate│       │ • created_at│                │
│         │        │ • updated_at│        └─────────────┘                │
│         │        └─────────────┘                                       │
│         │                                                               │
│  ┌──────▼──────┐        ┌─────────────┐                                │
│  │  用户配置表  │        │  关注股票表  │                                │
│  │user_settings│        │watchlist    │                                │
│  ├─────────────┤        ├─────────────┤                                │
│  │ • id (PK)   │        │ • id (PK)   │                                │
│  │ • user_id   │        │ • user_id   │                                │
│  │ • theme     │        │ • stock_id  │                                │
│  │ • language  │        │ • created_at│                                │
│  │ • notifications│     └─────────────┘                                │
│  │ • updated_at│                                                       │
│  └─────────────┘                                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. PostgreSQL表结构设计

### 3.1 用户表（users）
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    last_login_at TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER DEFAULT 0,
    lock_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 索引
    INDEX idx_users_username (username),
    INDEX idx_users_email (email),
    INDEX idx_users_status (status)
);

-- 密码加密函数
CREATE OR REPLACE FUNCTION hash_password(password TEXT, salt TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN crypt(password, salt);
END;
$$ LANGUAGE plpgsql;
```

### 3.2 AI账户表（ai_accounts）
```sql
CREATE TABLE ai_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    model_type VARCHAR(50) NOT NULL DEFAULT 'openai_gpt4' CHECK (
        model_type IN ('openai_gpt4', 'openai_gpt35', 'claude', 'wenxin', 'qwen')
    ),
    initial_balance DECIMAL(15, 2) NOT NULL DEFAULT 100000.00,
    current_balance DECIMAL(15, 2) NOT NULL DEFAULT 100000.00,
    total_value DECIMAL(15, 2) NOT NULL DEFAULT 100000.00,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped')),
    trading_frequency VARCHAR(20) DEFAULT 'daily' CHECK (trading_frequency IN ('minutely', 'hourly', 'daily', 'weekly')),
    risk_level VARCHAR(20) DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
    prompt_template TEXT,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 约束
    CONSTRAINT chk_balance_non_negative CHECK (current_balance >= 0),
    CONSTRAINT chk_total_value_non_negative CHECK (total_value >= 0),

    -- 索引
    INDEX idx_ai_accounts_user_id (user_id),
    INDEX idx_ai_accounts_status (status),
    INDEX idx_ai_accounts_model_type (model_type)
);
```

### 3.3 股票表（stocks）
```sql
CREATE TABLE stocks (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,  -- 股票代码，如 '000001'
    name VARCHAR(100) NOT NULL,        -- 股票名称
    full_name VARCHAR(200),            -- 全称
    market VARCHAR(10) NOT NULL CHECK (market IN ('sh', 'sz', 'bj', 'hk')),  -- 市场：sh=上海，sz=深圳，bj=北京，hk=香港
    industry VARCHAR(100),             -- 行业
    sub_industry VARCHAR(100),         -- 子行业
    listing_date DATE,                 -- 上市日期
    total_shares BIGINT,               -- 总股本
    circulating_shares BIGINT,         -- 流通股本
    status VARCHAR(20) DEFAULT 'normal' CHECK (status IN ('normal', 'suspended', 'delisted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 索引
    INDEX idx_stocks_code (code),
    INDEX idx_stocks_market (market),
    INDEX idx_stocks_industry (industry),
    INDEX idx_stocks_status (status)
);
```

### 3.4 持仓表（portfolios）
```sql
CREATE TABLE portfolios (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,
    stock_id INTEGER NOT NULL REFERENCES stocks(id),
    quantity INTEGER NOT NULL DEFAULT 0,      -- 持有数量
    avg_cost DECIMAL(10, 4) NOT NULL,        -- 平均成本价
    current_price DECIMAL(10, 4),            -- 当前价格（缓存）
    market_value DECIMAL(15, 2),             -- 市值 = quantity * current_price
    profit_loss DECIMAL(15, 2),              -- 浮动盈亏
    profit_loss_rate DECIMAL(8, 4),          -- 盈亏比例
    first_bought_at TIMESTAMP WITH TIME ZONE, -- 首次买入时间
    last_traded_at TIMESTAMP WITH TIME ZONE,  -- 最后交易时间
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 约束
    CONSTRAINT chk_quantity_non_negative CHECK (quantity >= 0),
    CONSTRAINT chk_avg_cost_positive CHECK (avg_cost > 0),
    CONSTRAINT unique_account_stock UNIQUE (account_id, stock_id),

    -- 索引
    INDEX idx_portfolios_account_id (account_id),
    INDEX idx_portfolios_stock_id (stock_id),
    INDEX idx_portfolios_updated_at (updated_at DESC)
);
```

### 3.5 交易表（trades）
```sql
CREATE TABLE trades (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,
    stock_id INTEGER NOT NULL REFERENCES stocks(id),
    trade_type VARCHAR(10) NOT NULL CHECK (trade_type IN ('buy', 'sell')),
    order_type VARCHAR(20) NOT NULL DEFAULT 'market' CHECK (order_type IN ('market', 'limit', 'stop')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price DECIMAL(10, 4) NOT NULL CHECK (price > 0),
    amount DECIMAL(15, 2) NOT NULL,  -- 交易金额 = quantity * price
    fee DECIMAL(10, 2) DEFAULT 0.00, -- 手续费
    net_amount DECIMAL(15, 2) NOT NULL, -- 净额 = amount ± fee
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'executed', 'cancelled', 'rejected', 'expired')
    ),
    reason VARCHAR(100),              -- 交易原因（AI决策或手动操作）
    executed_at TIMESTAMP WITH TIME ZONE, -- 执行时间
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 约束
    CONSTRAINT chk_buy_sell_logic CHECK (
        (trade_type = 'buy' AND net_amount > 0) OR
        (trade_type = 'sell' AND net_amount < 0)
    ),

    -- 索引
    INDEX idx_trades_account_id (account_id),
    INDEX idx_trades_stock_id (stock_id),
    INDEX idx_trades_trade_type (trade_type),
    INDEX idx_trades_status (status),
    INDEX idx_trades_executed_at (executed_at DESC),
    INDEX idx_trades_created_at (created_at DESC)
);
```

### 3.6 AI决策日志表（decision_logs）
```sql
CREATE TABLE decision_logs (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,
    trade_id INTEGER REFERENCES trades(id) ON DELETE SET NULL,
    decision_type VARCHAR(20) NOT NULL CHECK (decision_type IN ('buy', 'sell', 'hold', 'analyze')),
    reasoning TEXT NOT NULL,                  -- AI决策理由
    confidence DECIMAL(5, 4) CHECK (confidence >= 0 AND confidence <= 1), -- 置信度
    risk_level VARCHAR(20) CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    market_analysis JSONB,                    -- 市场分析数据
    technical_indicators JSONB,               -- 技术指标
    fundamental_analysis JSONB,               -- 基本面分析
    input_data JSONB,                         -- 输入数据快照
    output_data JSONB,                        -- 输出数据
    model_used VARCHAR(50),                   -- 使用的AI模型
    prompt_version VARCHAR(50),               -- 提示词版本
    processing_time_ms INTEGER,               -- 处理时间（毫秒）
    api_cost DECIMAL(10, 6),                  -- API调用成本
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 索引
    INDEX idx_decision_logs_account_id (account_id),
    INDEX idx_decision_logs_trade_id (trade_id),
    INDEX idx_decision_logs_decision_type (decision_type),
    INDEX idx_decision_logs_created_at (created_at DESC),
    INDEX idx_decision_logs_risk_level (risk_level)
);
```

### 3.7 排行榜表（rankings）
```sql
CREATE TABLE rankings (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'total')),
    period_date DATE NOT NULL,                -- 统计周期日期
    rank INTEGER NOT NULL,                    -- 排名
    total_return DECIMAL(8, 4) NOT NULL,      -- 总收益率
    annualized_return DECIMAL(8, 4),          -- 年化收益率
    sharpe_ratio DECIMAL(8, 4),               -- 夏普比率
    max_drawdown DECIMAL(8, 4),               -- 最大回撤
    win_rate DECIMAL(8, 4),                   -- 胜率
    profit_factor DECIMAL(8, 4),              -- 盈亏比
    total_trades INTEGER,                     -- 总交易次数
    total_volume DECIMAL(15, 2),              -- 总交易额
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 约束
    CONSTRAINT unique_account_period UNIQUE (account_id, period_type, period_date),
    CONSTRAINT chk_rank_positive CHECK (rank > 0),

    -- 索引
    INDEX idx_rankings_period_type (period_type),
    INDEX idx_rankings_period_date (period_date),
    INDEX idx_rankings_rank (rank),
    INDEX idx_rankings_total_return (total_return DESC)
);
```

### 3.8 用户配置表（user_settings）
```sql
CREATE TABLE user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'auto')),
    language VARCHAR(10) DEFAULT 'zh-CN' CHECK (language IN ('zh-CN', 'en-US')),
    timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
    currency VARCHAR(10) DEFAULT 'CNY',
    number_format VARCHAR(20) DEFAULT 'standard',
    date_format VARCHAR(20) DEFAULT 'YYYY-MM-DD',
    notifications JSONB DEFAULT '{
        "trade_executed": true,
        "ai_decision": true,
        "price_alert": false,
        "system_maintenance": true,
        "marketing": false
    }',
    chart_settings JSONB DEFAULT '{
        "default_period": "1d",
        "show_volume": true,
        "show_ma": true,
        "theme": "light"
    }',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 索引
    INDEX idx_user_settings_user_id (user_id)
);
```

### 3.9 关注股票表（watchlist）
```sql
CREATE TABLE watchlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stock_id INTEGER NOT NULL REFERENCES stocks(id),
    custom_name VARCHAR(100),                 -- 自定义名称
    notes TEXT,                               -- 备注
    alert_price DECIMAL(10, 4),               -- 价格提醒
    alert_type VARCHAR(20) CHECK (alert_type IN ('above', 'below', 'both')),
    sort_order INTEGER DEFAULT 0,             -- 排序顺序
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 约束
    CONSTRAINT unique_user_stock UNIQUE (user_id, stock_id),

    -- 索引
    INDEX idx_watchlist_user_id (user_id),
    INDEX idx_watchlist_stock_id (stock_id)
);
```

### 3.10 系统日志表（system_logs）
```sql
CREATE TABLE system_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(10) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    module VARCHAR(50) NOT NULL,              -- 模块名称
    action VARCHAR(100) NOT NULL,             -- 操作名称
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    account_id INTEGER REFERENCES ai_accounts(id) ON DELETE SET NULL,
    message TEXT NOT NULL,                    -- 日志消息
    metadata JSONB,                           -- 附加数据
    ip_address INET,                          -- IP地址
    user_agent TEXT,                          -- 用户代理
    duration_ms INTEGER,                      -- 操作耗时（毫秒）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 索引
    INDEX idx_system_logs_level (level),
    INDEX idx_system_logs_module (module),
    INDEX idx_system_logs_user_id (user_id),
    INDEX idx_system_logs_created_at (created_at DESC),
    INDEX idx_system_logs_module_action (module, action)
);
```

## 4. TimescaleDB时序数据表

### 4.1 股票行情表（stock_quotes）
```sql
-- 创建超表（hypertable）
CREATE TABLE stock_quotes (
    time TIMESTAMPTZ NOT NULL,
    stock_id INTEGER NOT NULL REFERENCES stocks(id),
    open DECIMAL(10, 4) NOT NULL,
    high DECIMAL(10, 4) NOT NULL,
    low DECIMAL(10, 4) NOT NULL,
    close DECIMAL(10, 4) NOT NULL,
    volume BIGINT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    change DECIMAL(10, 4),                    -- 涨跌额
    change_percent DECIMAL(8, 4),            -- 涨跌幅
    turnover_rate DECIMAL(8, 4),             -- 换手率
    pe_ratio DECIMAL(10, 4),                 -- 市盈率
    pb_ratio DECIMAL(10, 4),                 -- 市净率
    market_cap DECIMAL(20, 2),               -- 市值
    circulating_market_cap DECIMAL(20, 2),   -- 流通市值
    bid1_price DECIMAL(10, 4),
    bid1_volume INTEGER,
    ask1_price DECIMAL(10, 4),
    ask1_volume INTEGER,
    data_source VARCHAR(20) NOT NULL,        -- 数据源
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 转换为超表，按时间分区
SELECT create_hypertable('stock_quotes', 'time');

-- 创建索引
CREATE INDEX idx_stock_quotes_stock_id_time ON stock_quotes (stock_id, time DESC);
CREATE INDEX idx_stock_quotes_time ON stock_quotes (time DESC);

-- 创建压缩策略（保留最近30天的原始数据，更早的数据压缩）
SELECT add_compression_policy('stock_quotes', INTERVAL '30 days');

-- 创建数据保留策略（保留2年数据）
SELECT add_retention_policy('stock_quotes', INTERVAL '2 years');
```

### 4.2 技术指标表（technical_indicators）
```sql
CREATE TABLE technical_indicators (
    time TIMESTAMPTZ NOT NULL,
    stock_id INTEGER NOT NULL REFERENCES stocks(id),
    interval VARCHAR(10) NOT NULL CHECK (interval IN ('1m', '5m', '15m', '30m', '1h', '1d', '1w', '1M')),
    ma5 DECIMAL(10, 4),                      -- 5日均线
    ma10 DECIMAL(10, 4),                     -- 10日均线
    ma20 DECIMAL(10, 4),                     -- 20日均线
    ma60 DECIMAL(10, 4),                     -- 60日均线
    rsi DECIMAL(8, 4),                       -- RSI指标
    macd DECIMAL(10, 4),                     -- MACD
    macd_signal DECIMAL(10, 4),              -- MACD信号线
    macd_histogram DECIMAL(10, 4),           -- MACD柱状图
    boll_upper DECIMAL(10, 4),               -- 布林带上轨
    boll_middle DECIMAL(10, 4),              -- 布林带中轨
    boll_lower DECIMAL(10, 4),               -- 布林带下轨
    kdj_k DECIMAL(8, 4),                     -- KDJ K值
    kdj_d DECIMAL(8, 4),                     -- KDJ D值
    kdj_j DECIMAL(8, 4),                     -- KDJ J值
    volume_ma5 BIGINT,                       -- 5日平均成交量
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 转换为超表
SELECT create_hypertable('technical_indicators', 'time');

-- 创建索引
CREATE INDEX idx_technical_indicators_stock_id_interval_time
ON technical_indicators (stock_id, interval, time DESC);
```

## 5. Redis数据结构设计

### 5.1 会话管理
```redis
# 用户会话
SET session:{session_id} '{"userId": 1, "username": "user1", "expiresAt": 1672531200}'
EXPIRE session:{session_id} 86400  # 24小时过期

# 用户登录状态
SET user:1:last_active 1672527600
```

### 5.2 实时行情缓存
```redis
# 股票最新价格
HSET stock:000001:quote
  'price' '15.23'
  'change' '0.45'
  'changePercent' '3.04'
  'volume' '12345678'
  'timestamp' '1672527600'

# 自选股列表
SADD user:1:watchlist '000001' '000002' '600000'

# 价格提醒
ZADD price_alerts 15.50 '000001:above:1'  # 股票000001价格超过15.50时提醒用户1
```

### 5.3 API限流
```redis
# 用户API调用计数
INCR user:1:api_calls:1672527600
EXPIRE user:1:api_calls:1672527600 3600  # 1小时过期

# IP限流
INCR ip:192.168.1.1:requests
EXPIRE ip:192.168.1.1:requests 60  # 60秒过期
```

### 5.4 任务队列（使用Bull）
```javascript
// 任务队列配置
const queues = {
  marketData: new Queue('market-data', { redis }),
  aiDecision: new Queue('ai-decision', { redis }),
  portfolioSync: new Queue('portfolio-sync', { redis }),
  notification: new Queue('notification', { redis })
};
```

## 6. 数据库迁移策略

### 6.1 迁移工具
- **Node.js**：Prisma Migrate
- **Python**：Alembic（SQLAlchemy）
- **TimescaleDB**：原生SQL迁移脚本

### 6.2 迁移流程
```bash
# 开发环境
npm run prisma:migrate:dev --name init_schema

# 测试环境
npm run prisma:migrate:deploy

# 生产环境（需要备份）
npm run prisma:migrate:deploy -- --preview
```

### 6.3 数据备份策略
```bash
# PostgreSQL备份
pg_dump -U postgres -d stockrace -F c -f backup_$(date +%Y%m%d).dump

# TimescaleDB备份
pg_dump -U postgres -d stockrace_tsdb -F c -f tsdb_backup_$(date +%Y%m%d).dump

# Redis备份
redis-cli SAVE  # RDB快照
# 或
redis-cli BGSAVE  # 后台保存
```

### 6.4 数据恢复策略
```bash
# PostgreSQL恢复
pg_restore -U postgres -d stockrace backup_20260202.dump

# TimescaleDB恢复
pg_restore -U postgres -d stockrace_tsdb tsdb_backup_20260202.dump

# Redis恢复（自动从RDB文件加载）
```

## 7. 性能优化策略

### 7.1 查询优化
1. **合理索引**：为常用查询字段创建索引
2. **查询分析**：使用EXPLAIN分析查询计划
3. **分区策略**：TimescaleDB按时间分区
4. **物化视图**：缓存复杂查询结果

### 7.2 缓存策略
1. **Redis缓存**：热点数据缓存，减少数据库压力
2. **查询缓存**：缓存常用查询结果
3. **CDN缓存**：静态资源缓存

### 7.3 读写分离
1. **主从复制**：PostgreSQL主从架构
2. **读写分离**：写操作到主库，读操作到从库
3. **连接池**：合理配置连接池大小

## 8. 安全策略

### 8.1 数据加密
```sql
-- 使用pgcrypto扩展加密敏感数据
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 加密函数
CREATE OR REPLACE FUNCTION encrypt_data(data TEXT, key TEXT)
RETURNS BYTEA AS $$
BEGIN
    RETURN pgp_sym_encrypt(data, key);
END;
$$ LANGUAGE plpgsql;

-- 解密函数
CREATE OR REPLACE FUNCTION decrypt_data(encrypted_data BYTEA, key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN pgp_sym_decrypt(encrypted_data, key);
END;
$$ LANGUAGE plpgsql;
```

### 8.2 访问控制
1. **最小权限原则**：数据库用户仅拥有必要权限
2. **行级安全**：PostgreSQL行级安全策略
3. **审计日志**：记录所有数据访问操作

### 8.3 数据脱敏
```sql
-- 脱敏函数
CREATE OR REPLACE FUNCTION mask_email(email TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN regexp_replace(email, '(.)[^@]*@', '\1***@');
END;
$$ LANGUAGE plpgsql;
```

## 9. 监控与维护

### 9.1 监控指标
1. **数据库连接数**：活跃连接、空闲连接、等待连接
2. **查询性能**：慢查询、查询频率、缓存命中率
3. **存储空间**：表大小、索引大小、增长趋势
4. **复制状态**：主从延迟、复制状态

### 9.2 维护任务
1. **定期备份**：每日全量备份，每小时增量备份
2. **索引重建**：定期重建碎片化索引
3. **统计信息更新**：自动更新查询优化器统计信息
4. **数据清理**：清理过期日志和临时数据

---

*文档版本：v1.0*
*创建日期：2026-02-02*
*最后更新：2026-02-02*
*维护者：架构设计智能体*