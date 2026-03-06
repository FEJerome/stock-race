-- AI决策功能增强迁移脚本
-- 创建日期：2026-02-07
-- 目的：增强DecisionLog表，支持完整提示词存储和用户偏好集成

-- 1. 为AI账户添加增强配置字段
ALTER TABLE ai_accounts
ADD COLUMN IF NOT EXISTS preference_config JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS prompt_template_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS token_budget INTEGER DEFAULT 1500,
ADD COLUMN IF NOT EXISTS last_decision_at TIMESTAMPTZ;

-- 为新增字段添加注释
COMMENT ON COLUMN ai_accounts.preference_config IS '用户决策偏好配置（JSON格式）';
COMMENT ON COLUMN ai_accounts.prompt_template_id IS '使用的提示词模板标识';
COMMENT ON COLUMN ai_accounts.token_budget IS '每次决策的token预算限制';
COMMENT ON COLUMN ai_accounts.last_decision_at IS '上次决策时间';

-- 2. 增强DecisionLog表
ALTER TABLE decision_logs
ADD COLUMN IF NOT EXISTS prompt_template VARCHAR(100),
ADD COLUMN IF NOT EXISTS prompt_variables JSONB,
ADD COLUMN IF NOT EXISTS full_prompt TEXT,
ADD COLUMN IF NOT EXISTS token_count INTEGER,
ADD COLUMN IF NOT EXISTS model_context JSONB,
ADD COLUMN IF NOT EXISTS user_preferences JSONB;

-- 为新增字段添加注释
COMMENT ON COLUMN decision_logs.prompt_template IS '使用的提示词模板标识';
COMMENT ON COLUMN decision_logs.prompt_variables IS '模板变量值（JSON格式）';
COMMENT ON COLUMN decision_logs.full_prompt IS '完整的提示词内容';
COMMENT ON COLUMN decision_logs.token_count IS '提示词token数量';
COMMENT ON COLUMN decision_logs.model_context IS '模型上下文信息（JSON格式）';
COMMENT ON COLUMN decision_logs.user_preferences IS '决策时使用的用户偏好（JSON格式）';

-- 3. 创建提示词模板表（可选，用于模板管理）
CREATE TABLE IF NOT EXISTS prompt_templates (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    template_text TEXT NOT NULL,
    template_type VARCHAR(50) NOT NULL DEFAULT 'decision',
    variables JSONB DEFAULT '[]',
    default_variables JSONB DEFAULT '{}',
    estimated_tokens INTEGER NOT NULL DEFAULT 500,
    version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INTEGER,
    tags VARCHAR(100)[]
);

-- 为提示词模板表添加注释
COMMENT ON TABLE prompt_templates IS '提示词模板表';
COMMENT ON COLUMN prompt_templates.id IS '模板标识（唯一）';
COMMENT ON COLUMN prompt_templates.name IS '模板名称';
COMMENT ON COLUMN prompt_templates.description IS '模板描述';
COMMENT ON COLUMN prompt_templates.template_text IS '模板文本（支持变量替换）';
COMMENT ON COLUMN prompt_templates.template_type IS '模板类型（decision/analysis/summary等）';
COMMENT ON COLUMN prompt_templates.variables IS '模板变量定义（JSON数组）';
COMMENT ON COLUMN prompt_templates.default_variables IS '默认变量值（JSON对象）';
COMMENT ON COLUMN prompt_templates.estimated_tokens IS '预估token数量';
COMMENT ON COLUMN prompt_templates.version IS '模板版本';
COMMENT ON COLUMN prompt_templates.is_active IS '是否激活';
COMMENT ON COLUMN prompt_templates.created_at IS '创建时间';
COMMENT ON COLUMN prompt_templates.updated_at IS '更新时间';
COMMENT ON COLUMN prompt_templates.created_by IS '创建者用户ID';
COMMENT ON COLUMN prompt_templates.tags IS '标签数组';

