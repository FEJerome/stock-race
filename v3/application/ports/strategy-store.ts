import type { ConfirmedRevision } from "../../core/strategy/generated/confirmed-revision.types.js";

export interface ConfirmationAllocation {
  /** 缺省时由 store 分配新 strategyId；指定时必须是已存在（有过确认）的 id。 */
  readonly strategyId?: string;
  readonly digest: string;
  readonly createdAt: string;
}

/**
 * 确认与 revision 持久化 port（契约 3.1：strategyId/revision 由 application 分配；
 * decisions 2026-11-12 第 4 项：v3-data/strategies/<strategyDigest>/ 文件布局）。
 * createdAt 等展示元数据不进 strategyDigest。
 *
 * 分配与写入收敛为单个 commitConfirmation 原子操作：实现方在内部串行化，
 * 调用方不得自行拼接「分配 id → 取 revision → 落盘」三段（并发下会重号）。
 */
export interface StrategyStore {
  /** strategyId 是否已存在（有过至少一次确认）。 */
  hasStrategy(strategyId: string): Promise<boolean>;
  /**
   * 原子完成「分配 id（缺省时）→ 分配单调 revision → 落盘」，
   * 返回完整 ConfirmedRevision。并发调用必须串行生效、revision 不重号。
   */
  commitConfirmation(allocation: ConfirmationAllocation, canonicalAst: string): Promise<ConfirmedRevision>;
  /** 查询指定 strategyId+revision 的确认记录；未确认返回 null。 */
  findConfirmation(strategyId: string, revision: number): Promise<ConfirmedRevision | null>;
  /** 列出某 strategyId 的全部确认记录（按 revision 升序）。 */
  listConfirmations(strategyId: string): Promise<readonly ConfirmedRevision[]>;
  /** 按 digest 读取已确认的 canonical AST；不存在返回 null；内容与 digest 不符必须拒绝。 */
  loadCanonicalAst(digest: string): Promise<string | null>;
}
