# 前端API客户端模块待办事项

最后更新：2026-01-29
负责智能体：前端逻辑智能体（兼管API客户端）
工作目录：`frontend/src/api/`
状态文档：`docs/modules/frontend/API_TODO.md`

## 📋 概述

本文档跟踪前端API客户端模块的所有开发任务，包括HTTP请求封装、错误处理、请求拦截、响应转换等API相关功能。

## 🚨 高优先级

### 1. API客户端功能测试
**目标**：验证API客户端与后端正常通信
**状态**: pending
**具体任务**：
- [ ] 测试`novelApi.js`中所有API方法
- [ ] 验证`POST /api/crawl`请求发送和响应处理
- [ ] 测试`GET /api/status/:taskId`轮询功能
- [ ] 验证`POST /api/generate-txt`文件生成请求
- [ ] 测试`GET /api/download/:filename`文件下载
- [ ] 检查请求超时和重试机制

**关联文件**：
- `frontend/src/api/novelApi.js`
- `frontend/src/composables/useNovelCrawler.js`

### 2. 错误处理完善
**目标**：提供完善的API错误处理机制
**状态**: pending
**具体任务**：
- [ ] 统一API错误响应处理
- [ ] 实现网络错误分类和处理
- [ ] 添加HTTP状态码映射
- [ ] 优化错误信息提取和展示
- [ ] 实现错误重试和恢复逻辑

**关联文件**：
- `frontend/src/api/novelApi.js`
- `frontend/src/composables/useErrorHandler.js`
- `frontend/src/components/ErrorToast.vue`

## ⚠️ 中优先级

### 3. 请求拦截和转换
**目标**：实现请求/响应拦截和数据处理
**状态**: pending
**具体任务**：
- [ ] 添加请求拦截器（添加认证头等）
- [ ] 实现响应拦截器（统一数据处理）
- [ ] 添加请求/响应数据转换
- [ ] 实现请求取消功能
- [ ] 优化请求并发控制

**关联文件**：
- `frontend/src/api/novelApi.js`
- `frontend/src/api/interceptors.js`（新文件）

### 4. 配置管理和环境支持
**目标**：提供灵活的API配置管理
**状态**: pending
**具体任务**：
- [ ] 实现环境特定的API配置
- [ ] 添加API基础URL动态配置
- [ ] 实现请求超时配置
- [ ] 添加调试模式和日志控制
- [ ] 支持多环境（开发、测试、生产）

**关联文件**：
- `frontend/src/api/config.js`（新文件）
- `frontend/src/api/novelApi.js`
- `frontend/.env.*` 环境文件

### 5. 文件上传/下载处理
**目标**：完善文件相关API处理
**状态**: pending
**具体任务**：
- [ ] 优化文件下载进度跟踪
- [ ] 实现大文件分块下载支持
- [ ] 添加文件上传功能（如需）
- [ ] 优化二进制数据处理
- [ ] 实现文件类型验证

**关联文件**：
- `frontend/src/api/novelApi.js`
- `frontend/src/api/file-api.js`（新文件）

## 📋 低优先级

### 6. 缓存和性能优化
**目标**：提供API响应缓存和性能优化
**状态**: pending
**具体任务**：
- [ ] 实现API响应缓存机制
- [ ] 添加请求去重和合并
- [ ] 实现本地存储缓存
- [ ] 优化网络请求性能
- [ ] 添加请求优先级管理

**关联文件**：
- `frontend/src/api/cache.js`（新文件）
- `frontend/src/api/novelApi.js`

### 7. 监控和日志
**目标**：添加API调用监控和日志
**状态**: pending
**具体任务**：
- [ ] 实现API调用统计
- [ ] 添加请求耗时监控
- [ ] 实现错误日志记录
- [ ] 添加性能监控报告
- [ ] 支持开发者工具集成

**关联文件**：
- `frontend/src/api/monitoring.js`（新文件）
- `frontend/src/api/novelApi.js`

