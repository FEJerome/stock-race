/**
 * GuestCleanupService - 游客数据定时清理服务
 *
 * 功能：
 * - 凌晨2点：逻辑删除过期游客会话
 * - 凌晨3点：物理删除已过期25小时的游客数据
 * - 多重保险防误删
 *
 * @author Backend开发团队
 * @date 2026-02-13
 */

const { PrismaClient } = require('@prisma/client');

class GuestCleanupService {
  constructor(prismaClient) {
    this.prisma = prismaClient || new PrismaClient();

    // 调度配置
    this.schedules = {
      logicalCleanup: { hour: 2, minute: 0 },    // 凌晨2点
      physicalCleanup: { hour: 3, minute: 0 }    // 凌晨3点
    };

    this.timers = [];
  }

  /**
   * 启动定时任务
   */
  startScheduledTasks() {
    console.log('[GuestCleanupService] Starting scheduled cleanup tasks...');

    // 设置定时任务
    this.scheduleDailyTask(this.schedules.logicalCleanup, () => this.runLogicalCleanup());
    this.scheduleDailyTask(this.schedules.physicalCleanup, () => this.runPhysicalCleanup());

    console.log('[GuestCleanupService] Scheduled tasks started');
  }

  /**
   * 设置每日定时任务
   */
  scheduleDailyTask(schedule, task) {
    const now = new Date();
    const scheduledTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      schedule.hour,
      schedule.minute,
      0
    );

    // 如果今天的时间已过，设置到明天
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const delay = scheduledTime - now;

    console.log(`[GuestCleanupService] Task scheduled at ${scheduledTime.toISOString()} (${delay}ms delay)`);

    const timer = setTimeout(() => {
      task();
      // 设置每日重复
      this.timers.push(setInterval(task, 24 * 60 * 60 * 1000));
    }, delay);

    this.timers.push(timer);
  }

  /**
   * 逻辑删除过期游客
   *
   * 安全策略：
   * 1. 只处理status='active'且已过期的会话
   * 2. 明确排除migrating和migrated状态
   * 3. 分批处理，避免大事务
   */
  async runLogicalCleanup() {
    console.log('[GuestCleanupService] Starting logical cleanup...');

    try {
      const batchSize = 100;
      let totalProcessed = 0;
      let hasMore = true;

      while (hasMore) {
        // 查找已过期的active会话（分批）
        const expiredSessions = await this.prisma.guest_sessions.findMany({
          where: {
            status: 'active',
            expires_at: { lt: new Date() }
          },
          take: batchSize
        });

        if (expiredSessions.length === 0) {
          hasMore = false;
          break;
        }

        for (const session of expiredSessions) {
          try {
            // 再次检查状态（防止并发修改）
            const current = await this.prisma.guest_sessions.findUnique({
              where: { id: session.id }
            });

            // 安全策略：明确排除关键状态
            if (current.status === 'migrating' || current.status === 'migrated') {
              console.warn(`[GuestCleanupService] Skip session ${session.id}, status=${current.status}`);
              continue;
            }

            if (current.status !== 'active') {
              continue;
            }

            // 执行逻辑删除
            await this.prisma.guest_sessions.update({
              where: { id: session.id },
              data: { status: 'expired' }
            });

            totalProcessed++;

          } catch (error) {
            console.error(`[GuestCleanupService] Failed to expire session ${session.id}:`, error.message);
          }
        }

        // 如果本批处理满，可能还有更多
        hasMore = expiredSessions.length === batchSize;
      }

      console.log(`[GuestCleanupService] Logical cleanup completed: ${totalProcessed} sessions expired`);
      return { success: true, count: totalProcessed };

    } catch (error) {
      console.error('[GuestCleanupService] Logical cleanup failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 物理删除过期游客
   *
   * 安全策略：
   * 1. 只删除status='expired'且已过期25小时的会话
   * 2. 触发器会阻止删除migrated状态的会话
   * 3. 级联删除关联的AI账户及其数据
   */
  async runPhysicalCleanup() {
    console.log('[GuestCleanupService] Starting physical cleanup...');

    try {
      // 25小时前的截止时间（给恢复留余地）
      const cutoffDate = new Date(Date.now() - 25 * 60 * 60 * 1000);

      const batchSize = 50;
      let totalDeleted = 0;
      let hasMore = true;

      while (hasMore) {
        // 查找可物理删除的会话
        const deletableSessions = await this.prisma.guest_sessions.findMany({
          where: {
            status: 'expired',
            expires_at: { lt: cutoffDate }
          },
          take: batchSize
        });

        if (deletableSessions.length === 0) {
          hasMore = false;
          break;
        }

        for (const session of deletableSessions) {
          try {
            // 触发器会阻止删除migrated状态的会话
            // 外键级联删除会清理关联的AI账户
            await this.prisma.guest_sessions.delete({
              where: { id: session.id }
            });

            totalDeleted++;

          } catch (error) {
            // 如果是触发器阻止的，记录警告
            if (error.message.includes('Cannot delete')) {
              console.warn(`[GuestCleanupService] Protected session ${session.id}: ${error.message}`);
            } else {
              console.error(`[GuestCleanupService] Failed to delete session ${session.id}:`, error.message);
            }
          }
        }

        hasMore = deletableSessions.length === batchSize;
      }

      console.log(`[GuestCleanupService] Physical cleanup completed: ${totalDeleted} sessions deleted`);
      return { success: true, count: totalDeleted };

    } catch (error) {
      console.error('[GuestCleanupService] Physical cleanup failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 停止所有定时任务
   */
  stopScheduledTasks() {
    console.log('[GuestCleanupService] Stopping scheduled tasks...');

    this.timers.forEach(timer => clearTimeout(timer));
    this.timers = [];

    console.log('[GuestCleanupService] All tasks stopped');
  }

  /**
   * 获取清理统计
   */
  async getCleanupStats() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const stats = await this.prisma.$transaction([
      // 即将过期的会话（24小时内）
      this.prisma.guest_sessions.count({
        where: {
          status: 'active',
          expires_at: { lt: tomorrow, gt: now }
        }
      }),
      // 已过期的会话
      this.prisma.guest_sessions.count({
        where: {
          status: 'expired',
          expires_at: { gt: new Date(now - 25 * 60 * 60 * 1000) }
        }
      }),
      // 可物理删除的会话
      this.prisma.guest_sessions.count({
        where: {
          status: 'expired',
          expires_at: { lt: new Date(now - 25 * 60 * 60 * 1000) }
        }
      })
    ]);

    return {
      expiringSoon: stats[0],
      expiredNotDeleted: stats[1],
      readyForPhysicalDelete: stats[2]
    };
  }
}

module.exports = GuestCleanupService;
