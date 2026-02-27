-- News Service 股票分类映射表
-- 支持板块、行业、概念查询
-- 版本: 1.0
-- 最后更新: 2026-02-11

-- 创建股票分类表
CREATE TABLE IF NOT EXISTS stock_classification (
    id SERIAL PRIMARY KEY,

    -- 股票信息
    stock_code VARCHAR(20) NOT NULL,
    stock_name VARCHAR(100),

    -- 分类信息
    category_type VARCHAR(20) NOT NULL CHECK (category_type IN ('sector', 'industry', 'concept')),
    category_name VARCHAR(100) NOT NULL,

    -- 权重（在分类中的重要性）
    weight FLOAT DEFAULT 1.0 CHECK (weight >= 0.0 AND weight <= 1.0),

    -- 是否为主要分类
    is_primary BOOLEAN DEFAULT FALSE,

    -- 元数据（JSON格式，存储额外信息）
    metadata JSONB DEFAULT '{}',

    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- 唯一约束：股票代码+分类类型+分类名称
    UNIQUE(stock_code, category_type, category_name)
);

-- 添加表注释
COMMENT ON TABLE stock_classification IS '股票分类映射表，存储股票与板块、行业、概念的关联关系';
COMMENT ON COLUMN stock_classification.stock_code IS '股票代码，如 000001.SZ';
COMMENT ON COLUMN stock_classification.stock_name IS '股票名称';
COMMENT ON COLUMN stock_classification.category_type IS '分类类型：sector(板块)/industry(行业)/concept(概念)';
COMMENT ON COLUMN stock_classification.category_name IS '分类名称，如 "银行", "科技", "人工智能"';
COMMENT ON COLUMN stock_classification.weight IS '权重，0-1，表示股票在该分类中的重要性';
COMMENT ON COLUMN stock_classification.is_primary IS '是否为主要分类';
COMMENT ON COLUMN stock_classification.metadata IS '元数据，JSON格式存储额外信息';

-- 创建索引
-- 按股票代码查询分类
CREATE INDEX IF NOT EXISTS idx_stock_classification_code
    ON stock_classification (stock_code);

-- 按分类类型和名称查询股票
CREATE INDEX IF NOT EXISTS idx_stock_classification_category
    ON stock_classification (category_type, category_name);

-- 复合索引：分类类型+名称+权重（用于排序）
CREATE INDEX IF NOT EXISTS idx_stock_classification_category_weight
    ON stock_classification (category_type, category_name, weight DESC);

-- 主分类索引
CREATE INDEX IF NOT EXISTS idx_stock_classification_primary
    ON stock_classification (category_type, category_name) WHERE is_primary = TRUE;

-- 创建更新时间触发器
DROP TRIGGER IF EXISTS update_stock_classification_updated_at ON stock_classification;
CREATE TRIGGER update_stock_classification_updated_at
    BEFORE UPDATE ON stock_classification
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 创建视图：分类统计
CREATE OR REPLACE VIEW category_stats AS
SELECT
    category_type,
    category_name,
    COUNT(*) as stock_count,
    AVG(weight) as avg_weight,
    COUNT(*) FILTER (WHERE is_primary = TRUE) as primary_count
FROM stock_classification
GROUP BY category_type, category_name
ORDER BY category_type, stock_count DESC;

COMMENT ON VIEW category_stats IS '分类统计视图，显示每个分类下的股票数量';

-- 创建视图：股票分类汇总
CREATE OR REPLACE VIEW stock_category_summary AS
SELECT
    stock_code,
    stock_name,
    ARRAY_AGG(category_name) FILTER (WHERE category_type = 'sector') as sectors,
    ARRAY_AGG(category_name) FILTER (WHERE category_type = 'industry') as industries,
    ARRAY_AGG(category_name) FILTER (WHERE category_type = 'concept') as concepts
FROM stock_classification
GROUP BY stock_code, stock_name;

COMMENT ON VIEW stock_category_summary IS '股票分类汇总视图，显示每只股票所属的所有分类';

-- 插入示例数据：板块分类
INSERT INTO stock_classification (stock_code, stock_name, category_type, category_name, weight, is_primary) VALUES
-- 银行板块
('000001.SZ', '平安银行', 'sector', '银行', 0.9, TRUE),
('600000.SH', '浦发银行', 'sector', '银行', 0.9, TRUE),
('601398.SH', '工商银行', 'sector', '银行', 0.95, TRUE),
('601288.SH', '农业银行', 'sector', '银行', 0.95, TRUE),
-- 房地产板块
('000002.SZ', '万科A', 'sector', '房地产', 0.9, TRUE),
('600048.SH', '保利发展', 'sector', '房地产', 0.85, TRUE),
-- 白酒板块
('600519.SH', '贵州茅台', 'sector', '白酒', 0.95, TRUE),
('000858.SZ', '五粮液', 'sector', '白酒', 0.9, TRUE),
('002304.SZ', '洋河股份', 'sector', '白酒', 0.8, TRUE),
-- 科技板块
('000063.SZ', '中兴通讯', 'sector', '通信设备', 0.85, TRUE),
('600498.SH', '烽火通信', 'sector', '通信设备', 0.75, FALSE),
-- 新能源板块
('300750.SZ', '宁德时代', 'sector', '新能源', 0.95, TRUE),
('002594.SZ', '比亚迪', 'sector', '新能源', 0.9, TRUE),
('601012.SH', '隆基绿能', 'sector', '新能源', 0.85, TRUE)
ON CONFLICT (stock_code, category_type, category_name) DO NOTHING;

