import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { requireEnv } from '../utils/requireEnv.js';

dotenv.config();

// 创建Prisma客户端单例
let prisma;

/**
 * 获取Prisma客户端实例
 * @returns {PrismaClient}
 */
export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
      errorFormat: 'pretty'
    });
  }
  return prisma;
}

/**
 * 连接数据库
 * @returns {Promise<void>}
 */
export async function connectDatabase() {
  try {
    const prisma = getPrismaClient();
    await prisma.$connect();
    console.log('✅ 数据库连接成功');
  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
    throw error;
  }
}

/**
 * 断开数据库连接
 * @returns {Promise<void>}
 */
export async function disconnectDatabase() {
  try {
    const prisma = getPrismaClient();
    await prisma.$disconnect();
    console.log('✅ 数据库连接已断开');
  } catch (error) {
    console.error('❌ 断开数据库连接失败:', error);
    throw error;
  }
}

/**
 * 检查数据库连接状态
 * @returns {Promise<boolean>}
 */
export async function checkDatabaseConnection() {
  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('❌ 数据库连接检查失败:', error);
    return false;
  }
}

/**
 * 执行数据库迁移
 * @returns {Promise<void>}
 */
export async function runMigrations() {
  try {
    console.log('🚀 开始执行数据库迁移...');

    // 这里可以集成Prisma Migrate
    // 或者执行自定义迁移脚本
    console.log('✅ 数据库迁移完成');
  } catch (error) {
    console.error('❌ 数据库迁移失败:', error);
    throw error;
  }
}

/**
 * 执行数据库种子
 * @returns {Promise<void>}
 */
export async function runSeeds() {
  try {
    console.log('🌱 开始执行数据库种子...');

    // 这里可以执行种子数据插入
    console.log('✅ 数据库种子完成');
  } catch (error) {
    console.error('❌ 数据库种子失败:', error);
    throw error;
  }
}

/**
 * 数据库健康检查
 * @returns {Promise<Object>}
 */
export async function databaseHealthCheck() {
  try {
    const prisma = getPrismaClient();

    // 检查连接
    await prisma.$queryRaw`SELECT 1`;

    // 获取数据库统计
    const [userCount, accountCount, stockCount, tradeCount] = await Promise.all([
      prisma.user.count(),
      prisma.aIAccount.count(),
      prisma.stock.count(),
      prisma.trade.count()
    ]);

    return {
      status: 'healthy',
      connected: true,
      timestamp: new Date().toISOString(),
      stats: {
        users: userCount,
        accounts: accountCount,
        stocks: stockCount,
        trades: tradeCount
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      connected: false,
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

/**
 * 数据库配置
 */
export const databaseConfig = {
  // PostgreSQL连接配置
  postgres: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'stockrace',
    username: process.env.DB_USER || 'postgres',
    // 密码不设弱口令默认值；缺失时显式报错。
    password: requireEnv('DB_PASSWORD'),
    ssl: process.env.DB_SSL === 'true',
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2'),
      max: parseInt(process.env.DB_POOL_MAX || '10')
    }
  },

  // Redis连接配置
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0')
  },

  // 连接超时设置
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),

  // 查询超时设置
  queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),

  // 是否启用查询日志
  enableQueryLog: process.env.NODE_ENV === 'development'
};

export default {
  getPrismaClient,
  connectDatabase,
  disconnectDatabase,
  checkDatabaseConnection,
  runMigrations,
  runSeeds,
  databaseHealthCheck,
  databaseConfig
};