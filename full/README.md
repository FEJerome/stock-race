# Full 形态 (v2.0)

生产级微服务架构。

## 状态

📋 Phase 3 规划中

## 目录结构

- `backend/` - Go后端服务
- `trading-ai-service/` - Python AI服务
- `market-data-service/` - Python数据服务
- `news-service/` - Python新闻服务
- `notification-service/` - Go通知服务
- `config-center/` - Go配置中心

## 演进路径

基于 Local 形态的模块边界拆分：
- Local 的 `core/engine` → Full 的 `trading-ai-service`
- Local 的 `adapters/datasource` → Full 的 `market-data-service`
- Local 的 API 层 → Full 的 `backend`

## 参考

- [Local](../local/) - Phase 1 代码
- [MVP](../mvp/) - Phase 2 代码
