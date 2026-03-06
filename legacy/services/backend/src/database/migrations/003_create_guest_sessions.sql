-- [C5-006] 创建游客会话表
-- 用于存储游客模式会话信息

CREATE TABLE IF NOT EXISTS guest_sessions (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) UNIQUE NOT NULL,
    openid_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    migrated_to INTEGER REFERENCES users(id),
    migrated_at TIMESTAMP WITH TIME ZONE,
    ai_accounts_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_guest_sessions_token ON guest_sessions(token);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_openid_hash ON guest_sessions(openid_hash);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_expires_at ON guest_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_status ON guest_sessions(status);

-- 创建游客 AI 账户表
CREATE TABLE IF NOT EXISTS guest_ai_accounts (
    id SERIAL PRIMARY KEY,
    guest_session_id INTEGER REFERENCES guest_sessions(id) ON DELETE CASCADE,
    account_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    model_type VARCHAR(50) NOT NULL,
    initial_balance INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active'
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_guest_ai_accounts_session ON guest_ai_accounts(guest_session_id);
CREATE INDEX IF NOT EXISTS idx_guest_ai_accounts_account_id ON guest_ai_accounts(account_id);

-- 添加注释
COMMENT ON TABLE guest_sessions IS '游客会话表，存储游客模式用户信息';
COMMENT ON TABLE guest_ai_accounts IS '游客 AI 账户表，存储游客创建的临时 AI 账户';
COMMENT ON COLUMN guest_sessions.token IS '游客访问令牌';
COMMENT ON COLUMN guest_sessions.openid_hash IS 'OpenID 哈希值，用于识别同一用户';
COMMENT ON COLUMN guest_sessions.expires_at IS '会话过期时间';
COMMENT ON COLUMN guest_sessions.migrated_to IS '迁移到的正式用户 ID';
