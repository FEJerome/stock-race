# 架构资料与可信度

本目录主要保存 2026 年 2 月形成的设计文档。它们记录了当时的目标架构和实现设想，**不是当前运行状态、依赖版本或部署能力的验收证明**。

## 使用顺序

1. 先核对实际代码、入口、测试、`package.json`、`pyproject.toml` 和 Compose 配置。
2. 再用本目录解释原始设计意图与模块关系。
3. 发现冲突时记录到调研或任务文档，不直接选择旧文档覆盖代码事实。
4. 经本轮核验的内容才能改写为“当前架构”；未核验部分保留历史语义。

## 资料索引

- [系统架构](SYSTEM_ARCHITECTURE.md)
- [技术栈设计](TECH_STACK.md)
- [项目结构](PROJECT_STRUCTURE.md)
- [历史代码地图](CODE_MAP.md)
- [数据流设计](DATA_FLOW_ARCHITECTURE.md)
- [API 设计](API_SPECIFICATION.md)
- [数据库设计](DATABASE_DESIGN.md)
- [数据服务集成设想](DATA_SERVICE_INTEGRATION.md)

其中技术栈、代码地图和完成记录已经发现与实际依赖或路径不完全一致。阅读时应带着核验目标，不作为新会话的默认执行手册。
