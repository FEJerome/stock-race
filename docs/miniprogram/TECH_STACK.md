# Stock-Race 微信小程序 - 技术栈方案

## 📋 文档信息

| 项目 | 信息 |
|------|------|
| 文档版本 | v1.0 |
| 创建日期 | 2026-02-09 |
| 最后更新 | 2026-02-09 |
| 维护者 | 首席架构师 |

---

## 1. 技术选型概述

### 1.1 选型原则

- **成熟稳定**：选择成熟、经过验证的技术栈
- **生态完善**：社区活跃，文档完善，问题解决方便
- **开发效率**：工具链完善，开发体验好
- **性能优良**：运行时性能优秀，用户体验好
- **团队适配**：与现有Web端技术栈差异可控

### 1.2 推荐方案对比

| 技术方案 | 优势 | 劣势 | 推荐度 |
|----------|------|------|--------|
| 原生小程序开发 | 性能最优，功能最全 | 开发效率低，组件库较少 | ⭐⭐⭐ |
| UniApp | 一套代码多端运行，Vue生态 | 性能略低于原生 | ⭐⭐⭐⭐⭐ |
| Taro | React语法，生态完善 | 需要编译配置 | ⭐⭐⭐⭐ |

---

## 2. 核心技术栈（推荐：UniApp）

### 2.1 框架层

| 技术 | 版本 | 用途 |
|------|------|------|
| **UniApp** | 3.x+ | 跨平台小程序开发框架 |
| **Vue 3** | 3.3+ | 前端框架 |
| **TypeScript** | 5.0+ | 类型安全 |
| **Vite** | 5.0+ | 构建工具 |

**选型理由**：
- UniApp是微信小程序开发的主流框架，生态成熟
- 与现有Web端技术栈（Vue 3 + TypeScript）一致，降低学习成本
- 一套代码可扩展到支付宝、抖音等多平台
- 组件库丰富，开发效率高

### 2.2 UI组件库

| 技术 | 版本 | 用途 |
|------|------|------|
| **uView Plus** | 3.x | UI组件库 |
| 或 **NutUI** | 4.x | 京东出品的移动端UI库 |
| 或 **TDesign Mobile** | 1.x | 腾讯出品的UI库 |

**推荐：uView Plus**
- 专为UniApp设计，集成度高
- 组件丰富，涵盖常用场景
- 样式现代，符合商务定位
- 文档完善，社区活跃

### 2.3 状态管理

| 技术 | 版本 | 用途 |
|------|------|------|
| **Pinia** | 2.x+ | Vue 3官方推荐状态管理库 |

**选型理由**：
- Vue 3生态的标准状态管理方案
- API简洁，TypeScript支持良好
- 模块化设计，便于维护
- 与现有Web端架构（可替换Zustand为Pinia）一致

### 2.4 网络请求

| 技术 | 版本 | 用途 |
|------|------|------|
| **Uni.request** | 内置 | 基础请求 |
| **Luch-request** | 3.x+ | 请求封装库 |
| 或 **uni-ajax** | 2.x+ | 请求封装库 |

**推荐：Luch-request**
- 轻量级，专为UniApp设计
- 支持拦截器、请求队列
- TypeScript支持良好
- 可复用现有Web端的请求封装逻辑

### 2.5 数据缓存

| 技术 | 版本 | 用途 |
|------|------|------|
| **uni.setStorage** | 内置 | 本地存储 |
| **pinia-plugin-persistedstate** | 3.x+ | Pinia持久化插件 |

**选型理由**：
- 复用Web端的缓存策略设计
- 支持A股交易时间感知的缓存更新
- 与Pinia无缝集成

### 2.6 图表库

| 技术 | 版本 | 用途 |
|------|------|------|
| **ucharts** | 2.x | Canvas图表库 |
| 或 **ECharts** | 5.x | 通用图表库 |

**推荐：ucharts**
- 专为小程序设计，性能优异
- 支持K线图、折线图、饼图等常用图表
- 文件体积小，加载快
- 适合金融数据展示

### 2.7 工具库

| 技术 | 版本 | 用途 |
|------|------|------|
| **Day.js** | 1.x+ | 日期处理 |
| **Lodash-es** | 4.x+ | 工具函数 |
| **Decimal.js** | 10.x+ | 精确计算（金融金额） |

---

## 3. 开发工具链

### 3.1 开发环境

| 工具 | 版本 | 用途 |
|------|------|------|
| **HBuilderX** | 4.x+ | 官方IDE，开发调试 |
| 或 **VS Code** | 最新 + Volar插件 | 通用IDE |
| **微信开发者工具** | 最新 | 小程序预览、调试、发布 |

