-- Initialize TimescaleDB for time-series stock data
-- This script runs when the TimescaleDB container starts

-- Create schema for time-series data
CREATE SCHEMA IF NOT EXISTS timeseries;

-- Set search path
SET search_path TO timeseries, public;

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Stock quotes table (real-time data)
CREATE TABLE IF NOT EXISTS stock_quotes (
    symbol VARCHAR(20) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    price DECIMAL(10, 4) NOT NULL,
    open DECIMAL(10, 4) NOT NULL,
    high DECIMAL(10, 4) NOT NULL,
    low DECIMAL(10, 4) NOT NULL,
    prev_close DECIMAL(10, 4) NOT NULL,
    change DECIMAL(10, 4) NOT NULL,
    change_percent DECIMAL(10, 4) NOT NULL,
    volume BIGINT NOT NULL,
    amount DECIMAL(20, 2) NOT NULL,
    bid_price DECIMAL(10, 4),
    ask_price DECIMAL(10, 4),
    bid_volume BIGINT,
    ask_volume BIGINT,
    PRIMARY KEY (symbol, timestamp)
);

-- Convert to hypertable
SELECT create_hypertable('stock_quotes', 'timestamp',
        if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_quotes_symbol_time ON stock_quotes (symbol, timestamp DESC);

-- Stock history table (historical data)
CREATE TABLE IF NOT EXISTS stock_history (
    symbol VARCHAR(20) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    interval VARCHAR(10) NOT NULL,
    open DECIMAL(10, 4) NOT NULL,
    high DECIMAL(10, 4) NOT NULL,
    low DECIMAL(10, 4) NOT NULL,
    close DECIMAL(10, 4) NOT NULL,
    volume BIGINT NOT NULL,
    amount DECIMAL(20, 2),
    adj_close DECIMAL(10, 4),
    vwap DECIMAL(10, 4),
    PRIMARY KEY (symbol, timestamp, interval)
);

-- Convert to hypertable
SELECT create_hypertable('stock_history', 'timestamp',
        if_not_exists => TRUE, chunk_time_interval => INTERVAL '7 days');

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_history_symbol_interval_time
    ON stock_history (symbol, interval, timestamp DESC);

-- Metadata table for stock information (in public schema)
SET search_path TO public;

CREATE TABLE IF NOT EXISTS stocks (
    symbol VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    exchange VARCHAR(10) NOT NULL,
    sector VARCHAR(50),
    market_cap DECIMAL(20, 2),
    pe_ratio DECIMAL(10, 2),
    pb_ratio DECIMAL(10, 2),
    dividend_yield DECIMAL(5, 2),
    listing_date TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for faster searches
CREATE INDEX IF NOT EXISTS idx_stocks_name ON stocks(name);
CREATE INDEX IF NOT EXISTS idx_stocks_exchange ON stocks(exchange);
CREATE INDEX IF NOT EXISTS idx_stocks_sector ON stocks(sector);

-- Create functions for common queries
CREATE OR REPLACE FUNCTION get_latest_quote(symbol_param VARCHAR(20))
RETURNS TABLE (
    symbol VARCHAR(20),
    price DECIMAL(10, 4),
    volume BIGINT,
    timestamp TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sq.symbol,
        sq.price,
        sq.volume,
        sq.timestamp
    FROM timeseries.stock_quotes sq
    WHERE sq.symbol = symbol_param
    ORDER BY sq.timestamp DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_price_history(
    symbol_param VARCHAR(20),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    interval_param VARCHAR(10) DEFAULT '1d'
)
RETURNS TABLE (
    timestamp TIMESTAMPTZ,
    symbol VARCHAR(20),
    open DECIMAL(10, 4),
    high DECIMAL(10, 4),
    low DECIMAL(10, 4),
    close DECIMAL(10, 4),
    volume BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sh.timestamp,
        sh.symbol,
        sh.open,
        sh.high,
        sh.low,
        sh.close,
        sh.volume
    FROM timeseries.stock_history sh
    WHERE sh.symbol = symbol_param
        AND sh.interval = interval_param
        AND sh.timestamp >= start_time
        AND sh.timestamp <= end_time
    ORDER BY sh.timestamp ASC;
END;
$$ LANGUAGE plpgsql;

-- Create retention policies
-- Keep stock quotes for 1 year
SELECT add_retention_policy('timeseries.stock_quotes', INTERVAL '1 year');
-- Keep stock history for 2 years
SELECT add_retention_policy('timeseries.stock_history', INTERVAL '2 years');

-- Insert sample data for testing
-- Stock metadata
INSERT INTO stocks (symbol, name, exchange, sector, market_cap, pe_ratio, pb_ratio, dividend_yield, listing_date, is_active) VALUES
('000001.SZ', '平安银行', 'SZ', 'financial', 300000000000.00, 8.50, 0.85, 2.50, '1991-04-03', true),
('000002.SZ', '万科A', 'SZ', 'real_estate', 200000000000.00, 6.80, 0.75, 3.20, '1991-01-29', true),
('000858.SZ', '五粮液', 'SZ', 'consumer', 600000000000.00, 25.30, 5.20, 1.80, '1998-04-27', true),
('600036.SH', '招商银行', 'SH', 'financial', 900000000000.00, 7.20, 0.92, 3.50, '2002-04-09', true),
('600519.SH', '贵州茅台', 'SH', 'consumer', 2200000000000.00, 30.50, 8.60, 1.20, '2001-08-27', true)
ON CONFLICT (symbol) DO UPDATE SET
    name = EXCLUDED.name,
    exchange = EXCLUDED.exchange,
    sector = EXCLUDED.sector,
    market_cap = EXCLUDED.market_cap,
    pe_ratio = EXCLUDED.pe_ratio,
    pb_ratio = EXCLUDED.pb_ratio,
    dividend_yield = EXCLUDED.dividend_yield,
    listing_date = EXCLUDED.listing_date,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Sample stock quotes (last 2 days)
INSERT INTO timeseries.stock_quotes (symbol, timestamp, price, open, high, low, prev_close, change, change_percent, volume, amount, bid_price, ask_price, bid_volume, ask_volume) VALUES
('000001.SZ', NOW() - INTERVAL '1 day', 10.70, 10.50, 10.80, 10.40, 10.50, 0.20, 1.90, 1000000, 10700000.00, 10.69, 10.71, 50000, 50000),
('000001.SZ', NOW() - INTERVAL '2 days', 10.50, 10.30, 10.60, 10.20, 10.40, 0.10, 0.96, 950000, 9975000.00, 10.49, 10.51, 45000, 45000),
('600036.SH', NOW() - INTERVAL '1 day', 35.50, 35.20, 35.80, 35.00, 35.20, 0.30, 0.85, 2000000, 71000000.00, 35.49, 35.51, 100000, 100000),
('600036.SH', NOW() - INTERVAL '2 days', 35.20, 34.80, 35.40, 34.60, 35.00, 0.20, 0.57, 1800000, 63360000.00, 35.19, 35.21, 90000, 90000)
ON CONFLICT (symbol, timestamp) DO NOTHING;

-- Sample stock history (last 30 days, daily data)
INSERT INTO timeseries.stock_history (symbol, timestamp, interval, open, high, low, close, volume, amount, adj_close, vwap)
SELECT
    symbol,
    date_series.date,
    '1d',
    round(random() * 5 + 10, 2),  -- open: 10-15
    round(random() * 5 + 10.5, 2), -- high: 10.5-15.5
    round(random() * 5 + 9.5, 2),  -- low: 9.5-14.5
    round(random() * 5 + 10.2, 2), -- close: 10.2-15.2
    floor(random() * 1000000 + 500000), -- volume: 500k-1.5M
    round(random() * 15000000 + 5000000, 2), -- amount: 5M-20M
    round(random() * 5 + 10.2, 2), -- adj_close: 10.2-15.2
    round(random() * 5 + 10.3, 2)  -- vwap: 10.3-15.3
FROM (
    SELECT '000001.SZ' as symbol, generate_series(NOW() - INTERVAL '30 days', NOW(), INTERVAL '1 day') as date
    UNION ALL
    SELECT '600036.SH' as symbol, generate_series(NOW() - INTERVAL '30 days', NOW(), INTERVAL '1 day') as date
) date_series
ON CONFLICT (symbol, timestamp, interval) DO NOTHING;