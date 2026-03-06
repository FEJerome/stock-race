# 代码归档说明

## 归档信息

- **归档版本**: v0.9-legacy
- **Git标签**: `v0.9-legacy-archived`
- **归档时间**: 2026-02-28
- **说明**: 2024年火箭式开发版本，六服务架构完整实现

## 目录结构

```
archive/v0.9-legacy/
├── services/           # 后端服务代码
│   ├── backend/        # Node.js后端（旧）
│   ├── trading-ai-service/    # Python AI服务（旧）
│   ├── market-data-service/   # Python行情服务（旧）
│   └── news-service/          # Python新闻服务（旧）
├── infra/              # 基础设施代码
├── scripts/            # 脚本工具
├── tools/              # 开发工具
└── tests/              # 测试代码
```

## 如何查看旧代码

### 方式1：直接浏览归档目录
```bash
# 查看旧服务代码
cat archive/v0.9-legacy/services/trading-ai-service/adapters/deepseek.py
```

### 方式2：切换到Git标签（查看完整状态）
```bash
# 保存当前工作
git stash

# 切换到归档版本
git checkout v0.9-legacy-archived

# ...查看代码...

# 返回开发分支
git checkout develop
git stash pop
```

## 新旧对照参考

| 功能模块 | 旧位置(v0.9) | 新位置(v2.0) | 复用建议 |
|---------|-------------|-------------|---------|
| DeepSeek适配器 | `services/trading-ai-service/adapters/deepseek.py` | `trading-ai-service/adapters/deepseek.py` | ✅ 直接复用 |
| GLM适配器 | `services/trading-ai-service/adapters/glm.py` | `trading-ai-service/adapters/glm.py` | ✅ 直接复用 |
| 行情采集器 | `services/market-data-service/collectors/` | `market-data-service/internal/collector/` | ⚠️ 参考重构 |
| 用户系统 | `services/backend/` | `backend/internal/` | ❌ Go重写 |
| 数据库模型 | 各服务独立 | 统一在`internal/model/` | ❌ 重新设计 |

## v2.0新架构说明

根目录下的新服务采用以下技术栈：

| 服务 | 语言 | 框架 | 数据库 |
|-----|------|------|-------|
| backend | Go | Gin + GORM + Wire | PostgreSQL |
| trading-ai-service | Python | FastAPI + SQLAlchemy | PostgreSQL |
| market-data-service | Python | FastAPI + TimescaleDB | TimescaleDB |
| news-service | Python | FastAPI | PostgreSQL |
| config-center | Go | Gin | PostgreSQL |
| notification-service | Go | Gin | Redis |

## 注意事项

1. **archive/目录为只读**: 不要修改归档代码，仅供参考
2. **新开发在根目录**: 所有新代码写入根目录下的服务目录
3. **文档在docs/v1/**: 新PRD和文档位于docs/v1/，不归档

## 联系

如有疑问，查看Git历史或联系项目负责人。
