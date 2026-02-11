-- News Service 数据库初始化脚本
-- 创建 stock_intelligence 表及相关索引
-- 版本: 1.0
-- 最后更新: 2026-02-11

-- 启用 UUID 扩展（如果需要）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 创建情感类型枚举
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sentiment_type') THEN
        CREATE TYPE sentiment_type AS ENUM ('positive', 'negative', 'neutral');
    END IF;
END$$;

-- 创建影响级别枚举
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'impact_level') THEN
        CREATE TYPE impact_level AS ENUM ('high', 'medium', 'low');
    END IF;
END$$;

-- 创建 stock_intelligence 表
-- 存储股票情报数据，支持 AI 决策查询
CREATE TABLE IF NOT EXISTS stock_intelligence (
    -- 主键
    id SERIAL PRIMARY KEY,

    -- 股票信息
    stock_code VARCHAR(20) NOT NULL,
    stock_name VARCHAR(100),

    -- 情感分析结果
    sentiment_score FLOAT CHECK (sentiment_score >= -1.0 AND sentiment_score <= 1.0),
    sentiment_type sentiment_type DEFAULT 'neutral',
    sentiment_confidence FLOAT CHECK (sentiment_confidence >= 0.0 AND sentiment_confidence <= 1.0),

    -- 情报摘要（精简存储，控制在100字符以内）
    summary VARCHAR(500),

    -- 重要性评分（1-10）
    importance INTEGER CHECK (importance >= 1 AND importance <= 10),

    -- 是否为突发新闻
    is_breaking BOOLEAN DEFAULT FALSE,

    -- 关联板块/行业/概念（JSONB 格式，灵活存储）
    related_sectors JSONB DEFAULT '[]',
    related_industries JSONB DEFAULT '[]',
    related_concepts JSONB DEFAULT '[]',

    -- 关联度评分（0-1）
    relevance_score FLOAT CHECK (relevance_score >= 0.0 AND relevance_score <= 1.0),

    -- 来源信息
    source VARCHAR(100) NOT NULL,
    source_url VARCHAR(1000),

    -- 原始新闻ID（用于追溯）
    original_news_id VARCHAR(100),

    -- 处理元数据
    processed_by VARCHAR(50) DEFAULT 'deepseek',
    processing_version VARCHAR(20) DEFAULT '1.0',

    -- 时间戳
    expired_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 约束
    CONSTRAINT valid_relevance CHECK (relevance_score IS NULL OR relevance_score >= 0.6)
);

-- 添加表注释
COMMENT ON TABLE stock_intelligence IS '股票情报表，存储经 DeepSeek 处理后的结构化新闻情报';

-- 添加字段注释
COMMENT ON COLUMN stock_intelligence.stock_code IS '股票代码，如 000001.SZ';
COMMENT ON COLUMN stock_intelligence.stock_name IS '股票名称';
COMMENT ON COLUMN stock_intelligence.sentiment_score IS '情感分数，-1.0(极度负面) 到 1.0(极度正面)';
COMMENT ON COLUMN stock_intelligence.sentiment_type IS '情感类型：positive/negative/neutral';
COMMENT ON COLUMN stock_intelligence.sentiment_confidence IS '情感分析置信度，0.0-1.0';
COMMENT ON COLUMN stock_intelligence.summary IS '情报摘要，控制在100字符以内';
COMMENT ON COLUMN stock_intelligence.importance IS '重要性评分，1-10';
COMMENT ON COLUMN stock_intelligence.is_breaking IS '是否为突发新闻';
COMMENT ON COLUMN stock_intelligence.related_sectors IS '关联板块列表，JSONB格式';
COMMENT ON COLUMN stock_intelligence.related_industries IS '关联行业列表，JSONB格式';
COMMENT ON COLUMN stock_intelligence.related_concepts IS '关联概念列表，JSONB格式';
COMMENT ON COLUMN stock_intelligence.relevance_score IS '与A股关联度评分，0-1，低于0.6的数据会被过滤';
COMMENT ON COLUMN stock_intelligence.source IS '数据来源，如 sina_finance, eastmoney_news';
COMMENT ON COLUMN stock_intelligence.source_url IS '原始新闻URL';
COMMENT ON COLUMN stock_intelligence.original_news_id IS '原始新闻ID，用于追溯';
COMMENT ON COLUMN stock_intelligence.processed_by IS '处理器类型，默认 deepseek';
COMMENT ON COLUMN stock_intelligence.processing_version IS '处理版本号';
COMMENT ON COLUMN stock_intelligence.expired_at IS '数据过期时间，默认7天后';
COMMENT ON COLUMN stock_intelligence.created_at IS '记录创建时间';
COMMENT ON COLUMN stock_intelligence.updated_at IS '记录更新时间';

-- 创建索引
-- 主查询索引：按股票代码和创建时间查询
CREATE INDEX IF NOT EXISTS idx_stock_intelligence_stock_code_created_at
    ON stock_intelligence (stock_code, created_at DESC);