-- 4. 插入默认提示词模板
INSERT INTO prompt_templates (id, name, description, template_text, template_type, variables, default_variables, estimated_tokens, version) VALUES
(
    'default_decision_v1',
    '默认决策模板',
    '标准的AI交易决策模板',
    '请分析以下投资情况并提供交易建议：

账户信息：
{account_info}

当前持仓：
{positions}

股票数据：
{stock_data}

交易约束：
{constraints}

市场环境：
{market_conditions}

账户偏好：
{user_preferences}

当前时间：{current_time}

请基于以上信息，给出专业的交易决策建议。
考虑因素包括：
1. 技术分析（价格走势、成交量、技术指标）
2. 基本面分析（估值、财务数据、行业地位）
3. 风险收益比
4. 账户风险承受能力
5. 市场整体环境
6. 交易成本影响

请提供详细的决策理由和风险提示。',
    'decision',
    '["account_info", "positions", "stock_data", "constraints", "market_conditions", "user_preferences", "current_time"]',
    '{"user_preferences": "默认配置"}',
    800,
    '1.0.0'
),
(
    'conservative_decision_v1',
    '保守型决策模板',
    '适合风险厌恶型投资者的决策模板',
    '请分析以下投资情况并提供保守的交易建议：

账户信息：
{account_info}

当前持仓：
{positions}

股票数据：
{stock_data}

重要提示：本账户为保守型投资风格，请优先考虑以下原则：
1. 风险控制优先于收益追求
2. 避免高波动性股票
3. 优先考虑基本面稳健的公司
4. 控制单只股票持仓比例
5. 保留充足现金应对市场波动

交易约束：
{constraints}

市场环境：
{market_conditions}

账户偏好：
{user_preferences}

当前时间：{current_time}

请基于保守投资原则，给出专业的交易决策建议。',
    'decision',
    '["account_info", "positions", "stock_data", "constraints", "market_conditions", "user_preferences", "current_time"]',
    '{"user_preferences": "保守配置"}',
    900,
    '1.0.0'
),
(
    'aggressive_decision_v1',
    '激进型决策模板',
    '适合风险承受能力强的投资者的决策模板',
    '请分析以下投资情况并提供积极的交易建议：

账户信息：
{account_info}

当前持仓：
{positions}

股票数据：
{stock_data}

重要提示：本账户为激进型投资风格，可考虑以下策略：
1. 可适当追求高收益机会
2. 可考虑成长性较好的股票
3. 技术分析权重可适当提高
4. 可考虑行业轮动机会
5. 可适当使用杠杆思维（虚拟）

交易约束：
{constraints}

市场环境：
{market_conditions}

账户偏好：
{user_preferences}

当前时间：{current_time}

请基于积极投资原则，给出专业的交易决策建议。',
    'decision',
    '["account_info", "positions", "stock_data", "constraints", "market_conditions", "user_preferences", "current_time"]',
    '{"user_preferences": "激进配置"}',
    850,
    '1.0.0'
);

-- 5. 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_decision_logs_account_id ON decision_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_decision_logs_created_at ON decision_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_logs_prompt_template ON decision_logs(prompt_template);
CREATE INDEX IF NOT EXISTS idx_ai_accounts_preference_config ON ai_accounts USING GIN (preference_config);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_type_active ON prompt_templates(template_type, is_active);

-- 6. 更新Prisma schema（需要手动更新schema.prisma文件）
-- 注意：此部分需要在Prisma schema中手动添加相应字段定义

-- 7. 验证迁移结果
SELECT
    'AI账户表增强完成' as check_item,
    COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'ai_accounts'
    AND column_name IN ('preference_config', 'prompt_template_id', 'token_budget', 'last_decision_at')
HAVING COUNT(*) = 4

UNION ALL

SELECT
    'DecisionLog表增强完成' as check_item,
    COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'decision_logs'
    AND column_name IN ('prompt_template', 'prompt_variables', 'full_prompt', 'token_count', 'model_context', 'user_preferences')
HAVING COUNT(*) = 6

UNION ALL

SELECT
    '提示词模板表创建完成' as check_item,
    COUNT(*) as template_count
FROM prompt_templates
WHERE is_active = true;

-- 8. 输出迁移完成信息
SELECT 'AI决策功能增强迁移完成' as migration_status, NOW() as completed_at;