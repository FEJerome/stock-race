import type { ConfirmedRevision } from "../../core/strategy/generated/confirmed-revision.types.js";

/**
 * 确认与 revision 持久化 port（契约 3.1：strategyId/revision 由 application 分配；
 * decisions 2026-11-12 第 4 项：v3-data/strategies/<strategyDigest>/ 文件布局）。
 * createdAt 等展示元数据不进 strategyDigest。
 */
export interface StrategyStore {
  /** 分配新 strategyId（pattern: strategy-XXXXXX，单调递增）。 */
  allocateStrategyId(): Promise<string>;
  /** 该 strategyId 下一个单调递增 revision（首个为 1）。 */
  nextRevision(strategyId: string): Promise<number>;
  /** 持久化确认记录与其 canonical AST。 */
  saveConfirmation(record: ConfirmedRevision, canonicalAst: string): Promise<void>;
  /** 查询指定 strategyId+revision 的确认记录；未确认返回 null。 */
  findConfirmation(strategyId: string, revision: number): Promise<ConfirmedRevision | null>;
  /** 列出某 strategyId 的全部确认记录（按 revision 升序）。 */
  listConfirmations(strategyId: string): Promise<readonly ConfirmedRevision[]>;
  /** 按 digest 读取已确认的 canonical AST；不存在返回 null。 */
  loadCanonicalAst(digest: string): Promise<string | null>;
}