-- 情感分析查询索引
CREATE INDEX IF NOT EXISTS idx_stock_intelligence_sentiment_type
    ON stock_intelligence (sentiment_type) WHERE sentiment_type IS NOT NULL;

-- 过期时间索引（用于自动清理）
CREATE INDEX IF NOT EXISTS idx_stock_intelligence_expired_at
    ON stock_intelligence (expired_at);

-- 突发新闻索引
CREATE INDEX IF NOT EXISTS idx_stock_intelligence_breaking
    ON stock_intelligence (is_breaking, created_at DESC) WHERE is_breaking = TRUE;

-- 重要性索引
CREATE INDEX IF NOT EXISTS idx_stock_intelligence_importance
    ON stock_intelligence (importance DESC, created_at DESC);

-- 关联度索引
CREATE INDEX IF NOT EXISTS idx_stock_intelligence_relevance
    ON stock_intelligence (relevance_score DESC) WHERE relevance_score IS NOT NULL;

-- 板块查询 GIN 索引（支持 JSONB 查询）
CREATE INDEX IF NOT EXISTS idx_stock_intelligence_sectors
    ON stock_intelligence USING GIN (related_sectors);

-- 行业查询 GIN 索引
CREATE INDEX IF NOT EXISTS idx_stock_intelligence_industries
    ON stock_intelligence USING GIN (related_industries);

-- 概念查询 GIN 索引
CREATE INDEX IF NOT EXISTS idx_stock_intelligence_concepts
    ON stock_intelligence USING GIN (related_concepts);

-- 全文搜索索引（摘要内容）
CREATE INDEX IF NOT EXISTS idx_stock_intelligence_summary_search
    ON stock_intelligence USING gin(to_tsvector('chinese', summary));

-- 复合查询索引：股票代码 + 情感类型
CREATE INDEX IF NOT EXISTS idx_stock_intelligence_code_sentiment
    ON stock_intelligence (stock_code, sentiment_type, created_at DESC);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_stock_intelligence_updated_at ON stock_intelligence;
CREATE TRIGGER update_stock_intelligence_updated_at
    BEFORE UPDATE ON stock_intelligence
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 创建自动过期数据清理函数
CREATE OR REPLACE FUNCTION clean_expired_intelligence()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM stock_intelligence
    WHERE expired_at < CURRENT_TIMESTAMP;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION clean_expired_intelligence() IS '清理已过期的情报数据，返回删除的记录数';

-- 创建统计视图
CREATE OR REPLACE VIEW stock_intelligence_stats AS
SELECT
    stock_code,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE sentiment_type = 'positive') as positive_count,
    COUNT(*) FILTER (WHERE sentiment_type = 'negative') as negative_count,
    COUNT(*) FILTER (WHERE sentiment_type = 'neutral') as neutral_count,
    AVG(sentiment_score) as avg_sentiment_score,
    MAX(created_at) as latest_intelligence_at,
    COUNT(*) FILTER (WHERE is_breaking = TRUE) as breaking_count
FROM stock_intelligence
WHERE expired_at > CURRENT_TIMESTAMP
GROUP BY stock_code;

COMMENT ON VIEW stock_intelligence_stats IS '股票情报统计视图，按股票代码分组统计';

-- 插入测试数据（可选，用于验证）
-- 取消注释以下行以插入测试数据
/*
INSERT INTO stock_intelligence (
    stock_code, stock_name, sentiment_score, sentiment_type, sentiment_confidence,
    summary, importance, is_breaking, related_sectors, related_industries, related_concepts,
    relevance_score, source, source_url, expired_at
) VALUES
(
    '000001.SZ', '平安银行', 0.75, 'positive', 0.85,
    '平安银行发布年度业绩预告，净利润同比增长15%', 8, true,
    '["银行", "金融"]', '["金融业"]', '["业绩预增", "银行股"]',
    0.92, 'sina_finance', 'https://finance.sina.com.cn/test/1',
    CURRENT_TIMESTAMP + INTERVAL '7 days'
),
(
    '000002.SZ', '万科A', -0.45, 'negative', 0.78,
    '房地产行业政策收紧，万科股价承压', 7, false,
    '["房地产", "地产"]', '["房地产业"]', '["政策调控", "地产股"]',
    0.88, 'eastmoney_news', 'https://finance.eastmoney.com/test/2',
    CURRENT_TIMESTAMP + INTERVAL '7 days'
),
(
    '600519.SH', '贵州茅台', 0.32, 'positive', 0.72,
    '白酒行业消费升级趋势明显，茅台需求稳定', 6, false,
    '["白酒", "消费"]', '["消费品"]', '["消费升级", "白酒股"]',
    0.85, 'xueqiu', 'https://xueqiu.com/test/3',
    CURRENT_TIMESTAMP + INTERVAL '7 days'
);
*/

-- 验证表结构
SELECT 'stock_intelligence table created successfully' as status;
