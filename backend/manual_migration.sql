-- 手动迁移：更新ModelType枚举
BEGIN;

-- 首先，我们需要处理现有数据
-- 将现有的modelType值映射到新的值
-- 由于我们只支持deepseek和glm，将所有现有记录设置为deepseek
UPDATE "ai_accounts" SET "modelType" = 'deepseek' WHERE "modelType" IN ('openai_gpt4', 'openai_gpt35', 'claude', 'wenxin', 'qwen');

-- 创建新的枚举类型
CREATE TYPE "ModelType_new" AS ENUM ('deepseek', 'glm');

-- 更改表的列类型
ALTER TABLE "ai_accounts" ALTER COLUMN "modelType" DROP DEFAULT;
ALTER TABLE "ai_accounts" ALTER COLUMN "modelType" TYPE "ModelType_new" USING ("modelType"::text::"ModelType_new");

-- 删除旧的枚举类型
DROP TYPE "ModelType";

-- 重命名新的枚举类型
ALTER TYPE "ModelType_new" RENAME TO "ModelType";

-- 设置新的默认值
ALTER TABLE "ai_accounts" ALTER COLUMN "modelType" SET DEFAULT 'deepseek';

COMMIT;
