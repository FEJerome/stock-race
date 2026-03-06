-- Initialize PostgreSQL database for Stock Race
-- This script runs when the PostgreSQL container starts

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create schema for stock race
CREATE SCHEMA IF NOT EXISTS stock_race;

-- Set search path
SET search_path TO stock_race, public;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- AI Accounts table
CREATE TABLE IF NOT EXISTS ai_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    ai_model VARCHAR(100) NOT NULL,
    prompt_template TEXT NOT NULL,
    initial_balance DECIMAL(15, 2) DEFAULT 100000.00,
    current_balance DECIMAL(15, 2) DEFAULT 100000.00,
    risk_level VARCHAR(20) DEFAULT 'medium',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Stocks table (metadata)
CREATE TABLE IF NOT EXISTS stocks (
    symbol VARCHAR(20) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    exchange VARCHAR(50),
    sector VARCHAR(100),
    industry VARCHAR(100),
    market_cap DECIMAL(20, 2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Positions table
CREATE TABLE IF NOT EXISTS positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ai_account_id UUID NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,
    stock_symbol VARCHAR(20) NOT NULL REFERENCES stocks(symbol),
    quantity INTEGER NOT NULL,
    average_price DECIMAL(15, 4) NOT NULL,
    current_price DECIMAL(15, 4),
    unrealized_pnl DECIMAL(15, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ai_account_id UUID NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,
    stock_symbol VARCHAR(20) NOT NULL REFERENCES stocks(symbol),
    transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('BUY', 'SELL')),
    quantity INTEGER NOT NULL,
    price DECIMAL(15, 4) NOT NULL,
    total_amount DECIMAL(15, 2) NOT NULL,
    fee DECIMAL(10, 2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'COMPLETED',
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- AI Decisions table
CREATE TABLE IF NOT EXISTS ai_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ai_account_id UUID NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,
    decision_type VARCHAR(20) NOT NULL CHECK (decision_type IN ('BUY', 'SELL', 'HOLD')),
    stock_symbol VARCHAR(20) REFERENCES stocks(symbol),
    confidence_score DECIMAL(5, 4),
    reasoning TEXT,
    market_data JSONB,
    executed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Competition tables
CREATE TABLE IF NOT EXISTS competitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    entry_fee DECIMAL(10, 2) DEFAULT 0.00,
    prize_pool DECIMAL(15, 2),
    max_participants INTEGER,
    status VARCHAR(20) DEFAULT 'UPCOMING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS competition_participants (
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    ai_account_id UUID NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,
    initial_balance DECIMAL(15, 2) NOT NULL,
    current_balance DECIMAL(15, 2) NOT NULL,
    rank INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (competition_id, ai_account_id)
);

-- Performance metrics
CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ai_account_id UUID NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_value DECIMAL(15, 2) NOT NULL,
    daily_return DECIMAL(10, 4),
    cumulative_return DECIMAL(10, 4),
    sharpe_ratio DECIMAL(10, 4),
    max_drawdown DECIMAL(10, 4),
    win_rate DECIMAL(5, 4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ai_account_id, date)
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_ai_accounts_user_id ON ai_accounts(user_id);
CREATE INDEX idx_positions_ai_account_id ON positions(ai_account_id);
CREATE INDEX idx_transactions_ai_account_id ON transactions(ai_account_id);
CREATE INDEX idx_transactions_executed_at ON transactions(executed_at);
CREATE INDEX idx_ai_decisions_ai_account_id ON ai_decisions(ai_account_id);
CREATE INDEX idx_ai_decisions_created_at ON ai_decisions(created_at);
CREATE INDEX idx_performance_metrics_ai_account_id ON performance_metrics(ai_account_id);
CREATE INDEX idx_performance_metrics_date ON performance_metrics(date);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_accounts_updated_at BEFORE UPDATE ON ai_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stocks_updated_at BEFORE UPDATE ON stocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data
INSERT INTO users (email, username, password_hash, full_name, is_admin) VALUES
('admin@stock-race.com', 'admin', '$2b$10$YourHashedPasswordHere', 'System Administrator', TRUE),
('user1@example.com', 'trader1', '$2b$10$YourHashedPasswordHere', 'Trader One', FALSE),
('user2@example.com', 'trader2', '$2b$10$YourHashedPasswordHere', 'Trader Two', FALSE)
ON CONFLICT (email) DO NOTHING;

INSERT INTO stocks (symbol, name, exchange, sector) VALUES
('000001.SZ', '平安银行', 'SZSE', '金融'),
('000002.SZ', '万科A', 'SZSE', '房地产'),
('000858.SZ', '五粮液', 'SZSE', '消费品'),
('600036.SH', '招商银行', 'SSE', '金融'),
('600519.SH', '贵州茅台', 'SSE', '消费品')
ON CONFLICT (symbol) DO NOTHING;