-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive', 'suspended');

-- CreateEnum
CREATE TYPE "ModelType" AS ENUM ('openai_gpt4', 'openai_gpt35', 'claude', 'wenxin', 'qwen');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'paused', 'stopped');

-- CreateEnum
CREATE TYPE "TradingFrequency" AS ENUM ('minutely', 'hourly', 'daily', 'weekly');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "Market" AS ENUM ('sh', 'sz', 'bj', 'hk');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('normal', 'suspended', 'delisted');

-- CreateEnum
CREATE TYPE "TradeType" AS ENUM ('buy', 'sell');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('market', 'limit', 'stop');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('pending', 'executed', 'cancelled', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('buy', 'sell', 'hold', 'analyze');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('daily', 'weekly', 'monthly', 'total');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('light', 'dark', 'auto');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('zh_CN', 'en_US');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('above', 'below', 'both');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('debug', 'info', 'warn', 'error', 'fatal');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "salt" VARCHAR(50) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMPTZ,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockUntil" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_accounts" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "modelType" "ModelType" NOT NULL DEFAULT 'openai_gpt4',
    "initialBalance" DECIMAL(15,2) NOT NULL DEFAULT 100000.00,
    "currentBalance" DECIMAL(15,2) NOT NULL DEFAULT 100000.00,
    "totalValue" DECIMAL(15,2) NOT NULL DEFAULT 100000.00,
    "status" "AccountStatus" NOT NULL DEFAULT 'active',
    "tradingFrequency" "TradingFrequency" NOT NULL DEFAULT 'daily',
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'medium',
    "promptTemplate" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "fullName" VARCHAR(200),
    "market" "Market" NOT NULL,
    "industry" VARCHAR(100),
    "subIndustry" VARCHAR(100),
    "listingDate" DATE,
    "totalShares" BIGINT,
    "circulatingShares" BIGINT,
    "status" "StockStatus" NOT NULL DEFAULT 'normal',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "stockId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "avgCost" DECIMAL(10,4) NOT NULL,
    "currentPrice" DECIMAL(10,4),
    "marketValue" DECIMAL(15,2),
    "profitLoss" DECIMAL(15,2),
    "profitLossRate" DECIMAL(8,4),
    "firstBoughtAt" TIMESTAMPTZ,
    "lastTradedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "stockId" INTEGER NOT NULL,
    "tradeType" "TradeType" NOT NULL,
    "orderType" "OrderType" NOT NULL DEFAULT 'market',
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(10,4) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "netAmount" DECIMAL(15,2) NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'pending',
    "reason" VARCHAR(100),
    "executedAt" TIMESTAMPTZ,
    "cancelledAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_logs" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "tradeId" INTEGER,
    "decisionType" "DecisionType" NOT NULL,
    "reasoning" TEXT NOT NULL,
    "confidence" DECIMAL(5,4),
    "riskLevel" "RiskLevel",
    "marketAnalysis" JSONB,
    "technicalIndicators" JSONB,
    "fundamentalAnalysis" JSONB,
    "inputData" JSONB,
    "outputData" JSONB,
    "modelUsed" VARCHAR(50),
    "promptVersion" VARCHAR(50),
    "processingTimeMs" INTEGER,
    "apiCost" DECIMAL(10,6),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ranking" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "periodType" "PeriodType" NOT NULL,
    "periodDate" DATE NOT NULL,
    "rank" INTEGER NOT NULL,
    "totalReturn" DECIMAL(8,4) NOT NULL,
    "annualizedReturn" DECIMAL(8,4),
    "sharpeRatio" DECIMAL(8,4),
    "maxDrawdown" DECIMAL(8,4),
    "winRate" DECIMAL(8,4),
    "profitFactor" DECIMAL(8,4),
    "totalTrades" INTEGER,
    "totalVolume" DECIMAL(15,2),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ranking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "theme" "Theme" NOT NULL DEFAULT 'light',
    "language" "Language" NOT NULL DEFAULT 'zh_CN',
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Shanghai',
    "currency" VARCHAR(10) NOT NULL DEFAULT 'CNY',
    "numberFormat" VARCHAR(20) NOT NULL DEFAULT 'standard',
    "dateFormat" VARCHAR(20) NOT NULL DEFAULT 'YYYY-MM-DD',
    "notifications" JSONB NOT NULL DEFAULT '{"tradeExecuted": true, "aiDecision": true, "priceAlert": false, "systemMaintenance": true, "marketing": false}',
    "chartSettings" JSONB NOT NULL DEFAULT '{"defaultPeriod": "1d", "showVolume": true, "showMA": true, "theme": "light"}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "stockId" INTEGER NOT NULL,
    "customName" VARCHAR(100),
    "notes" TEXT,
    "alertPrice" DECIMAL(10,4),
    "alertType" "AlertType",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_logs" (
    "id" SERIAL NOT NULL,
    "level" "LogLevel" NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "userId" INTEGER,
    "accountId" INTEGER,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" INET,
    "userAgent" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "ai_accounts_userId_idx" ON "ai_accounts"("userId");

-- CreateIndex
CREATE INDEX "ai_accounts_status_idx" ON "ai_accounts"("status");

-- CreateIndex
CREATE INDEX "ai_accounts_modelType_idx" ON "ai_accounts"("modelType");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_code_key" ON "Stock"("code");

-- CreateIndex
CREATE INDEX "Stock_code_idx" ON "Stock"("code");

-- CreateIndex
CREATE INDEX "Stock_market_idx" ON "Stock"("market");

-- CreateIndex
CREATE INDEX "Stock_industry_idx" ON "Stock"("industry");

-- CreateIndex
CREATE INDEX "Stock_status_idx" ON "Stock"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_accountId_stockId_key" ON "Portfolio"("accountId", "stockId");

-- CreateIndex
CREATE INDEX "Portfolio_accountId_idx" ON "Portfolio"("accountId");

-- CreateIndex
CREATE INDEX "Portfolio_stockId_idx" ON "Portfolio"("stockId");

-- CreateIndex
CREATE INDEX "Portfolio_updatedAt_idx" ON "Portfolio"("updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Trade_accountId_idx" ON "Trade"("accountId");

-- CreateIndex
CREATE INDEX "Trade_stockId_idx" ON "Trade"("stockId");

-- CreateIndex
CREATE INDEX "Trade_tradeType_idx" ON "Trade"("tradeType");

-- CreateIndex
CREATE INDEX "Trade_status_idx" ON "Trade"("status");

-- CreateIndex
CREATE INDEX "Trade_executedAt_idx" ON "Trade"("executedAt" DESC);

-- CreateIndex
CREATE INDEX "Trade_createdAt_idx" ON "Trade"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "decision_logs_accountId_idx" ON "decision_logs"("accountId");

-- CreateIndex
CREATE INDEX "decision_logs_tradeId_idx" ON "decision_logs"("tradeId");

-- CreateIndex
CREATE INDEX "decision_logs_decisionType_idx" ON "decision_logs"("decisionType");

-- CreateIndex
CREATE INDEX "decision_logs_createdAt_idx" ON "decision_logs"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "decision_logs_riskLevel_idx" ON "decision_logs"("riskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "Ranking_accountId_periodType_periodDate_key" ON "Ranking"("accountId", "periodType", "periodDate");

-- CreateIndex
CREATE INDEX "Ranking_periodType_idx" ON "Ranking"("periodType");

-- CreateIndex
CREATE INDEX "Ranking_periodDate_idx" ON "Ranking"("periodDate");

-- CreateIndex
CREATE INDEX "Ranking_rank_idx" ON "Ranking"("rank");

-- CreateIndex
CREATE INDEX "Ranking_totalReturn_idx" ON "Ranking"("totalReturn" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");

-- CreateIndex
CREATE INDEX "user_settings_userId_idx" ON "user_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_stockId_key" ON "Watchlist"("userId", "stockId");

-- CreateIndex
CREATE INDEX "Watchlist_userId_idx" ON "Watchlist"("userId");

-- CreateIndex
CREATE INDEX "Watchlist_stockId_idx" ON "Watchlist"("stockId");

-- CreateIndex
CREATE INDEX "system_logs_level_idx" ON "system_logs"("level");

-- CreateIndex
CREATE INDEX "system_logs_module_idx" ON "system_logs"("module");

-- CreateIndex
CREATE INDEX "system_logs_userId_idx" ON "system_logs"("userId");

-- CreateIndex
CREATE INDEX "system_logs_createdAt_idx" ON "system_logs"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "system_logs_module_action_idx" ON "system_logs"("module", "action");

-- AddForeignKey
ALTER TABLE "ai_accounts" ADD CONSTRAINT "ai_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ai_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ai_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_logs" ADD CONSTRAINT "decision_logs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ai_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_logs" ADD CONSTRAINT "decision_logs_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ranking" ADD CONSTRAINT "Ranking_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ai_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ai_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;