-- [动态配置] 创建AI对话配置表
-- 支持管理员动态配置对话限制参数

CREATE TABLE IF NOT EXISTS dialogue_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    config_type VARCHAR(50) DEFAULT 'system', -- system, account, global
    description TEXT,
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认配置
INSERT INTO dialogue_config (config_key, config_value, config_type, description) VALUES
('max_rounds', '{"value": 10, "min": 1, "max": 50}', 'system', '每轮对话最大轮数限制'),
('max_tokens_per_message', '{"value": 2000, "min": 500, "max": 8000}', 'system', '单条消息最大Token数'),
('total_token_budget', '{"value": 10000, "min": 1000, "max": 50000}', 'system', '对话总Token预算'),
('session_expiry_hours', '{"value": 24, "min": 1, "max": 168}', 'system', '会话过期时间（小时）'),
('enable_content_audit', '{"value": true}', 'system', '是否启用内容审查'),
('sensitive_words', '{"words": ["赌博", "色情", "暴力", "恐怖主义"]}', 'system', '敏感词列表')
ON CONFLICT (config_key) DO NOTHING;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_dialogue_config_key ON dialogue_config(config_key);
CREATE INDEX IF NOT EXISTS idx_dialogue_config_type ON dialogue_config(config_type);

-- 添加注释
COMMENT ON TABLE dialogue_config IS 'AI对话动态配置表，支持管理员实时调整参数';
COMMENT ON COLUMN dialogue_config.config_key IS '配置项键名';
COMMENT ON COLUMN dialogue_config.config_value IS '配置值（JSON格式，支持min/max限制）';
COMMENT ON COLUMN dialogue_config.config_type IS '配置类型：system(系统级), account(账户级), global(全局)';

-- 创建配置变更历史表
CREATE TABLE IF NOT EXISTS dialogue_config_history (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    changed_by INTEGER REFERENCES users(id),
    change_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_config_history_key ON dialogue_config_history(config_key);
CREATE INDEX IF NOT EXISTS idx_config_history_time ON dialogue_config_history(created_at);

COMMENT ON TABLE dialogue_config_history IS '配置变更历史记录';
