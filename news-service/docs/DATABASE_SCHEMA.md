# News Service 数据库设计

## 数据库信息

- **数据库名**: `stock_race_news`
- **类型**: PostgreSQL 15+
- **字符集**: UTF-8

## 表结构

### 1. news_articles - 新闻文章表

存储从传统新闻媒体采集的新闻。

```sql
CREATE TABLE news_articles (
    id VARCHAR(32) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    summary TEXT,
    url VARCHAR(1000) NOT NULL,
    source VARCHAR(50) NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    category VARCHAR(50),
    tags TEXT[],
    related_stocks TEXT[],
    related_sectors TEXT[],
    sentiment_score FLOAT,
    sentiment_type VARCHAR(20),
    UNIQUE(url, title)
);

-- 索引
CREATE INDEX idx_news_published ON news_articles(published_at DESC);
CREATE INDEX idx_news_source ON news_articles(source);
CREATE INDEX idx_news_stocks ON news_articles USING GIN(related_stocks);
CREATE INDEX idx_news_category ON news_articles(category);
CREATE INDEX idx_news_sentiment ON news_articles(sentiment_type);
```

### 2. social_media_posts - 社交媒体帖子表

存储从社交媒体平台采集的帖子。

```sql
CREATE TABLE social_media_posts (
    id VARCHAR(32) PRIMARY KEY,
    platform VARCHAR(50) NOT NULL,
    author VARCHAR(100) NOT NULL,
    author_followers INTEGER DEFAULT 0,
    content TEXT NOT NULL,
    title VARCHAR(500),
    read_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    forward_count INTEGER DEFAULT 0,
    mentioned_stocks TEXT[],
    stock_sentiment JSONB,
    sentiment_score FLOAT,
    sentiment_type VARCHAR(20),
    crowd_emotion VARCHAR(20),
    published_at TIMESTAMPTZ NOT NULL,
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(platform, id)
);

-- 索引
CREATE INDEX idx_social_platform ON social_media_posts(platform);
CREATE INDEX idx_social_published ON social_media_posts(published_at DESC);
CREATE INDEX idx_social_stocks ON social_media_posts USING GIN(mentioned_stocks);
CREATE INDEX idx_social_sentiment ON social_media_posts(sentiment_type);
CREATE INDEX idx_social_author ON social_media_posts(author);
```

### 3. sentiment_index - 市场情绪指数表

存储每小时计算的市场情绪指数。

```sql
CREATE TABLE sentiment_index (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    overall_sentiment VARCHAR(20) NOT NULL,
    overall_score FLOAT NOT NULL,
    fear_greed_index INTEGER,
    crowd_attention VARCHAR(20),
    hot_topics TEXT[],
    source_breakdown JSONB,
    stock_sentiment JSONB,
    UNIQUE(timestamp)
);

-- 索引
CREATE INDEX idx_sentiment_time ON sentiment_index(timestamp DESC);
```

### 4. data_source_stats - 数据源统计表

记录各数据源的采集统计信息。

```sql
CREATE TABLE data_source_stats (
    id SERIAL PRIMARY KEY,
    source_name VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    request_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    avg_response_time FLOAT,
    UNIQUE(source_name, date)
);

-- 索引
CREATE INDEX idx_stats_source ON data_source_stats(source_name);
CREATE INDEX idx_stats_date ON data_source_stats(date DESC);
```

## 初始化脚本

```sql
-- scripts/init_db.sql

-- 创建数据库（手动执行）
-- CREATE DATABASE stock_race_news;

-- 连接数据库后执行
\c stock_race_news;

-- 创建表
-- [上述所有CREATE TABLE语句]

-- 创建初始数据
INSERT INTO sentiment_index (
    timestamp, overall_sentiment, overall_score,
    fear_greed_index, crowd_attention, hot_topics
) VALUES (
    NOW(), 'neutral', 0.0, 50, 'medium', ARRAY[]::TEXT[]
);
```

## 数据保留策略

| 表名 | 保留期限 | 清理策略 |
|------|----------|----------|
| news_articles | 90天 | 自动清理旧数据 |
| social_media_posts | 30天 | 自动清理旧数据 |
| sentiment_index | 1年 | 保留历史趋势 |
| data_source_stats | 1年 | 保留统计历史 |
