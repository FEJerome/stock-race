# SR-007 S1 独立复审记录

- 复审对象：62086560cc683976bdef39d6a0969ea77852be52（084130d + 6208656）
- 基线：e963ae8767e369c0a82234f5322931970bae8e1b
- 变更面：38 个文件；无依赖清单或锁文件变更；两条 S0 回归仅新增嵌套重复键与 HALF_EVEN 精确中点测试。
- 实测环境：Windows 11（OS release 10.0.26200）、win32 x64、Node v24.18.0、npm 11.16.0。
- 独立命令：在 v3/ 执行 `npm ci && npm run check:generated && npm run typecheck && npm test`，退出码 0；生成类型同步，typecheck 通过，11 个测试文件 89 个测试全部通过。
- 独立复算：使用 Python 标准库 Fraction/Decimal 精确分数算术复算 MACD/KDJ 全序列、crossAbove、within3，逐项匹配 golden，退出码 0。
- 静态审查：contextRefs 冲突与合法 position context、canonical Decimal 统一 failure 与 JSON Pointer、按 observation kind 的 requiredInputs、内部 64 位递推与 scale8 输出边界、三态/cross/within/warmup/前缀不变性、registry/manifest/canonical AST 权威回读均符合冻结契约。
- 既有证据：有效 red 为行为断言失败；mutation 能抓 KDJ 种子错误且恢复后全绿；三项返修具有独立 red/green 证据。Chromium 完整指标证据只按一次性探针采信，本次未复跑。
- 未验证：Node 20、其他 OS、真实 Kimi、真实行情或外部数据；本次未进行这些调用，也未开放 S2/S3。
- 结论：PASS，无必修项；建议按既有授权合并。复审未修改源码、未提交、未合并、未推送。
