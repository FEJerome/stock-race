# Stock-Race 前端应用

## 🚀 项目概述

这是一个基于React 18 + TypeScript + Vite构建的股票竞赛平台前端应用，提供完整的股票交易界面、实时数据监控、AI决策支持和投资组合管理功能。

## 📋 功能特性

### ✅ 已完成功能

1. **用户认证系统**
   - 登录/注册页面（模拟实现）
   - 路由保护（ProtectedRoute）
   - 状态管理（Zustand + 持久化）

2. **核心交易功能**
   - 股票买卖交易界面
   - 实时行情展示
   - 持仓管理
   - 订单历史记录

3. **数据可视化**
   - 收益曲线图表（ProfitChart）
   - 实时行情组件
   - 持仓汇总展示
   - AI决策日志

4. **API服务集成**
   - 完整的服务层架构
   - 模拟API实现（用于开发）
   - 真实API占位符（便于后端集成）
   - 统一的错误处理和加载状态

5. **响应式设计**
   - 支持移动端、平板和桌面
   - Ant Design 5.x UI组件库
   - Tailwind CSS 工具类

6. **开发工具**
   - TypeScript严格类型检查
   - React Query数据获取
   - WebSocket实时通信（模拟）
   - 格式化工具函数

### 🔄 待集成功能

1. **后端API集成**
   - 替换模拟API为真实后端调用
   - WebSocket实时数据推送
   - 用户认证JWT集成

2. **高级功能**
   - 实时竞赛排行榜
   - AI模型配置界面
   - 高级分析工具
   - 通知系统

## 🏗️ 技术架构

### 技术栈
- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI组件库**: Ant Design 5.x
- **样式**: Tailwind CSS + CSS Modules
- **状态管理**: Zustand
- **数据获取**: React Query + Axios
- **路由**: React Router v6
- **图表**: Recharts
- **实时通信**: WebSocket（模拟）

### 项目结构
```
frontend/src/
├── types/              # TypeScript类型定义
├── store/              # 状态管理（Zustand）
├── services/           # API服务层
├── hooks/              # 自定义Hooks
├── utils/              # 工具函数
├── components/         # 可复用组件
│   ├── common/        # 通用组件
│   ├── layout/        # 布局组件
│   ├── charts/        # 图表组件
│   ├── market/        # 市场组件
│   ├── portfolio/     # 持仓组件
│   └── ai/            # AI组件
├── pages/              # 页面组件
└── assets/             # 静态资源
```

## 🚀 快速开始

### 环境要求
- Node.js 16+
- npm 8+ 或 yarn 1.22+

### 安装依赖
```bash
cd frontend
npm install
# 或
yarn install
```

### 开发模式
```bash
npm run dev
# 访问 http://localhost:3000
```

### 构建生产版本
```bash
npm run build
npm run preview
```

### 测试API服务
```bash
# 启动开发服务器后访问：
# http://localhost:3000/test-api
```

## 🔧 开发指南

### 1. 模拟数据
所有API服务目前使用模拟数据，便于前端独立开发。模拟特性包括：
- 网络延迟模拟（setTimeout）
- 随机数据生成
- 错误状态模拟
- 分页和过滤功能

### 2. 切换到真实API
要连接真实后端API，需要：

1. **配置环境变量**
```env
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3001
```

2. **启用真实API调用**
在服务文件中取消注释真实API调用代码：
```typescript
// 在 services/*.ts 文件中：
// 注释掉模拟代码，取消注释真实API调用
// return api.get<Stock[]>('/market/quotes', { params });
```

### 3. 添加新功能

#### 创建新页面
```typescript
// 1. 在 src/pages/ 创建组件
// 2. 在 App.tsx 添加路由
// 3. 在 MainLayout.tsx 添加菜单项
```

#### 创建新服务
```typescript
// 1. 在 src/services/ 创建服务文件
// 2. 定义TypeScript类型
// 3. 实现模拟和真实API
// 4. 在组件中使用React Query调用
```

#### 创建新组件
```typescript
// 1. 在 src/components/ 合适目录创建
// 2. 使用TypeScript定义props
// 3. 集成Ant Design组件
// 4. 添加响应式设计
```

## 📊 API服务说明

