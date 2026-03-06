-- AlterEnum
BEGIN;
CREATE TYPE "ModelType_new" AS ENUM ('deepseek', 'glm');
ALTER TABLE "ai_accounts" ALTER COLUMN "modelType" DROP DEFAULT;
ALTER TABLE "ai_accounts" ALTER COLUMN "modelType" TYPE "ModelType_new" USING ("modelType"::text::"ModelType_new");
ALTER TYPE "ModelType" RENAME TO "ModelType_old";
ALTER TYPE "ModelType_new" RENAME TO "ModelType";
DROP TYPE "ModelType_old";
ALTER TABLE "ai_accounts" ALTER COLUMN "modelType" SET DEFAULT 'deepseek';
COMMIT;

-- DropIndex
DROP INDEX "decision_logs_decision_id_unique";

-- DropIndex
DROP INDEX "idx_decision_logs_account_id";

-- DropIndex
DROP INDEX "idx_decision_logs_account_id_new";

-- DropIndex
DROP INDEX "idx_decision_logs_symbol";

-- DropIndex
DROP INDEX "idx_decision_logs_symbol_new";

-- DropIndex
DROP INDEX "idx_decision_logs_user_id";

-- DropIndex
DROP INDEX "idx_decision_logs_user_id_new";

-- AlterTable
ALTER TABLE "ai_accounts" ALTER COLUMN "modelType" SET DEFAULT 'deepseek';

-- AlterTable
ALTER TABLE "decision_logs" DROP COLUMN "account_id",
DROP COLUMN "action",
DROP COLUMN "ai_provider",
DROP COLUMN "confidence_score",
DROP COLUMN "cost_usd",
DROP COLUMN "decision_id",
DROP COLUMN "expected_return",
DROP COLUMN "fundamental_analysis",
DROP COLUMN "model_name",
DROP COLUMN "price_target",
DROP COLUMN "processing_time_ms",
DROP COLUMN "quantity",
DROP COLUMN "request_data",
DROP COLUMN "response_data",
DROP COLUMN "risk_assessment",
DROP COLUMN "risk_level",
DROP COLUMN "stop_loss",
DROP COLUMN "symbol",
DROP COLUMN "take_profit",
DROP COLUMN "technical_analysis",
DROP COLUMN "time_horizon",
DROP COLUMN "updated_at",
DROP COLUMN "user_id";

-- DropTable
DROP TABLE "api_usage_logs";