-- 插入示例数据：行业分类
INSERT INTO stock_classification (stock_code, stock_name, category_type, category_name, weight, is_primary) VALUES
-- 金融业
('000001.SZ', '平安银行', 'industry', '金融业', 0.9, TRUE),
('600000.SH', '浦发银行', 'industry', '金融业', 0.9, TRUE),
('601398.SH', '工商银行', 'industry', '金融业', 0.95, TRUE),
-- 房地产业
('000002.SZ', '万科A', 'industry', '房地产业', 0.9, TRUE),
('600048.SH', '保利发展', 'industry', '房地产业', 0.85, TRUE),
-- 消费品
('600519.SH', '贵州茅台', 'industry', '消费品', 0.95, TRUE),
('000858.SZ', '五粮液', 'industry', '消费品', 0.9, TRUE),
-- 制造业
('300750.SZ', '宁德时代', 'industry', '制造业', 0.9, TRUE),
('002594.SZ', '比亚迪', 'industry', '制造业', 0.85, TRUE),
-- 通信业
('000063.SZ', '中兴通讯', 'industry', '通信业', 0.9, TRUE)
ON CONFLICT (stock_code, category_type, category_name) DO NOTHING;

-- 插入示例数据：概念分类
INSERT INTO stock_classification (stock_code, stock_name, category_type, category_name, weight, is_primary) VALUES
-- 人工智能概念
('000063.SZ', '中兴通讯', 'concept', '人工智能', 0.7, FALSE),
('600498.SH', '烽火通信', 'concept', '人工智能', 0.6, FALSE),
-- 锂电池概念
('300750.SZ', '宁德时代', 'concept', '锂电池', 0.95, TRUE),
('002594.SZ', '比亚迪', 'concept', '锂电池', 0.8, FALSE),
('601012.SH', '隆基绿能', 'concept', '锂电池', 0.6, FALSE),
-- 5G概念
('000063.SZ', '中兴通讯', 'concept', '5G', 0.85, TRUE),
('600498.SH', '烽火通信', 'concept', '5G', 0.8, TRUE),
-- 新能源车概念
('300750.SZ', '宁德时代', 'concept', '新能源车', 0.9, TRUE),
('002594.SZ', '比亚迪', 'concept', '新能源车', 0.9, TRUE),
-- 白酒概念
('600519.SH', '贵州茅台', 'concept', '白酒', 0.95, TRUE),
('000858.SZ', '五粮液', 'concept', '白酒', 0.9, TRUE),
('002304.SZ', '洋河股份', 'concept', '白酒', 0.75, FALSE)
ON CONFLICT (stock_code, category_type, category_name) DO NOTHING;

-- 创建查询函数：获取分类下的所有股票
CREATE OR REPLACE FUNCTION get_stocks_by_category(
    p_category_type VARCHAR(20),
    p_category_name VARCHAR(100)
)
RETURNS TABLE (
    stock_code VARCHAR(20),
    stock_name VARCHAR(100),
    weight FLOAT,
    is_primary BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sc.stock_code,
        sc.stock_name,
        sc.weight,
        sc.is_primary
    FROM stock_classification sc
    WHERE sc.category_type = p_category_type
      AND sc.category_name = p_category_name
    ORDER BY sc.weight DESC, sc.stock_code;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_stocks_by_category(VARCHAR, VARCHAR) IS
'根据分类类型和名称查询该分类下的所有股票，按权重降序排列';

-- 创建查询函数：获取股票的所有分类
CREATE OR REPLACE FUNCTION get_categories_by_stock(
    p_stock_code VARCHAR(20)
)
RETURNS TABLE (
    category_type VARCHAR(20),
    category_name VARCHAR(100),
    weight FLOAT,
    is_primary BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sc.category_type,
        sc.category_name,
        sc.weight,
        sc.is_primary
    FROM stock_classification sc
    WHERE sc.stock_code = p_stock_code
    ORDER BY sc.category_type, sc.weight DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_categories_by_stock(VARCHAR) IS
'根据股票代码查询该股票所属的所有分类';

-- 验证数据
SELECT 'stock_classification table created successfully' as status;
SELECT COUNT(*) as total_records FROM stock_classification;
SELECT category_type, COUNT(DISTINCT category_name) as category_count FROM stock_classification GROUP BY category_type;