### 3.2 代码规范

| 工具 | 版本 | 用途 |
|------|------|------|
| **ESLint** | 8.x+ | 代码质量检查 |
| **Prettier** | 3.x+ | 代码格式化 |
| **TypeScript** | 5.x+ | 类型检查 |
| **stylelint** | 15.x+ | 样式规范检查 |

### 3.3 构建工具

| 工具 | 版本 | 用途 |
|------|------|------|
| **Vite** | 5.x+ | 开发服务器和构建 |
| **@dcloudio/vite-plugin-uni** | 最新 | UniApp Vite插件 |

---

## 4. 项目结构设计

```
miniprogram/
├── src/
│   ├── api/                    # API接口层
│   │   ├── auth.ts            # 认证相关
│   │   ├── trading.ts         # 交易相关
│   │   ├── market.ts          # 市场数据
│   │   ├── ai.ts             # AI服务
│   │   └── request.ts        # 请求封装
│   │
│   ├── components/             # 公共组件
│   │   ├── common/           # 通用组件
│   │   │   ├── LoadingSpinner.vue
│   │   │   ├── EmptyState.vue
│   │   │   └── ErrorBoundary.vue
│   │   ├── market/           # 市场相关组件
│   │   │   ├── StockCard.vue
│   │   │   ├── MarketTrend.vue
│   │   │   └── KLineChart.vue
│   │   ├── portfolio/        # 持仓相关组件
│   │   │   ├── AssetSummary.vue
│   │   │   ├── HoldingsList.vue
│   │   │   └── PositionCard.vue
│   │   ├── ai/              # AI相关组件
│   │   │   ├── AIManagerCard.vue
│   │   │   ├── DecisionItem.vue
│   │   │   └── PromptDisplay.vue
│   │   └── charts/          # 图表组件
│   │       ├── ProfitChart.vue
│   │       ├── HoldingsPie.vue
│   │       └── TrendLine.vue
│   │
│   ├── pages/                 # 页面
│   │   ├── index/            # 首页/仪表盘
│   │   │   └── index.vue
│   │   ├── login/            # 登录页
│   │   │   └── login.vue
│   │   ├── ai-managers/      # AI基金经理管理
│   │   │   ├── list.vue
│   │   │   ├── detail.vue
│   │   │   ├── create.vue
│   │   │   └── edit.vue
│   │   ├── market/           # 市场数据
│   │   │   ├── quotes.vue
│   │   │   └── stock-detail.vue
│   │   ├── portfolio/        # 持仓/投资组合
│   │   │   ├── overview.vue
│   │   │   └── holdings.vue
│   │   ├── trades/           # 交易记录
│   │   │   └── list.vue
│   │   ├── competition/      # 竞赛/排行榜
│   │   │   └── ranking.vue
│   │   ├── analytics/        # 分析
│   │   │   ├── overview.vue
│   │   │   └── comparison.vue
│   │   └── settings/         # 设置
│   │       ├── profile.vue
│   │       ├── security.vue
│   │       └── notification.vue
│   │
│   ├── stores/                # 状态管理
│   │   ├── index.ts          # Store入口
│   │   ├── auth.ts          # 认证状态
│   │   ├── user.ts          # 用户状态
│   │   ├── market.ts        # 市场数据状态
│   │   └── ai.ts            # AI状态
│   │
│   ├── utils/                 # 工具函数
│   │   ├── cache.ts         # 缓存工具
│   │   ├── formatter.ts     # 数据格式化
│   │   ├── validator.ts     # 数据验证
│   │   ├── market-time.ts   # A股交易时间判断
│   │   └── constants.ts     # 常量定义
│   │
│   ├── types/                 # TypeScript类型定义
│   │   ├── api.ts           # API响应类型
│   │   ├── user.ts          # 用户类型
│   │   ├── trading.ts       # 交易类型
│   │   ├── ai.ts            # AI相关类型
│   │   └── market.ts        # 市场数据类型
│   │
│   ├── styles/                # 全局样式
│   │   ├── variables.scss   # SCSS变量
│   │   ├── mixins.scss      # SCSS混入
│   │   └── global.scss      # 全局样式
│   │
│   ├── static/                # 静态资源
│   │   ├── images/          # 图片资源
│   │   └── icons/           # 图标资源
│   │
│   ├── App.vue               # 应用入口
│   ├── main.ts               # 主入口文件
│   ├── manifest.json         # 应用配置
│   ├── pages.json            # 页面路由配置
│   └── uni.scss             # UniApp内置变量
│
├── .eslintrc.js             # ESLint配置
├── .prettierrc              # Prettier配置
├── tsconfig.json            # TypeScript配置
├── vite.config.ts            # Vite配置
└── package.json             # 依赖配置
```

