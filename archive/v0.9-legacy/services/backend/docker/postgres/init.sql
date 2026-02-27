-- Stock Race 数据库初始化脚本
-- 创建扩展和配置

-- 启用常用扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- 创建监控角色
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'monitor') THEN
        CREATE ROLE monitor WITH LOGIN PASSWORD 'monitor_password' NOSUPERUSER INHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
END
$$;

-- 授予监控权限
GRANT pg_monitor TO monitor;

-- 设置数据库参数（优化性能）
ALTER DATABASE stock_race SET random_page_cost = 1.1;
ALTER DATABASE stock_race SET effective_cache_size = '4GB';
ALTER DATABASE stock_race SET maintenance_work_mem = '256MB';
ALTER DATABASE stock_race SET work_mem = '16MB';

-- 创建备份目录（如果使用物理备份）
-- 注意：这需要在容器启动时挂载相应的卷

-- 记录初始化完成
DO $$
BEGIN
    RAISE NOTICE 'Stock Race 数据库初始化完成 - %', now();
END
$$;