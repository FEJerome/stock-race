-- [内容审查] 创建AI对话审计表
-- 记录所有AI对话内容用于监管审查

CREATE TABLE IF NOT EXISTS dialogue_audit (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    account_id VARCHAR(255) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    message_role VARCHAR(20) NOT NULL, -- 'user' 或 'assistant'
    message_content TEXT NOT NULL,
    message_hash VARCHAR(64), -- 内容哈希，用于完整性校验
    token_count INTEGER,
    round_number INTEGER,
    -- 审查相关字段
    audit_status VARCHAR(50) DEFAULT 'pending', -- pending, approved, flagged, blocked
    sensitivity_score DECIMAL(3,2), -- 敏感度评分 0.00-1.00
    flagged_keywords TEXT[], -- 检测到的敏感词
    audit_reason TEXT, -- 标记原因
    reviewed_by INTEGER REFERENCES users(id), -- 审核员ID
    reviewed_at TIMESTAMP WITH TIME ZONE,
    -- 时间和元数据
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_dialogue_audit_session ON dialogue_audit(session_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_audit_account ON dialogue_audit(account_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_audit_user ON dialogue_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_audit_status ON dialogue_audit(audit_status);
CREATE INDEX IF NOT EXISTS idx_dialogue_audit_created ON dialogue_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_dialogue_audit_flagged ON dialogue_audit(flagged_keywords) USING GIN;

-- 创建分区表（按时间分区，每月一个分区）
-- 注意：PostgreSQL 10+ 支持声明式分区

-- 添加注释
COMMENT ON TABLE dialogue_audit IS 'AI对话审计表，记录所有对话内容用于监管审查';
COMMENT ON COLUMN dialogue_audit.audit_status IS '审查状态：pending待审核, approved已通过, flagged已标记, blocked已拦截';
COMMENT ON COLUMN dialogue_audit.sensitivity_score IS '敏感度评分，0-1之间，越高越敏感';
COMMENT ON COLUMN dialogue_audit.message_hash IS '内容SHA256哈希，用于完整性校验';

-- 创建审计汇总统计视图
CREATE OR REPLACE VIEW dialogue_audit_stats AS
SELECT
    DATE_TRUNC('day', created_at) AS audit_date,
    COUNT(*) AS total_messages,
    COUNT(*) FILTER (WHERE audit_status = 'flagged') AS flagged_count,
    COUNT(*) FILTER (WHERE audit_status = 'blocked') AS blocked_count,
    AVG(sensitivity_score) AS avg_sensitivity,
    COUNT(DISTINCT session_id) AS unique_sessions
FROM dialogue_audit
GROUP BY DATE_TRUNC('day', created_at);

-- 创建敏感词检测函数
CREATE OR REPLACE FUNCTION check_sensitive_content(content TEXT, keywords TEXT[])
RETURNS TABLE(
    has_sensitive BOOLEAN,
    matched_words TEXT[],
    sensitivity_score DECIMAL(3,2)
) AS $$
DECLARE
    matched TEXT[] := ARRAY[]::TEXT[];
    word TEXT;
    match_count INTEGER := 0;
BEGIN
    FOREACH word IN ARRAY keywords
    LOOP
        IF content ILIKE '%' || word || '%' THEN
            matched := array_append(matched, word);
            match_count := match_count + 1;
        END IF;
    END LOOP;

    has_sensitive := match_count > 0;
    matched_words := matched;
    -- 简单计算敏感度：每个敏感词+0.2，最高1.0
    sensitivity_score := LEAST(match_count * 0.2, 1.0);

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