---

## 5. 技术架构

### 5.1 架构分层

```
┌─────────────────────────────────────────┐
│         表现层 (Presentation)          │
│  Pages + Components + UI Components     │
└───────────────┬───────────────────────┘
                │
┌───────────────▼───────────────────────┐
│         业务层 (Business Logic)        │
│         Stores (Pinia)                │
└───────────────┬───────────────────────┘
                │
┌───────────────▼───────────────────────┐
│         数据层 (Data Access)           │
│     API Services + Utils               │
└───────────────┬───────────────────────┘
                │
┌───────────────▼───────────────────────┐
│         网络层 (Network)              │
│    HTTP Request + Cache Layer          │
└───────────────┬───────────────────────┘
                │
┌───────────────▼───────────────────────┐
│         后端服务 (Backend)              │
│   Stock-Race Backend API Services      │
└─────────────────────────────────────────┘
```

### 5.2 状态管理架构

```typescript
// stores/index.ts
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

export default pinia

// stores/auth.ts - 认证状态
import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '',
    userInfo: null,
    isLoggedIn: false
  }),
  actions: {
    setToken(token: string) { this.token = token },
    setUserInfo(userInfo: UserInfo) { this.userInfo = userInfo },
    logout() {
      this.token = ''
      this.userInfo = null
      this.isLoggedIn = false
    }
  },
  persist: {
    key: 'stock-race-auth',
    storage: {
      getItem: uni.getStorageSync,
      setItem: uni.setStorageSync
    }
  }
})
```

### 5.3 网络请求架构

```typescript
// api/request.ts - 请求封装
import Request from 'luch-request'
import { useAuthStore } from '@/stores/auth'

const http = new Request({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30000,
  header: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
http.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore()
    if (authStore.token) {
      config.header.Authorization = `Bearer ${authStore.token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器
http.interceptors.response.use(
  (response) => {
    const { data } = response
    if (data.code === 200) {
      return data.data
    }
    // 处理业务错误
    uni.showToast({ title: data.message, icon: 'none' })
    return Promise.reject(data)
  },
  (error) => {
    // 降级处理
    return handleFallback(error)
  }
)

export default http
```

### 5.4 缓存策略架构

```typescript
// utils/cache.ts - 缓存工具（复用Web端设计）
class CacheManager {
  private static instance: CacheManager
  private prefix = 'stock-race:'

  static getInstance() {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager()
    }
    return CacheManager.instance
  }

  // 设置缓存
  set(key: string, value: any, ttl?: number) {
    const item = {
      value,
      expire: ttl ? Date.now() + ttl * 1000 : null
    }
    uni.setStorageSync(this.prefix + key, JSON.stringify(item))
  }

  // 获取缓存
  get(key: string) {
    const data = uni.getStorageSync(this.prefix + key)
    if (!data) return null

    const item = JSON.parse(data)
    if (item.expire && Date.now() > item.expire) {
      this.remove(key)
      return null
    }
    return item.value
  }

  // 移除缓存
  remove(key: string) {
    uni.removeStorageSync(this.prefix + key)
  }

  // 清除所有缓存
  clear() {
    try {
      const allKeys = uni.getStorageInfoSync().keys
      allKeys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          uni.removeStorageSync(key)
        }
      })
    } catch (e) {
      console.error('Clear cache error:', e)
    }
  }

  // A股交易时间判断
  isATradingTime(): boolean {
    const now = new Date()
    const day = now.getDay()
    if (day === 0 || day === 6) return false // 周末

    const hour = now.getHours()
    const minute = now.getMinutes()
    const time = hour * 60 + minute

    // 上午 9:30-11:30, 下午 13:00-15:00
    return (time >= 570 && time <= 690) || (time >= 780 && time <= 900)
  }

  // 根据A股交易时间获取缓存TTL
  getTradingTTL(defaultTTL: number): number {
    return this.isATradingTime() ? defaultTTL / 2 : defaultTTL
  }
}

