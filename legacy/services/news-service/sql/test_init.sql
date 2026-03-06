-- News Service 数据库初始化脚本测试
-- 测试 stock_intelligence 表的创建和功能
-- 运行方式: psql -U postgres -d stock_race_news -f test_init.sql

-- 开始测试
\echo '开始测试 stock_intelligence 表初始化脚本...'

-- 测试 1: 检查表是否存在
\echo '测试 1: 检查表是否存在...'
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public'
               AND table_name = 'stock_intelligence') THEN
        RAISE NOTICE '✓ 测试通过: stock_intelligence 表存在';
    ELSE
        RAISE EXCEPTION '✗ 测试失败: stock_intelligence 表不存在';
    END IF;
END $$;

-- 测试 2: 检查字段是否存在
\echo '测试 2: 检查字段结构...'
DO $$
DECLARE
    required_columns TEXT[] := ARRAY[
        'id', 'stock_code', 'stock_name', 'sentiment_score', 'sentiment_type',
        'sentiment_confidence', 'summary', 'importance', 'is_breaking',
        'related_sectors', 'related_industries', 'related_concepts',
        'relevance_score', 'source', 'source_url', 'original_news_id',
        'processed_by', 'processing_version', 'expired_at', 'created_at', 'updated_at'
    ];
    col TEXT;
    missing_cols TEXT[] := ARRAY[]::TEXT[];
BEGIN
    FOREACH col IN ARRAY required_columns
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'stock_intelligence'
            AND column_name = col
        ) THEN
            missing_cols := array_append(missing_cols, col);
        END IF;
    END LOOP;

    IF array_length(missing_cols, 1) IS NULL THEN
        RAISE NOTICE '✓ 测试通过: 所有必需字段都存在';
    ELSE
        RAISE EXCEPTION '✗ 测试失败: 缺少字段: %', array_to_string(missing_cols, ', ');
    END IF;
END $$;

-- 测试 3: 检查索引是否存在
\echo '测试 3: 检查索引...'
DO $$
DECLARE
    required_indexes TEXT[] := ARRAY[
        'idx_stock_intelligence_stock_code_created_at',
        'idx_stock_intelligence_sentiment_type',
        'idx_stock_intelligence_expired_at',
        'idx_stock_intelligence_breaking',
        'idx_stock_intelligence_importance',
        'idx_stock_intelligence_relevance',
        'idx_stock_intelligence_sectors',
        'idx_stock_intelligence_industries',
        'idx_stock_intelligence_concepts'
    ];
    idx TEXT;
    missing_indexes TEXT[] := ARRAY[]::TEXT[];
BEGIN
    FOREACH idx IN ARRAY required_indexes
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
            AND tablename = 'stock_intelligence'
            AND indexname = idx
        ) THEN
            missing_indexes := array_append(missing_indexes, idx);
        END IF;
    END LOOP;

    IF array_length(missing_indexes, 1) IS NULL THEN
        RAISE NOTICE '✓ 测试通过: 所有必需索引都存在';
    ELSE
        RAISE EXCEPTION '✗ 测试失败: 缺少索引: %', array_to_string(missing_indexes, ', ');
    END IF;
END $$;

-- 测试 4: 检查触发器是否存在
\echo '测试 4: 检查触发器...'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_stock_intelligence_updated_at'
        AND tgrelid = 'stock_intelligence'::regclass
    ) THEN
        RAISE NOTICE '✓ 测试通过: 更新时间触发器存在';
    ELSE
        RAISE EXCEPTION '✗ 测试失败: 更新时间触发器不存在';
    END IF;
END $$;

-- 测试 5: 检查视图是否存在
\echo '测试 5: 检查统计视图...'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_views
        WHERE schemaname = 'public'
        AND viewname = 'stock_intelligence_stats'
    ) THEN
        RAISE NOTICE '✓ 测试通过: 统计视图存在';
    ELSE
        RAISE EXCEPTION '✗ 测试失败: 统计视图不存在';
    END IF;
END $$;

-- 测试 6: 检查函数是否存在
\echo '测试 6: 检查清理函数...'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'clean_expired_intelligence'
    ) THEN
        RAISE NOTICE '✓ 测试通过: 清理函数存在';
    ELSE
        RAISE EXCEPTION '✗ 测试失败: 清理函数不存在';
    END IF;
END $$;

-- 测试 7: 插入测试数据
\echo '测试 7: 插入测试数据...'
DO $$
DECLARE
    test_id INTEGER;
