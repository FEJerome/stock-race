# Stock-Race 微信小程序开发进度

## 📋 文档信息

| 项目 | 信息 |
|------|------|
| 文档版本 | v1.0 |
| 创建日期 | 2026-02-09 |
| 最后更新 | 2026-02-09 |
| 维护者 | 首席架构师 |

---

## 1. 开发概览

### 1.1 当前状态

**已完成**：基础架构搭建 + P0核心功能（认证、仪表盘、AI基金经理）

**开发分支**：`miniprogram-development`

**工作树位置**：`/home/fe-jerome/projects/stock-race/worktrees/worktree-miniprogram/miniprogram/`

### 1.2 技术栈确认

| 技术 | 版本 | 状态 |
|------|------|------|
| UniApp | 3.x | ✅ 已配置 |
| Vue 3 | 3.4+ | ✅ 已配置 |
| TypeScript | 5.x | ✅ 已配置 |
| Vite | 5.x | ✅ 已配置 |
| Pinia | 2.x | ✅ 已配置 |
| uView Plus | 3.x | ✅ 已配置 |
| Luch-request | 3.x | ✅ 已配置 |

---

## 2. 已完成模块

### 2.1 基础架构 ✅

**文件清单**：
- `package.json` - 项目依赖配置
- `vite.config.ts` - Vite构建配置
- `tsconfig.json` / `tsconfig.node.json` - TypeScript配置
- `src/manifest.json` - 小程序应用配置
- `src/pages.json` - 页面路由配置
- `src/main.ts` - 应用入口
- `src/App.vue` - 根组件

**样式系统**：
- `src/styles/variables.scss` - SCSS变量定义
- `src/styles/global.scss` - 全局样式类

**类型定义**：
- `src/types/api.ts` - API响应类型
- `src/types/ai.ts` - AI相关类型
- `src/types/trading.ts` - 交易相关类型
- `src/types/market.ts` - 市场数据类型

**工具函数**：
- `src/utils/constants.ts` - 常量定义
- `src/utils/cache.ts` - 缓存管理
- `src/utils/formatter.ts` - 数据格式化
- `src/utils/validator.ts` - 数据验证

### 2.2 API层 ✅

**文件清单**：
- `src/api/request.ts` - HTTP请求封装（含拦截器）
- `src/api/auth.ts` - 认证API
- `src/api/ai.ts` - AI服务API
- `src/api/trading.ts` - 交易API
- `src/api/market.ts` - 市场数据API

### 2.3 状态管理 (Pinia) ✅

**文件清单**：
- `src/stores/index.ts` - Store入口
- `src/stores/auth.ts` - 认证状态（含持久化）
- `src/stores/user.ts` - 用户状态
- `src/stores/market.ts` - 市场数据状态
- `src/stores/ai.ts` - AI状态
- `src/stores/trading.ts` - 交易状态

### 2.4 认证模块 ✅

**页面**：`src/pages/login/login.vue`

**功能**：
- 用户登录表单
- 表单验证（用户名、密码）
- 演示账户快速登录
- 降级机制（API失败时切换到演示账户）
- 登录成功后跳转首页

### 2.5 仪表盘模块 ✅

**页面**：`src/pages/index/index.vue`

**功能**：
- 总资产卡片（总资产、收益、现金、持仓）
- 董事长指令卡片（目标收益率、完成进度、董事长寄语）
- AI基金经理概览列表
- 持仓概览列表
- 快捷操作（市场行情、竞赛排行、交易记录、设置）
- 下拉刷新数据

### 2.6 AI基金经理模块 ✅

**页面**：
- `src/pages/ai-managers/list.vue` - 基金经理列表
- `src/pages/ai-managers/create.vue` - 创建基金经理
- `src/pages/ai-managers/detail.vue` - 详情页（占位）

**功能**：
- 基金经理卡片列表（名称、院校、风险等级、收益）
- 创建基金经理表单（名称、院校、资金、风险等级、决策次数）
- 立即决策按钮
- 查看详情跳转

---

## 3. 待开发模块

### 3.1 P1优先级