export const cache = CacheManager.getInstance()
```

---

## 6. 与现有后端集成

### 6.1 API兼容性

微信小程序可以直接复用现有后端API服务，无需额外开发：

| 服务 | 地址 | 说明 |
|------|------|------|
| 后端API | http://localhost:3001/api | 认证、交易、持仓等 |
| AI服务 | http://localhost:8000/api/v1 | AI决策、模型适配 |
| 数据服务 | http://localhost:8001 | 股票数据、实时行情 |

### 6.2 认证机制

复用现有的JWT认证机制：

```typescript
// 登录流程
1. 用户输入用户名密码
2. 调用 /api/auth/login
3. 后端返回JWT token
4. 存储到Pinia并持久化到本地
5. 后续请求自动带上token
```

### 6.3 WebSocket集成

实时数据推送（股票行情、AI决策）：

```typescript
// utils/websocket.ts
class WebSocketClient {
  private ws: UniApp.SocketTask | null = null
  private url: string
  private reconnectTimer: number | null = null

  constructor(url: string) {
    this.url = url
  }

  connect() {
    this.ws = uni.connectSocket({
      url: this.url,
      header: { Authorization: `Bearer ${getToken()}` }
    })

    this.ws.onOpen(() => {
      console.log('WebSocket connected')
    })

    this.ws.onMessage((res) => {
      this.handleMessage(JSON.parse(res.data))
    })

    this.ws.onClose(() => {
      console.log('WebSocket closed')
      this.reconnect()
    })

    this.ws.onError((err) => {
      console.error('WebSocket error:', err)
    })
  }

  handleMessage(data: any) {
    // 分发到对应的store
    switch (data.type) {
      case 'quote':
        useMarketStore().updateQuote(data.payload)
        break
      case 'decision':
        useAIStore().addDecision(data.payload)
        break
    }
  }

  reconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, 5000) as any
  }
}
```

---

## 7. 性能优化策略

### 7.1 首屏优化

- **分包加载**：使用分包策略，减少首屏加载体积
- **按需引入**：组件和工具函数按需引入
- **图片优化**：使用webp格式，设置合理的尺寸

### 7.2 渲染优化

- **虚拟列表**：长列表使用uni-list的虚拟滚动
- **节流防抖**：频繁操作使用节流防抖
- **骨架屏**：数据加载时显示骨架屏

### 7.3 网络优化

- **请求合并**：合并相似请求，减少网络开销
- **数据压缩**：后端开启gzip压缩
- **预加载**：提前预加载可能需要的数据

### 7.4 缓存优化

- **多级缓存**：内存缓存 + 本地缓存
- **过期策略**：A股交易时间感知的缓存更新
- **缓存预热**：启动时预加载热点数据

---

## 8. 安全性考虑

### 8.1 数据安全

- **HTTPS传输**：所有API请求使用HTTPS
- **敏感数据加密**：敏感信息本地加密存储
- **Token管理**：Token过期自动刷新

### 8.2 代码安全

- **输入验证**：所有用户输入严格验证
- **XSS防护**：避免直接渲染用户输入
- **CSRF防护**：使用Token验证

### 8.3 隐私保护

- **最小权限**：只请求必要的微信授权
- **隐私政策**：清晰的隐私政策说明
- **数据本地化**：用户数据不外传

---

## 9. 开发规范

### 9.1 命名规范

- **组件**：PascalCase，如 `StockCard.vue`
- **文件**：kebab-case，如 `api/auth.ts`
- **变量/函数**：camelCase，如 `getUserInfo()`
- **常量**：UPPER_SNAKE_CASE，如 `API_BASE_URL`
- **类**：PascalCase，如 `CacheManager`

### 9.2 代码风格

- 使用TypeScript强类型
- 使用ESLint + Prettier统一代码风格
- 组件使用 `<script setup>` 语法
- 单文件组件顺序：`<template>` -> `<script setup>` -> `<style>`

### 9.3 注释规范

```typescript
/**
 * 获取用户信息
 * @param userId - 用户ID
 * @returns 用户信息对象
 */
async function getUserInfo(userId: string): Promise<UserInfo> {
  // ...
}
```

---

## 10. 技术选型总结

| 维度 | 选型 | 理由 |
|------|------|------|
| 开发框架 | UniApp + Vue 3 | 成熟稳定，与现有技术栈一致 |
| UI组件库 | uView Plus | 专为UniApp设计，组件丰富 |
| 状态管理 | Pinia | Vue 3官方推荐，简洁易用 |
| 网络请求 | Luch-request | 轻量级，支持拦截器 |
| 图表库 | ucharts | 性能优异，适合金融数据 |
| 构建工具 | Vite | 开发体验好，构建速度快 |
| 代码规范 | ESLint + Prettier | 统一代码风格 |

---

*本文档最后更新于：2026-02-09*
*维护者：首席架构师*
