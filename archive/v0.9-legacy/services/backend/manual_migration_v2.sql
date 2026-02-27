-- 手动迁移：更新ModelType枚举 - 版本2
BEGIN;

-- 创建新的枚举类型
CREATE TYPE "ModelType_new" AS ENUM ('deepseek', 'glm');

-- 更改表的列类型，先将现有值转换为文本，然后转换为新枚举
ALTER TABLE "ai_accounts" ALTER COLUMN "modelType" DROP DEFAULT;
ALTER TABLE "ai_accounts" ALTER COLUMN "modelType" TYPE "ModelType_new" USING (
  CASE 
    WHEN "modelType"::text IN ('openai_gpt4', 'openai_gpt35', 'claude', 'wenxin', 'qwen') THEN 'deepseek'::"ModelType_new"
    ELSE 'deepseek'::"ModelType_new"
  END
);

-- 删除旧的枚举类型
DROP TYPE "ModelType";

-- 重命名新的枚举类型
ALTER TYPE "ModelType_new" RENAME TO "ModelType";

-- 设置新的默认值
ALTER TABLE "ai_accounts" ALTER COLUMN "modelType" SET DEFAULT 'deepseek';

COMMIT;