### 认证服务 (auth.service.ts)
- `login()` - 用户登录
- `register()` - 用户注册
- `logout()` - 用户登出
- `getCurrentUser()` - 获取当前用户

### 交易服务 (trading.service.ts)
- `getOrders()` - 获取订单列表（分页）
- `createOrder()` - 创建交易订单
- `cancelOrder()` - 取消订单
- `getPositions()` - 获取持仓列表
- `getPortfolioSummary()` - 获取组合汇总
- `getTradeHistory()` - 获取交易历史

### 市场服务 (market.service.ts)
- `getStockQuotes()` - 获取股票行情
- `searchStocks()` - 搜索股票
- `getStockDetail()` - 获取股票详情
- `getHotStocks()` - 获取热门股票
- `getStockHistory()` - 获取历史数据
- `getMarketIndices()` - 获取市场指数

### AI服务 (ai.service.ts)
- `getAIAccounts()` - 获取AI账户列表
- `createAIAccount()` - 创建AI账户
- `getAIDecisions()` - 获取AI决策记录
- `triggerAIAnalysis()` - 触发AI分析
- `getAIPerformance()` - 获取AI性能统计
- `batchAIAnalysis()` - 批量触发分析

## 🎨 UI设计规范

### 颜色方案
- **主色**: `#1890ff` (Ant Design蓝色)
- **成功色**: `#52c41a` (绿色)
- **警告色**: `#faad14` (橙色)
- **错误色**: `#ff4d4f` (红色)
- **文字色**:
  - 主要: `rgba(0, 0, 0, 0.85)`
  - 次要: `rgba(0, 0, 0, 0.45)`
  - 禁用: `rgba(0, 0, 0, 0.25)`

### 响应式断点
- **xs**: < 576px (手机)
- **sm**: ≥ 576px (平板)
- **md**: ≥ 768px (小桌面)
- **lg**: ≥ 992px (桌面)
- **xl**: ≥ 1200px (大桌面)
- **xxl**: ≥ 1600px (超大桌面)

### 组件使用规范
1. **表单**: 使用Ant Design Form组件
2. **表格**: 使用Ant Design Table组件
3. **图表**: 使用Recharts库
4. **通知**: 使用Ant Design notification
5. **加载**: 使用Spin组件和React Query状态

## 🔍 调试和测试

### 开发工具
- **React DevTools**: 组件树和状态调试
- **Redux DevTools**: Zustand状态调试（需安装扩展）
- **React Query DevTools**: 数据获取调试

### 测试API
访问 `/test-api` 页面可以：
1. 测试所有API服务的连通性
2. 查看模拟数据返回
3. 验证错误处理
4. 测量API响应时间

### 常见问题

#### 1. 样式不生效？
- 检查Tailwind CSS配置
- 确保正确导入CSS文件
- 使用正确的类名

#### 2. API调用失败？
- 检查网络连接
- 验证API服务是否运行
- 查看浏览器控制台错误

#### 3. TypeScript类型错误？
- 更新类型定义
- 使用正确的类型导入
- 检查tsconfig.json配置

## 📈 性能优化

### 已实施优化
1. **代码分割**: Vite自动代码分割
2. **懒加载**: React.lazy路由懒加载
3. **缓存**: React Query自动缓存
4. **图片优化**: Vite图片处理

### 建议优化
1. **包大小分析**: 使用vite-bundle-analyzer
2. **PWA支持**: 添加Service Worker
3. **CDN部署**: 静态资源CDN加速
4. **SSR/SSG**: 考虑服务端渲染

## 🤝 贡献指南

### 开发流程
1. Fork项目
2. 创建功能分支
3. 提交代码变更
4. 创建Pull Request

### 代码规范
- 使用TypeScript严格模式
- 遵循ESLint规则
- 编写组件文档
- 添加单元测试

### 提交信息
使用约定式提交：
- `feat:` 新功能
- `fix:` bug修复
- `docs:` 文档更新
- `style:` 代码格式
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建过程或辅助工具

## 📞 支持与反馈

### 问题报告
1. 检查现有Issue
2. 创建新Issue
3. 提供复现步骤
4. 包含环境信息

### 功能请求
1. 描述使用场景
2. 提供设计建议
3. 讨论技术实现

---

**最后更新**: 2026-02-03
**版本**: 1.0.0
**状态**: 开发完成，待后端集成