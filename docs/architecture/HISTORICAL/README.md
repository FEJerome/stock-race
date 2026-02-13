# 历史架构文档归档

本目录存放stock-race项目的历史架构文档。这些文档反映了架构演进过程中的重要节点，供参考使用。

> ⚠️ **警告**: 本文档目录中的内容均为历史版本，可能已与当前架构不一致。请参考 [CURRENT/](../CURRENT/) 目录获取最新架构文档。

## 归档文档列表

| 文档 | 原始名称 | 创建日期 | 说明 |
|------|----------|----------|------|
| [V2026-02-13-DATA_SOURCE_EXPANSION_PLAN_V2-CANCELLED.md](./V2026-02-13-DATA_SOURCE_EXPANSION_PLAN_V2-CANCELLED.md) | DATA_SOURCE_EXPANSION_PLAN_V2.md | 2026-02-13 | ⚠️ 已取消：6-8数据源扩展计划 |
| [V2026-02-13-DATA_SOURCE_SURVEY_REPORTS.md](./V2026-02-13-DATA_SOURCE_SURVEY_REPORTS.md) | DATA_SOURCE_SURVEY_REPORTS.md | 2026-02-13 | 7个潜在数据源调研报告 |
| [V2026-02-13-NEW_DATA_SOURCE_FEASIBILITY.md](./V2026-02-13-NEW_DATA_SOURCE_FEASIBILITY.md) | NEW_DATA_SOURCE_FEASIBILITY.md | 2026-02-13 | 可行性评估报告 |
| [V2026-02-10-SERVICE_ARCHITECTURE.md](./V2026-02-10-SERVICE_ARCHITECTURE.md) | DETAILED_SERVICE_ARCHITECTURE.md | 2026-02-10 | 六服务架构详细设计初版 |
| [V1-SYSTEM_ARCHITECTURE.md](./V1-SYSTEM_ARCHITECTURE.md) | SYSTEM_ARCHITECTURE.md | 2026-02-03 | 早期系统架构设计 |
| [V1-SERVICE_COMMUNICATION.md](./V1-SERVICE_COMMUNICATION.md) | SERVICE_COMMUNICATION_ARCHITECTURE.md | 2026-02-03 | 早期服务通信设计 |
| [V1-DATA_FLOW.md](./V1-DATA_FLOW.md) | DATA_FLOW_ARCHITECTURE.md | 2026-02-03 | 早期数据流设计 |
| [V1-PROJECT_STRUCTURE.md](./V1-PROJECT_STRUCTURE.md) | PROJECT_STRUCTURE.md | 2026-02-03 | 早期项目结构设计 |
| [V1-DATA_SERVICE_INTEGRATION.md](./V1-DATA_SERVICE_INTEGRATION.md) | DATA_SERVICE_INTEGRATION.md | 2026-02-04 | 早期数据服务集成方案 |

## 版本演进

### 数据源扩展计划 V2 (2026-02-13) - 已取消

**变更原因**: 经过详细调研和POC测试，7个潜在数据源均无法满足混合数据采集标准

**调研结果**:
- ❌ 网易财经：API已失效
- ❌ 金融界：无官方API
- ❌ 中国证券网：无公开接口
- ⚠️ 同花顺：需付费（298-60,000元/年）
- ❌ 和讯网：API已停用
- ❌ 中金在线：无公开接口
- ❌ 雪球：反爬过于严格

**结论**: 无可用免费数据源，计划取消，保持现有4源系统

**归档文档**:
- [V2026-02-13-DATA_SOURCE_EXPANSION_PLAN_V2-CANCELLED.md](./V2026-02-13-DATA_SOURCE_EXPANSION_PLAN_V2-CANCELLED.md)
- [V2026-02-13-DATA_SOURCE_SURVEY_REPORTS.md](./V2026-02-13-DATA_SOURCE_SURVEY_REPORTS.md)
- [V2026-02-13-NEW_DATA_SOURCE_FEASIBILITY.md](./V2026-02-13-NEW_DATA_SOURCE_FEASIBILITY.md)

### V2026-02-10 → CURRENT (2026-02-11)

**变更原因**: 架构审查完成，识别并解决6个架构冲突

**主要变更**:
- 引入事件总线架构，消除服务间直接依赖
- 明确AI对话服务由Backend实现
- 设计小程序游客模式与数据流优化方案
- 制定Redis渐进式部署策略

**最新版本**: [CURRENT/SERVICE_ARCHITECTURE.md](../CURRENT/SERVICE_ARCHITECTURE.md)

### V1 → V2026-02-10

**变更原因**: 从早期概念设计演进为详细服务架构

**主要变更**:
- 从单体架构演进为六服务微服务架构
- 引入统一数据平台概念
- 明确服务间调用关系与数据流

## 如何参考历史文档

1. **了解演进脉络**: 通过对比不同版本理解架构演进逻辑
2. **追溯决策背景**: 查看某些设计决策的历史原因
3. **恢复被移除内容**: 查找可能在新版本中精简的详细信息

## 相关链接

- [最新架构文档](../CURRENT/) - 当前活跃架构文档
- [架构决策记录](../CURRENT/DECISIONS/) - 重大架构决策说明
- [项目导航中心](../../CLAUDE.md) - 项目文档总入口

---

*本文档最后更新于：2026-02-13*