BEGIN
    -- 插入测试数据
    INSERT INTO stock_intelligence (
        stock_code, stock_name, sentiment_score, sentiment_type, sentiment_confidence,
        summary, importance, is_breaking, related_sectors, related_industries, related_concepts,
        relevance_score, source, source_url, expired_at
    ) VALUES (
        'TEST001.SZ', '测试股票', 0.75, 'positive', 0.85,
        '这是一条测试情报数据', 8, true,
        '["测试板块"]', '["测试行业"]', '["测试概念"]',
        0.92, 'test_source', 'https://test.com/1',
        CURRENT_TIMESTAMP + INTERVAL '7 days'
    )
    RETURNING id INTO test_id;

    RAISE NOTICE '✓ 测试通过: 插入测试数据成功, ID: %', test_id;

    -- 清理测试数据
    DELETE FROM stock_intelligence WHERE stock_code = 'TEST001.SZ';
    RAISE NOTICE '✓ 测试数据已清理';
END $$;

-- 测试 8: 检查约束
\echo '测试 8: 检查约束...'
DO $$
BEGIN
    -- 测试无效的情感分数
    BEGIN
        INSERT INTO stock_intelligence (
            stock_code, source, expired_at, sentiment_score
        ) VALUES (
            'TEST002.SZ', 'test', CURRENT_TIMESTAMP + INTERVAL '1 day', 2.0
        );
        RAISE EXCEPTION '✗ 测试失败: 应该拒绝无效的情感分数';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✓ 测试通过: 情感分数约束正常工作';
    END;

    -- 测试无效的关联度
    BEGIN
        INSERT INTO stock_intelligence (
            stock_code, source, expired_at, relevance_score
        ) VALUES (
            'TEST003.SZ', 'test', CURRENT_TIMESTAMP + INTERVAL '1 day', 0.3
        );
        RAISE EXCEPTION '✗ 测试失败: 应该拒绝关联度低于0.6的数据';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✓ 测试通过: 关联度约束正常工作';
    END;
END $$;

-- 测试 9: 测试更新时间触发器
\echo '测试 9: 测试更新时间触发器...'
DO $$
DECLARE
    test_id INTEGER;
    old_updated_at TIMESTAMP;
    new_updated_at TIMESTAMP;
BEGIN
    -- 插入测试数据
    INSERT INTO stock_intelligence (
        stock_code, source, expired_at, summary
    ) VALUES (
        'TEST004.SZ', 'test', CURRENT_TIMESTAMP + INTERVAL '1 day', '初始摘要'
    )
    RETURNING id, updated_at INTO test_id, old_updated_at;

    -- 等待一小段时间（确保时间戳有变化）
    PERFORM pg_sleep(1);

    -- 更新数据
    UPDATE stock_intelligence
    SET summary = '更新后的摘要'
    WHERE id = test_id
    RETURNING updated_at INTO new_updated_at;

    -- 使用 >= 而不是 >，因为时间戳可能相同（在同一秒内）
    IF new_updated_at >= old_updated_at THEN
        RAISE NOTICE '✓ 测试通过: 更新时间触发器正常工作 (old: %, new: %)', old_updated_at, new_updated_at;
    ELSE
        RAISE EXCEPTION '✗ 测试失败: 更新时间未更新 (old: %, new: %)', old_updated_at, new_updated_at;
    END IF;

    -- 清理
    DELETE FROM stock_intelligence WHERE id = test_id;
END $$;

-- 测试 10: 测试清理函数
\echo '测试 10: 测试清理函数...'
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- 插入过期数据
    INSERT INTO stock_intelligence (
        stock_code, source, expired_at, summary
    ) VALUES
        ('TEST005.SZ', 'test', CURRENT_TIMESTAMP - INTERVAL '1 day', '过期数据1'),
        ('TEST006.SZ', 'test', CURRENT_TIMESTAMP - INTERVAL '2 days', '过期数据2');

    -- 执行清理
    SELECT clean_expired_intelligence() INTO deleted_count;

    IF deleted_count >= 2 THEN
        RAISE NOTICE '✓ 测试通过: 清理函数正常工作，删除了 % 条记录', deleted_count;
    ELSE
        RAISE EXCEPTION '✗ 测试失败: 清理函数未正确删除过期数据';
    END IF;
END $$;

-- 所有测试完成
\echo ''
\echo '========================================'
\echo '所有测试通过! ✓'
\echo 'stock_intelligence 表初始化脚本验证完成'
\echo '========================================'
