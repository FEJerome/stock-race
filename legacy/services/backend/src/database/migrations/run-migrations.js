import { getPrismaClient } from '../../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 运行数据库迁移
 * @param {string} direction - 迁移方向 ('up' 或 'down')
 */
async function runMigrations(direction = 'up') {
  const prisma = getPrismaClient();

  try {
    console.log(`🚀 开始执行数据库迁移 (${direction})...`);

    // 连接到数据库
    await prisma.$connect();
    console.log('✅ 数据库连接成功');

    if (direction === 'up') {
      await runUpMigrations(prisma);
    } else if (direction === 'down') {
      await runDownMigrations(prisma);
    } else {
      throw new Error(`无效的迁移方向: ${direction}`);
    }

    console.log(`✅ 数据库迁移完成 (${direction})`);
  } catch (error) {
    console.error(`❌ 数据库迁移失败 (${direction}):`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 执行向上迁移
 * @param {PrismaClient} prisma - Prisma客户端
 */
async function runUpMigrations(prisma) {
  // 检查迁移表是否存在
  const migrationTableExists = await checkMigrationTableExists(prisma);

  if (!migrationTableExists) {
    console.log('📋 创建迁移记录表...');
    await createMigrationTable(prisma);
  }

  // 获取已执行的迁移
  const executedMigrations = await getExecutedMigrations(prisma);

  // 获取所有迁移文件
  const migrationFiles = getMigrationFiles();
  const pendingMigrations = migrationFiles.filter(
    file => !executedMigrations.includes(file.name)
  );

  if (pendingMigrations.length === 0) {
    console.log('✅ 没有待执行的迁移');
    return;
  }

  console.log(`📋 发现 ${pendingMigrations.length} 个待执行迁移`);

  // 按顺序执行迁移
  for (const migration of pendingMigrations) {
    console.log(`🚀 执行迁移: ${migration.name}`);

    try {
      // 读取SQL文件
      const sql = fs.readFileSync(migration.path, 'utf8');

      // 执行SQL
      await prisma.$executeRawUnsafe(sql);

      // 记录迁移
      await recordMigration(prisma, migration.name, 'up');

      console.log(`✅ 迁移完成: ${migration.name}`);
    } catch (error) {
      console.error(`❌ 迁移失败: ${migration.name}`, error);
      throw error;
    }
  }
}

/**
 * 执行向下迁移
 * @param {PrismaClient} prisma - Prisma客户端
 */
async function runDownMigrations(prisma) {
  // 获取已执行的迁移
  const executedMigrations = await getExecutedMigrations(prisma);

  if (executedMigrations.length === 0) {
    console.log('✅ 没有可回滚的迁移');
    return;
  }

  console.log(`📋 发现 ${executedMigrations.length} 个可回滚迁移`);

  // 按相反顺序回滚迁移
  for (let i = executedMigrations.length - 1; i >= 0; i--) {
    const migrationName = executedMigrations[i];
    console.log(`↩️  回滚迁移: ${migrationName}`);

    try {
      // 这里需要实现回滚逻辑
      // 对于Prisma，通常使用 migrate reset 或手动回滚
      console.log(`⚠️  回滚迁移 ${migrationName} 需要手动处理`);

      // 移除迁移记录
      await removeMigration(prisma, migrationName);

      console.log(`✅ 迁移回滚完成: ${migrationName}`);
    } catch (error) {
      console.error(`❌ 迁移回滚失败: ${migrationName}`, error);
      throw error;
    }
  }
}

/**
 * 检查迁移表是否存在
 * @param {PrismaClient} prisma - Prisma客户端
 * @returns {Promise<boolean>}
 */
async function checkMigrationTableExists(prisma) {
  try {
    const result = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'migrations'
      );
    `;
    return result[0].exists;
  } catch (error) {
    // 表不存在
    return false;
  }
}

/**
 * 创建迁移记录表
 * @param {PrismaClient} prisma - Prisma客户端
 */
async function createMigrationTable(prisma) {
  await prisma.$executeRaw`
    CREATE TABLE migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      direction VARCHAR(10) NOT NULL
    );
  `;
}

/**
 * 获取已执行的迁移
 * @param {PrismaClient} prisma - Prisma客户端
 * @returns {Promise<string[]>}
 */
async function getExecutedMigrations(prisma) {
  try {
    const migrations = await prisma.$queryRaw`
      SELECT name FROM migrations
      WHERE direction = 'up'
      ORDER BY executed_at ASC;
    `;
    return migrations.map(m => m.name);
  } catch (error) {
    // 表不存在
    return [];
  }
}

/**
 * 记录迁移
 * @param {PrismaClient} prisma - Prisma客户端
 * @param {string} name - 迁移名称
 * @param {string} direction - 迁移方向
 */
async function recordMigration(prisma, name, direction) {
  await prisma.$executeRaw`
    INSERT INTO migrations (name, direction)
    VALUES (${name}, ${direction});
  `;
}

/**
 * 移除迁移记录
 * @param {PrismaClient} prisma - Prisma客户端
 * @param {string} name - 迁移名称
 */
async function removeMigration(prisma, name) {
  await prisma.$executeRaw`
    DELETE FROM migrations WHERE name = ${name};
  `;
}

/**
 * 获取迁移文件
 * @returns {Array<{name: string, path: string}>}
 */
function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, '../../../prisma/migrations');

  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const migrationDirs = fs.readdirSync(migrationsDir)
    .filter(dir => fs.statSync(path.join(migrationsDir, dir)).isDirectory())
    .sort();

  return migrationDirs.map(dir => {
    const migrationFile = path.join(migrationsDir, dir, 'migration.sql');
    return {
      name: dir,
      path: migrationFile
    };
  });
}

// 命令行接口
const direction = process.argv[2] || 'up';

if (direction !== 'up' && direction !== 'down') {
  console.error('❌ 无效的迁移方向。请使用 "up" 或 "down"');
  process.exit(1);
}

runMigrations(direction).catch(error => {
  console.error('❌ 迁移执行失败:', error);
  process.exit(1);
});