| 模块 | 页面 | 状态 |
|------|------|------|
| 市场数据 | `market/quotes.vue` | 📝 占位 |
| 市场数据 | `market/stock-detail.vue` | 📝 占位 |
| 持仓 | `portfolio/overview.vue` | 📝 占位 |
| 持仓 | `portfolio/holdings.vue` | 📝 占位 |
| 交易记录 | `trades/list.vue` | 📝 占位 |
| 竞赛排行 | `competition/ranking.vue` | 📝 占位 |

### 3.2 P2优先级

| 模块 | 页面 | 状态 |
|------|------|------|
| AI基金经理详情 | `ai-managers/detail.vue` | 📝 占位 |
| AI基金经理编辑 | `ai-managers/edit.vue` | ⏳ 未创建 |
| 设置 | `settings/profile.vue` | 📝 占位 |
| 设置 | `settings/security.vue` | 📝 占位 |
| 设置 | `settings/notification.vue` | ⏳ 未创建 |
| 分析 | `analytics/overview.vue` | ⏳ 未创建 |
| 分析 | `analytics/comparison.vue` | ⏳ 未创建 |

---

## 4. 项目结构

```
miniprogram/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── .gitignore
└── src/
    ├── manifest.json
    ├── pages.json
    ├── main.ts
    ├── App.vue
    ├── api/
    │   ├── request.ts
    │   ├── auth.ts
    │   ├── ai.ts
    │   ├── trading.ts
    │   └── market.ts
    ├── components/          # 待创建
    ├── pages/
    │   ├── index/index.vue
    │   ├── login/login.vue
    │   ├── ai-managers/
    │   │   ├── list.vue
    │   │   ├── create.vue
    │   │   └── detail.vue
    │   ├── market/
    │   │   ├── quotes.vue
    │   │   └── stock-detail.vue
    │   ├── portfolio/
    │   │   ├── overview.vue
    │   │   └── holdings.vue
    │   ├── trades/list.vue
    │   ├── competition/ranking.vue
    │   └── settings/
    │       ├── profile.vue
    │       └── security.vue
    ├── stores/
    │   ├── index.ts
    │   ├── auth.ts
    │   ├── user.ts
    │   ├── market.ts
    │   ├── ai.ts
    │   └── trading.ts
    ├── styles/
    │   ├── variables.scss
    │   └── global.scss
    ├── types/
    │   ├── api.ts
    │   ├── ai.ts
    │   ├── trading.ts
    │   └── market.ts
    ├── utils/
    │   ├── constants.ts
    │   ├── cache.ts
    │   ├── formatter.ts
    │   └── validator.ts
    └── static/
        ├── icons/           # 待添加图标
        └── images/          # 待添加图片
```

---

## 5. 开发说明

### 5.1 启动开发服务器

```bash
cd /home/fe-jerome/projects/stock-race/worktrees/worktree-miniprogram/miniprogram

# 安装依赖
npm install

# 启动开发服务器
npm run dev:mp-weixin

# 或构建
npm run build:mp-weixin
```

### 5.2 微信开发者工具配置

1. 打开微信开发者工具
2. 选择"导入项目"
3. 项目目录选择：`miniprogram/dist/build/mp-weixin`
4. AppID：使用测试号或正式号
5. 点击"导入"

### 5.3 后端API配置

**开发环境**：
- 后端API：`http://localhost:3001/api`
- AI服务：`http://localhost:8000/api/v1`
- 数据服务：`http://localhost:8001`

**生产环境**：需在 `vite.config.ts` 中修改 `baseURL`

---

## 6. 后续开发计划

### 第一阶段（已完成）
- ✅ 基础架构搭建
- ✅ 认证模块
- ✅ 仪表盘模块
- ✅ AI基金经理模块（列表+创建）

### 第二阶段（待开发）
- 🔄 AI基金经理详情页
- 🔄 市场行情页
- 🔄 持仓总览页
- 🔄 交易记录页

### 第三阶段（待开发）
- ⏳ 竞赛排行页
- ⏳ 设置页面组
- ⏳ 分析页面组
- ⏳ 图表组件集成

---

## 7. 注意事项

1. **图标资源**：需要添加TabBar图标到 `static/icons/`
2. **Logo资源**：需要添加应用Logo到 `static/`
3. **API联调**：确保后端服务已启动（端口3001/8000/8001）
4. **缓存策略**：已实现A股交易时间感知的缓存更新
5. **降级机制**：API失败时会自动切换到演示账户

---

*本文档最后更新于：2026-02-09*
*维护者：首席架构师*
