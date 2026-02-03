-- Initialize TimescaleDB for time-series stock data
-- This script runs when the TimescaleDB container starts

-- Create schema for time-series data
CREATE SCHEMA IF NOT EXISTS timeseries;

-- Set search path
SET search_path TO timeseries, public;

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Stock price time-series table
CREATE TABLE IF NOT EXISTS stock_prices (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    open DECIMAL(15, 4) NOT NULL,
    high DECIMAL(15, 4) NOT NULL,
    low DECIMAL(15, 4) NOT NULL,
    close DECIMAL(15, 4) NOT NULL,
    volume BIGINT NOT NULL,
    adj_close DECIMAL(15, 4),
    source VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Convert to hypertable for time-series optimization
SELECT create_hypertable('stock_prices', 'time', if_not_exists => TRUE);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_stock_prices_symbol_time ON stock_prices (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_stock_prices_time ON stock_prices (time DESC);

-- Stock minute data table (for intraday data)
CREATE TABLE IF NOT EXISTS stock_minute_data (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    open DECIMAL(15, 4) NOT NULL,
    high DECIMAL(15, 4) NOT NULL,
    low DECIMAL(15, 4) NOT NULL,
    close DECIMAL(15, 4) NOT NULL,
    volume BIGINT NOT NULL,
    vwap DECIMAL(15, 4),
    trades INTEGER,
    source VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

SELECT create_hypertable('stock_minute_data', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_stock_minute_data_symbol_time ON stock_minute_data (symbol, time DESC);

-- Technical indicators table
CREATE TABLE IF NOT EXISTS technical_indicators (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    indicator_name VARCHAR(50) NOT NULL,
    indicator_value DECIMAL(15, 6) NOT NULL,
    period INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

SELECT create_hypertable('technical_indicators', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_technical_indicators_symbol_indicator_time
    ON technical_indicators (symbol, indicator_name, time DESC);

-- Market sentiment data
CREATE TABLE IF NOT EXISTS market_sentiment (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(20),
    sentiment_score DECIMAL(5, 4) NOT NULL,
    sentiment_type VARCHAR(20) NOT NULL,
    source VARCHAR(50) NOT NULL,
    confidence DECIMAL(5, 4),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

SELECT create_hypertable('market_sentiment', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_market_sentiment_symbol_time ON market_sentiment (symbol, time DESC);

-- AI trading signals
CREATE TABLE IF NOT EXISTS ai_trading_signals (
    time TIMESTAMPTZ NOT NULL,
    ai_account_id UUID NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    signal_type VARCHAR(10) NOT NULL CHECK (signal_type IN ('BUY', 'SELL', 'HOLD')),
    confidence DECIMAL(5, 4) NOT NULL,
    price_target DECIMAL(15, 4),
    stop_loss DECIMAL(15, 4),
    take_profit DECIMAL(15, 4),
    reasoning TEXT,
    executed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

SELECT create_hypertable('ai_trading_signals', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_ai_trading_signals_ai_account_time ON ai_trading_signals (ai_account_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_ai_trading_signals_symbol_time ON ai_trading_signals (symbol, time DESC);

-- Portfolio value history
CREATE TABLE IF NOT EXISTS portfolio_history (
    time TIMESTAMPTZ NOT NULL,
    ai_account_id UUID NOT NULL,
    total_value DECIMAL(15, 2) NOT NULL,
    cash_balance DECIMAL(15, 2) NOT NULL,
    stock_value DECIMAL(15, 2) NOT NULL,
    daily_return DECIMAL(10, 4),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

SELECT create_hypertable('portfolio_history', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_portfolio_history_ai_account_time ON portfolio_history (ai_account_id, time DESC);

-- Create continuous aggregates for faster queries
-- Daily aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS stock_prices_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    symbol,
    FIRST(open, time) AS open,
    MAX(high) AS high,
    MIN(low) AS low,
    LAST(close, time) AS close,
    SUM(volume) AS volume,
    AVG(adj_close) AS adj_close_avg
FROM stock_prices
GROUP BY bucket, symbol
WITH NO DATA;

-- Add refresh policy for daily aggregates
SELECT add_continuous_aggregate_policy('stock_prices_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

-- Hourly aggregates for minute data
CREATE MATERIALIZED VIEW IF NOT EXISTS stock_minute_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    symbol,
    FIRST(open, time) AS open,
    MAX(high) AS high,
    MIN(low) AS low,
    LAST(close, time) AS close,
    SUM(volume) AS volume,
    AVG(vwap) AS vwap_avg
FROM stock_minute_data
GROUP BY bucket, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('stock_minute_hourly',
    start_offset => INTERVAL '1 day',
    end_offset => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '15 minutes');

-- Create functions for common queries
CREATE OR REPLACE FUNCTION get_latest_price(symbol_param VARCHAR(20))
RETURNS TABLE (
    symbol VARCHAR(20),
    price DECIMAL(15, 4),
    volume BIGINT,
    timestamp TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sp.symbol,
        sp.close AS price,
        sp.volume,
        sp.time AS timestamp
    FROM stock_prices sp
    WHERE sp.symbol = symbol_param
    ORDER BY sp.time DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_price_history(
    symbol_param VARCHAR(20),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    interval_param INTERVAL DEFAULT '1 day'
)
RETURNS TABLE (
    bucket TIMESTAMPTZ,
    symbol VARCHAR(20),
    open DECIMAL(15, 4),
    high DECIMAL(15, 4),
    low DECIMAL(15, 4),
    close DECIMAL(15, 4),
    volume BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        time_bucket(interval_param, time) AS bucket,
        symbol,
        FIRST(open, time) AS open,
        MAX(high) AS high,
        MIN(low) AS low,
        LAST(close, time) AS close,
        SUM(volume) AS volume
    FROM stock_prices
    WHERE symbol = symbol_param
        AND time >= start_time
        AND time <= end_time
    GROUP BY bucket, symbol
    ORDER BY bucket;
END;
$$ LANGUAGE plpgsql;

-- Create retention policies
-- Keep raw data for 1 year
SELECT add_retention_policy('stock_prices', INTERVAL '1 year');
SELECT add_retention_policy('stock_minute_data', INTERVAL '30 days');
SELECT add_retention_policy('technical_indicators', INTERVAL '6 months');
SELECT add_retention_policy('market_sentiment', INTERVAL '6 months');
SELECT add_retention_policy('ai_trading_signals', INTERVAL '1 year');
SELECT add_retention_policy('portfolio_history', INTERVAL '2 years');

-- Insert sample data for testing
INSERT INTO stock_prices (time, symbol, open, high, low, close, volume, adj_close, source) VALUES
(NOW() - INTERVAL '1 day', '000001.SZ', 10.50, 10.80, 10.40, 10.70, 1000000, 10.70, 'test'),
(NOW() - INTERVAL '2 days', '000001.SZ', 10.30, 10.60, 10.20, 10.50, 950000, 10.50, 'test'),
(NOW() - INTERVAL '1 day', '600036.SH', 35.20, 35.80, 35.00, 35.50, 2000000, 35.50, 'test'),
(NOW() - INTERVAL '2 days', '600036.SH', 34.80, 35.40, 34.60, 35.20, 1800000, 35.20, 'test')
ON CONFLICT DO NOTHING;