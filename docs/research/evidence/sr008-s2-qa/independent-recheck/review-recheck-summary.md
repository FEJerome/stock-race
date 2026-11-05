# SR-008 S2 六项修复独立复验

- 复审 HEAD：0dde9669d5c6ccd4a4e5f5ace5ee97a48ca47e05
- 结论：PASS；原六项必修均已修复，未发现剩余必修项。
- 净态：`## sr-008-s2-stock-kernel`，无源码或未跟踪交付文件改动。
- 修复范围：engine/types/snapshot/fifo/report 与新增 s2-review-regressions.test.ts；无依赖或 S3 改动。
- 实测环境：Windows 11（10.0.26200）、win32 x64、Node v24.18.0、npm 11.16.0。

## 实际执行

1. 在 v3/ 执行 `npm ci && npm run check:generated && npm run typecheck && npm test`：退出码 0；生成类型同步、typecheck 通过，17 个测试文件 116 个测试全绿，包含 CLI/application parity。
2. 直接复用未修改的 `.local/sr008-s2-review/review-probes.ts`，仅将 bundle 与输出写入本目录：构建和执行退出码 0。
3. 执行独立 `recheck-assertions.ts`：退出码 0，六场景断言、终态互斥、事件 seq/hash chain、event/report digest、每日四桶现金与持仓合计、最终现金/权益一致性全部 PASS。

## 原探针逐项结果

- warmup：error.details 与 RunFailed payload 均包含 36/0/36/0 四项计数，唯一终态 RunFailed。
- 零基数送转：ok=true，CorporateActionApplied=ZERO_BASE、quantity=0、真实 snapshot refs；唯一成功终态 RunCompleted，无 RunFailed。
- 停牌登记日：ok=true，实际登记基数 100，BONUS_POSITION quantity=10。
- 买入持有停牌顺延：finalEquity=1893.99、cumulativeReturn=-0.053005000000、reason=null。
- 负 close：估值前失败，code=DECIMAL_NEGATIVE_VALUE，path=/sessions/2/bar/close，无 MarkToMarket，唯一终态 RunFailed。
- 公司行动/派息：refs 含真实 snapshotDigest、corporateAction、recordDate/exDate 或 receivable=100.00。

## 边界

Node 20 与其他 OS 未验证；未调用真实 Kimi、行情或外部数据，未新增真实 600519 探针。S3 继续关闭。原 `.local/sr008-s2-review/` 未修改；本轮证据仅写 `.local/sr008-s2-review-recheck/`。未改源码、未提交、未合并、未推送。