### 8. API客户端测试套件
**目标**：确保API客户端代码质量和功能稳定性
**状态**: pending
**具体任务**：
- [ ] 编写API客户端单元测试
- [ ] 创建网络请求模拟测试
- [ ] 测试错误处理流程
- [ ] 验证拦截器功能
- [ ] 添加性能基准测试

**关联文件**：
- `frontend/tests/api/`（新测试目录）
- `frontend/src/api/novelApi.js`

## 🛠️ 技术债务

### 9. 代码重构和优化
**目标**：清理冗余代码和优化API客户端结构
**状态**: pending
**具体任务**：
- [ ] 清理API客户端中的调试语句
- [ ] 统一API方法设计模式
- [ ] 优化错误处理流程
- [ ] 提取公共API逻辑
- [ ] 添加详细的API文档

**关联文件**：
- 所有`frontend/src/api/`下的文件

### 10. TypeScript迁移（可选）
**目标**：将API客户端迁移到TypeScript
**状态**: pending
**具体任务**：
- [ ] 添加TypeScript类型定义
- [ ] 迁移API客户端到TS
- [ ] 添加接口类型定义
- [ ] 实现类型安全的API调用
- [ ] 更新相关依赖和配置

**关联文件**：
- `frontend/src/api/novelApi.ts`（新文件）
- `frontend/src/types/api.ts`（新文件）
- `frontend/tsconfig.json`（新文件）

## 📊 进度跟踪

### 今日进展 (2026-01-29)
- ✅ **API客户端代码审查完成**：已完整检查 `frontend/src/api/novelApi.js` 实现
- ✅ **API端点覆盖验证**：确认实现了所有6个核心API方法：
  - `startCrawl(url, options)` - 启动爬取任务
  - `getTaskStatus(taskId)` - 获取任务状态
  - `generateTxt(taskId, options)` - 生成TXT文件
  - `downloadFile(filename)` - 下载文件（支持Blob响应）
  - `getAllTasks()` - 获取所有任务列表
  - `deleteTask(taskId)` - 删除任务
  - `healthCheck()` - 健康检查
- ✅ **错误处理机制验证**：确认包含完整的错误拦截和处理：
  - 响应拦截器统一处理响应数据
  - 请求拦截器预留认证扩展
  - HTTP状态码分类处理（400, 404, 429, 500, 503）
  - 网络错误分类（NO_RESPONSE, REQUEST_ERROR, NETWORK_ERROR）
  - 统一的错误对象格式（code, message, originalError）
- ✅ **配置检查**：确认包含：
  - 基础URL配置（`/api`）
  - 超时配置（30秒）
  - Content-Type设置（application/json）
  - Blob响应类型支持
- 🔄 **下一步**：等待后端编码和网络问题解决后执行端到端API测试

### 遇到的问题
- **网络连接**：依赖后端服务可用性
- **错误处理**：需要统一错误响应格式
- **性能问题**：大量请求可能导致性能问题

### 依赖关系
- **依赖后端API**：API客户端直接调用后端接口
- **被组合式函数调用**：组合式函数使用API客户端
- **影响用户体验**：API响应速度和稳定性影响用户体验
- **依赖网络环境**：受网络条件和服务器状态影响

## 🔄 更新记录

### 2026-01-29
- 文档创建，从原todo.md迁移API客户端相关任务
- 初始状态：所有任务标记为pending
- 负责人：前端逻辑智能体（兼管）

### 下一步行动
1. 优先测试API客户端基本功能（高优先级）
2. 完善错误处理和拦截器
3. 优化配置和文件处理

---

**说明**：
- 完成任务后，将状态从 `pending` 改为 `completed`
- 开始任务时，将状态改为 `in_progress`
- 遇到阻塞问题时，标记为 `blocked` 并在下方说明
- 每日更新"今日进展"和"遇到的问题"部分