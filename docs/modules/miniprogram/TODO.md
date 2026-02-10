# Miniprogram 模块开发规划

## 模块概述

**模块名称**: Miniprogram (UniApp + Vue 3 + TypeScript)
**主要职责**: 微信小程序用户界面、AI账户管理、收益展示、排名榜单
**运行环境**: 微信开发者工具 / 微信客户端
**通信方式**: HTTP REST (通过 Backend API)

---

## 服务通信标准

### 1. 依赖服务

| 服务 | 调用方式 | 用途 | 失败策略 |
|------|---------|------|---------|
| Backend API | HTTPS (`https://api.stock-race.com/api/*`) | 业务API、认证 | 错误提示，重试3次 |
| 微信登录 | wx.login() | 获取code换取openid | 引导重新登录 |

### 2. 数据缓存策略

```typescript
// 本地缓存（微信storage）
uni.setStorageSync('token', jwt_token);           // 登录凭证
uni.setStorageSync('userInfo', userInfo);         // 用户信息
uni.setStorageSync('aiAccounts', accounts);       // AI账户列表（5分钟过期）

// 全局状态 (Pinia)
const useUserStore = defineStore('user', {
  state: () => ({ userInfo: null, token: null }),
  persist: true  // 持久化到storage
});
```

### 3. API调用规范

```typescript
// 统一请求封装
const request = async <T>(options: RequestOptions): Promise<T> => {
  const token = uni.getStorageSync('token');
  return new Promise((resolve, reject) => {
    uni.request({
      ...options,
      header: { 'Authorization': `Bearer ${token}` },
      success: (res) => {
        if (res.statusCode === 401) {
          // Token过期，跳转登录
          uni.navigateTo({ url: '/pages/login/index' });
        } else if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
        } else {
          reject(new Error(res.data?.message || '请求失败'));
        }
      },
      fail: reject
    });
  });
};
```

---

## 开发条目（测试驱动）

### Phase 1: 基础设施

#### [T-001] 项目脚手架与路由配置
**功能**: UniApp项目初始化，页面路由配置，tabBar设置

**测试要求**:
- [ ] `tests/unit/routes.test.ts` - 单元测试：路由配置验证
- [ ] 页面跳转测试：验证所有页面可正常跳转
- [ ] 兼容性测试：在iOS和Android模拟器运行

**验收标准**:
```typescript
// 页面结构
pages/
├── index/index.vue          # 首页 - 排行榜
├── account/index.vue        # 账户页 - AI账户管理
├── market/index.vue         # 行情页 - 股票列表
├── profile/index.vue        # 我的 - 个人中心
├── ai-account/create.vue    # 创建AI账户
└── ai-account/detail.vue    # AI账户详情
```

**依赖**: 无
**预计工时**: 1天

---

#### [T-002] HTTP请求封装与拦截器
**功能**: 统一HTTP请求封装，Token自动附加，错误统一处理

**测试要求**:
- [ ] `tests/unit/utils/request.test.ts` - 单元测试：请求封装
- [ ] `tests/unit/utils/interceptor.test.ts` - 单元测试：拦截器
- [ ] Mock测试：模拟401响应，验证跳转登录页

**验收标准**:
```typescript
// 使用示例
import { request } from '@/utils/request';

const accounts = await request({
  url: '/api/ai-accounts',
  method: 'GET'
});
// 自动附加token
// 401时自动跳转登录页
// 错误时显示toast提示
```

**依赖**: [T-001]
**预计工时**: 1.5天

---

#### [T-003] 全局状态管理（Pinia）
**功能**: Pinia Store封装，用户状态、AI账户状态管理

**测试要求**:
- [ ] `tests/unit/stores/user.test.ts` - 单元测试：User Store
- [ ] `tests/unit/stores/aiAccount.test.ts` - 单元测试：AI Account Store
- [ ] 持久化测试：刷新页面后状态保持

**验收标准**:
```typescript
// User Store
const useUserStore = defineStore('user', {
  state: () => ({
    userInfo: null as UserInfo | null,
    token: null as string | null,
    isLoggedIn: false
  }),
  actions: {
    async login(code: string) { ... },
    async logout() { ... },
    async fetchUserInfo() { ... }
  },
  persist: true
});
```

**依赖**: [T-002]
**预计工时**: 1天

---

### Phase 2: 用户认证

#### [T-004] 微信登录页面
**功能**: 微信一键登录，获取用户信息授权

**测试要求**:
- [ ] `tests/e2e/login.test.ts` - E2E测试：登录流程
- [ ] 授权测试：拒绝授权时的处理
- [ ] 重试测试：登录失败后可重试

**验收标准**:
```typescript
// 登录流程
const login = async () => {
  const { code } = await uni.login({ provider: 'weixin' });
  const { userInfo } = await uni.getUserInfo();
  await request({
    url: '/api/auth/wechat-login',
    method: 'POST',
    data: { code, userInfo }
  });
  // 保存token，跳转首页
};
```

**依赖**: [T-002], [T-003]
**预计工时**: 1.5天

---

### Phase 3: AI账户管理

#### [T-005] AI账户列表页
**功能**: 展示用户所有AI账户，卡片式布局

**测试要求**:
- [ ] `tests/unit/pages/account/index.test.ts` - 单元测试：列表渲染
- [ ] 空状态测试：无账户时显示创建引导
- [ ] 下拉刷新测试：验证数据刷新
- [ ] 性能测试：列表滚动流畅，不卡顿

**验收标准**:
```vue
<!-- 账户卡片 -->
<view class="account-card" v-for="account in accounts" :key="account.id">
  <image :src="account.avatar" class="avatar" />
  <view class="info">
    <text class="name">{{ account.name }}</text>
    <text class="strategy">{{ account.tradingStrategy }}</text>
  </view>
  <view class="returns" :class="account.totalReturn >= 0 ? 'up' : 'down'">
    <text>{{ account.totalReturn >= 0 ? '+' : '' }}{{ account.totalReturn }}%</text>
  </view>
</view>
```

**依赖**: [T-003]
**预计工时**: 2天

---

#### [T-006] AI账户创建页
**功能**: 创建AI账户，配置名称、资金、风险偏好、选择模型

**测试要求**:
- [ ] `tests/unit/pages/ai-account/create.test.ts` - 单元测试：表单验证
- [ ] 参数验证测试：资金范围、必填字段
- [ ] 提交测试：创建成功后跳转详情页

**验收标准**:
```typescript
// 表单数据
const form = reactive({
  name: '',           // 账户名称（必填）
  initialBalance: 100000,  // 初始资金（10000-1000000）
  riskTolerance: 'medium', // 风险偏好
  tradingStrategy: 'growth', // 交易策略
  modelType: 'deepseek-chat' // 模型类型
});

// 验证规则
const rules = {
  name: [{ required: true, message: '请输入账户名称' }],
  initialBalance: [
    { required: true, message: '请输入初始资金' },
    { min: 10000, max: 1000000, message: '资金范围10000-1000000' }
  ]
};
```

**依赖**: [T-005]
**预计工时**: 2天

---

#### [T-007] AI账户详情页
**功能**: 展示AI账户详情、收益曲线、持仓列表、交易记录

**测试要求**:
- [ ] `tests/unit/pages/ai-account/detail.test.ts` - 单元测试：详情渲染
- [ ] 图表测试：收益曲线使用ucharts正确渲染
- [ ] Tab切换测试：收益/持仓/交易记录切换正常
- [ ] 数字精度测试：收益率、市值显示正确

**验收标准**:
```vue
<view class="detail-page">
  <!-- 收益概览 -->
  <view class="overview">
    <text class="total-assets">{{ formatMoney(account.totalAssets) }}</text>
    <text class="total-return" :class="account.totalReturn >= 0 ? 'up' : 'down'">
      {{ account.totalReturn >= 0 ? '+' : '' }}{{ account.totalReturn }}%
    </text>
  </view>

  <!-- 收益曲线 -->
  <qiun-data-charts type="line" :chartData="chartData" />

  <!-- Tab切换 -->
  <uni-segmented-control :values="['持仓', '交易记录']" @clickItem="onClickTab" />
</view>
```

**依赖**: [T-006]
**预计工时**: 2.5天

---

### Phase 4: 排行榜与行情

#### [T-008] 收益排行榜页
**功能**: 展示所有AI账户的收益排名，日榜/周榜/月榜

**测试要求**:
- [ ] `tests/unit/pages/index/index.test.ts` - 单元测试：排行榜渲染
- [ ] Tab切换测试：日/周/月榜切换正常
- [ ] 分页测试：上拉加载更多
- [ ] 自排名测试：当前用户排名高亮显示

**验收标准**:
```vue
<view class="rank-page">
  <uni-segmented-control :values="['日榜', '周榜', '月榜']" @clickItem="switchPeriod" />

  <view class="rank-item" v-for="(item, index) in rankList" :key="item.id"
        :class="{ 'self': item.userId === currentUserId }">
    <text class="rank">{{ index + 1 }}</text>
    <image :src="item.avatar" class="avatar" />
    <text class="name">{{ item.name }}</text>
    <text class="return" :class="item.returnRate >= 0 ? 'up' : 'down'">
      {{ item.returnRate }}%
    </text>
  </view>
</view>
```

**依赖**: [T-003]
**预计工时**: 2天

---

#### [T-009] 股票行情页
**功能**: 展示股票列表，搜索，实时行情

**测试要求**:
- [ ] `tests/unit/pages/market/index.test.ts` - 单元测试：股票列表
- [ ] 搜索测试：输入股票代码/名称搜索
- [ ] 刷新测试：下拉刷新实时行情

**验收标准**:
```vue
<view class="market-page">
  <uni-search-bar @confirm="onSearch" placeholder="搜索股票代码/名称" />

  <view class="stock-item" v-for="stock in stocks" :key="stock.code">
    <text class="code">{{ stock.code }}</text>
    <text class="name">{{ stock.name }}</text>
    <text class="price">{{ stock.price }}</text>
    <text class="change" :class="stock.change >= 0 ? 'up' : 'down'">
      {{ stock.change >= 0 ? '+' : '' }}{{ stock.changePercent }}%
    </text>
  </view>
</view>
```

**依赖**: [T-002]
**预计工时**: 1.5天

---

### Phase 5: 个人中心

#### [T-010] 个人中心页
**功能**: 展示用户信息、设置、帮助

**测试要求**:
- [ ] `tests/unit/pages/profile/index.test.ts` - 单元测试：页面渲染
- [ ] 退出登录测试：清除缓存，跳转登录页

**验收标准**:
```vue
<view class="profile-page">
  <view class="user-info">
    <image :src="userInfo.avatar" class="avatar" />
    <text class="nickname">{{ userInfo.nickname }}</text>
  </view>

  <uni-list>
    <uni-list-item title="我的AI账户" @click="navigateTo('/pages/account/index')" />
    <uni-list-item title="帮助与反馈" @click="navigateTo('/pages/help/index')" />
    <uni-list-item title"退出登录" @click="logout" />
  </uni-list>
</view>
```

**依赖**: [T-003]
**预计工时**: 1天

---

## 测试脚本目录结构

```
miniprogram/tests/
├── unit/
│   ├── pages/
│   │   ├── index/                 # 首页测试
│   │   ├── account/               # 账户页测试
│   │   ├── market/                # 行情页测试
│   │   ├── profile/               # 个人中心测试
│   │   └── ai-account/            # AI账户页面测试
│   ├── components/                # 组件测试
│   ├── utils/                     # 工具函数测试
│   └── stores/                    # Pinia Store测试
├── e2e/                           # E2E测试
│   ├── login.test.ts
│   ├── ai-account.test.ts
│   └── trading.test.ts
└── utils/
    └── test-helpers.ts            # 测试辅助函数
```

---

## 开发进度留痕

| 条目 | 状态 | 开发日期 | 测试通过日期 | 合并提交 |
|------|------|----------|--------------|----------|
| [T-001] 项目脚手架 | ✅ 已完成 | 2026-01-20 | 2026-01-20 | - |
| [T-002] HTTP请求封装 | ✅ 已完成 | 2026-01-21 | 2026-01-21 | - |
| [T-003] Pinia状态管理 | ✅ 已完成 | 2026-01-22 | 2026-01-22 | - |
| [T-004] 微信登录 | ✅ 已完成 | 2026-01-23 | 2026-01-23 | - |
| [T-005] AI账户列表 | ✅ 已完成 | 2026-01-25 | 2026-01-25 | - |
| [T-006] AI账户创建 | ✅ 已完成 | 2026-01-27 | 2026-01-27 | - |
| [T-007] AI账户详情 | ✅ 已完成 | 2026-01-30 | 2026-01-30 | - |
| [T-008] 收益排行榜 | ✅ 已完成 | 2026-02-01 | 2026-02-01 | - |
| [T-009] 股票行情 | ✅ 已完成 | 2026-02-03 | 2026-02-03 | - |
| [T-010] 个人中心 | ✅ 已完成 | 2026-02-05 | 2026-02-05 | - |

### Phase 6: 游客模式改造（新增）

#### [T-011] 游客模式功能设计与实现
**功能**: 改造小程序支持游客模式，无需登录即可访问公开数据，主动点击登录时才触发微信授权

**开发日期**: 2026-02-10

---

#### 需求分析

**现状问题**:
- 当前首页（`pages/index/index.vue`）在 `onMounted` 中强制检查登录状态
- 未登录用户会被立即重定向到登录页，体验不佳
- 用户无法先了解产品功能再决定是否登录

**改造目标**:
1. ✅ 游客可直接进入小程序首页，无需登录
2. ✅ 游客可访问公开数据：排行榜、市场行情
3. ✅ 涉及敏感操作（创建AI经理、查看持仓）时才提示登录
4. ✅ 用户主动点击登录按钮时才触发微信授权
5. ✅ 登录页支持微信一键登录和演示账户两种方式

---

#### 功能描述

**1. 游客状态管理** (`src/stores/auth.ts` 增强)

```typescript
// 新增游客模式状态
const isGuestMode = computed(() => !token.value || token.value === 'GUEST_TOKEN')

// 新增方法：启用游客模式
function enableGuestMode() {
  token.value = 'GUEST_TOKEN'
  userInfo.value = {
    id: 'guest',
    username: '游客',
    nickname: '游客用户',
    avatar: '/static/guest-avatar.png',
  }
}

// 新增方法：检查是否需要登录
function requireAuth(redirectUrl?: string): boolean {
  if (isGuestMode.value) {
    uni.navigateTo({ url: `/pages/login/login?redirect=${encodeURIComponent(redirectUrl || '')}` })
    return false
  }
  return true
}
```

**2. 首页改造** (`src/pages/index/index.vue`)

- **移除**: `onMounted` 中的强制登录检查
- **新增**: 游客模式UI标识（页面顶部显示"游客模式"标签）
- **新增**: 游客模式下隐藏敏感操作按钮（"立即聘任"改为"登录后聘任"）
- **新增**: 点击敏感区域时弹出登录引导

```typescript
// onMounted 改造
onMounted(() => {
  // 不再强制跳转登录页
  // if (!authStore.isLoggedIn) { uni.redirectTo({ url: '/pages/login/login' }) }

  // 如果没有token，自动启用游客模式
  if (!authStore.token) {
    authStore.enableGuestMode()
  }

  // 加载公开数据（游客和登录用户均可访问）
  loadPublicData()
})

// 加载公开数据
async function loadPublicData() {
  // 排行榜数据（公开）
  await aiStore.fetchAccounts()
  // 行情数据（公开）
  await marketStore.fetchQuotes()
}

// 敏感操作检查
function goToCreateManager() {
  if (!authStore.requireAuth('/pages/ai-managers/create')) return
  uni.navigateTo({ url: '/pages/ai-managers/create' })
}
```

**3. 登录页改造** (`src/pages/login/login.vue`)

- **新增**: 微信一键登录按钮（大号按钮，醒目位置）
- **保留**: 演示账户快速登录（用于测试）
- **新增**: 返回游客模式入口（让用户可以返回游客浏览）
- **新增**: 登录成功后跳转回原页面

```vue
<template>
  <!-- 新增微信登录区域 -->
  <view class="wechat-login-section">
    <button class="wechat-login-btn" @click="handleWechatLogin">
      <text class="wechat-icon">微信</text>
      <text>微信一键登录</text>
    </button>
    <text class="hint-text">登录后可使用完整功能</text>
  </view>

  <!-- 演示账户区域（折叠） -->
  <view class="demo-section">
    <text class="section-toggle" @click="showDemo = !showDemo">开发者演示账户</text>
    <view v-if="showDemo">
      <!-- 原有的用户名密码表单 -->
    </view>
  </view>

  <!-- 返回游客模式 -->
  <view class="guest-option">
    <text class="link" @click="backToGuestMode">暂不登录，继续浏览</text>
  </view>
</template>
```

**4. 微信登录实现** (`src/api/auth.ts` 新增)

```typescript
// 新增微信登录API
wechatLogin(data: { code: string; userInfo?: any }): Promise<LoginResponse> {
  return request.post<LoginResponse>('/auth/wechat-login', data)
},
```

**5. 页面权限控制**（各敏感页面）

需要添加登录检查的页面：
- `pages/ai-managers/create.vue` - 创建AI经理
- `pages/portfolio/holdings.vue` - 持仓明细
- `pages/portfolio/overview.vue` - 持仓总览（可改为显示示例数据）
- `pages/trades/list.vue` - 交易记录
- `pages/settings/profile.vue` - 个人设置（显示游客简化版）

---

#### API需求（委托Backend服务开发）

**委托服务**: `backend` (Node.js/Express)

**开发优先级**: P0（阻塞小程序游客模式上线）

---

**新增API**:

| 接口 | 方法 | 路径 | 说明 | 认证 | 开发状态 |
|------|------|------|------|------|----------|
| 微信登录 | POST | `/api/auth/wechat-login` | 微信code换token | 否 | 🔲 待Backend开发 |
| 获取排行榜 | GET | `/api/ranking/:period` | 日/周/月榜 | 否（公开） | 🔲 待Backend开发 |
| 获取行情 | GET | `/api/market/quotes` | 股票行情列表 | 否（公开） | 🔲 待Backend开发 |
| 搜索股票 | GET | `/api/market/search` | 股票搜索 | 否（公开） | 🔲 待Backend开发 |

**现有API改造**:

| 接口 | 原认证 | 新认证 | 游客访问响应 | 开发状态 |
|------|--------|--------|--------------|----------|
| 获取AI账户列表 | 需登录 | 需登录 | 401 + "请先登录" | 🔲 待Backend改造 |
| 获取持仓 | 需登录 | 需登录 | 401 + "请先登录" | 🔲 待Backend改造 |
| 获取交易记录 | 需登录 | 需登录 | 401 + "请先登录" | 🔲 待Backend改造 |

---

**API详细规格**:

**1. 微信登录接口** (`POST /api/auth/wechat-login`)

**请求参数**:
```typescript
{
  code: string;        // 微信登录凭证，必填
  userInfo?: {         // 用户信息（可选）
    nickName?: string;
    avatarUrl?: string;
    gender?: number;
    city?: string;
    province?: string;
    country?: string;
  }
}
```

**响应数据**:
```typescript
{
  code: 200;
  data: {
    token: string;     // JWT token
    user: {
      id: string;
      username: string;
      nickname: string;
      avatar?: string;
    }
  }
}
```

**实现说明**:
- Backend需调用微信服务端API：`https://api.weixin.qq.com/sns/jscode2session`
- 使用AppID和AppSecret换取openid和session_key
- 根据openid查询或创建用户
- 生成JWT token返回给小程序

**微信接口调用**:
```
GET https://api.weixin.qq.com/sns/jscode2session
  ?appid=wx7517e3f6b6cb4c99
  &secret={APP_SECRET}
  &js_code={CODE}
  &grant_type=authorization_code
```

**2. 获取排行榜接口** (`GET /api/ranking/:period`)

**路径参数**:
- `period`: `daily` | `weekly` | `monthly`

**查询参数**:
- `page`: number (默认1)
- `pageSize`: number (默认20)

**响应数据**:
```typescript
{
  code: 200;
  data: {
    list: [
      {
        id: string;
        name: string;
        returnRate: number;  // 收益率
        userId: string;
        avatar?: string;
        rank: number;
      }
    ];
    total: number;
    page: number;
    pageSize: number;
  }
}
```

**访问控制**: 公开接口，无需认证

**3. 获取行情接口** (`GET /api/market/quotes`)

**查询参数**:
- `page`: number (默认1)
- `pageSize`: number (默认50)

**响应数据**:
```typescript
{
  code: 200;
  data: {
    list: [
      {
        code: string;        // 股票代码
        name: string;        // 股票名称
        price: number;       // 当前价格
        change: number;      // 涨跌额
        changePercent: number; // 涨跌幅
        volume: number;      // 成交量
        marketCap: number;   // 市值
      }
    ];
    total: number;
    updateTime: string;     // 数据更新时间
  }
}
```

**访问控制**: 公开接口，无需认证

**4. 搜索股票接口** (`GET /api/market/search`)

**查询参数**:
- `keyword`: string (股票代码或名称)
- `limit`: number (默认10)

**响应数据**:
```typescript
{
  code: 200;
  data: {
    list: [
      {
        code: string;
        name: string;
        price: number;
        changePercent: number;
      }
    ]
  }
}
```

**访问控制**: 公开接口，无需认证

---

**API改造详细规格**:

**需要添加游客拦截的API**:

1. `GET /api/ai-accounts` - 获取AI账户列表
2. `GET /api/portfolio/holdings` - 获取持仓
3. `GET /api/trades` - 获取交易记录
4. `GET /api/user/profile` - 获取用户详情

**拦截逻辑**:
```javascript
// middleware/auth.js
const checkGuest = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token || token === 'GUEST_TOKEN') {
    return res.status(401).json({
      code: 401,
      message: '请先登录',
      data: null
    });
  }

  next();
};
```

---

**委托开发交付物**:

1. Backend服务代码更新
2. API接口文档更新
3. 微信登录配置说明（AppID/AppSecret配置位置）
4. 单元测试用例

**联系方式**:
- 委托服务: `backend`
- 接口人: Backend开发团队
- 阻塞问题: 小程序游客模式功能依赖此API开发完成

---

#### 测试脚本

**测试文件**: `miniprogram/tests/e2e/guest-mode.test.ts`

**测试文档**: 详见同目录 [TEST_SCRIPTS.md](./TEST_SCRIPTS.md)

**测试覆盖**:
- TC-GUEST-001: 游客访问首页
- TC-GUEST-002: 游客访问排行榜
- TC-GUEST-003: 游客访问行情页
- TC-GUEST-004: 游客访问受限功能
- TC-GUEST-005: 用户主动登录流程
- TC-GUEST-006: 游客模式状态管理
- TC-GUEST-007: API权限控制测试

---

#### 开发进度

| 条目 | 状态 | 开发日期 | 测试通过日期 | 合并提交 |
|------|------|----------|--------------|----------|
| [T-011] 游客模式改造 | ✅ 已完成 | 2026-02-10 | 2026-02-10 | - |

**子任务清单**:
- [x] 1. 增强 auth.ts - 添加游客模式状态和 requireAuth 方法
- [x] 2. 改造 index.vue - 移除强制登录，添加游客UI
- [x] 3. 改造 login.vue - 添加微信登录按钮和返回游客入口
- [x] 4. 添加微信登录API - auth.ts 新增 wechatLogin
- [x] 5. 受限页面检查 - 添加 requireAuth 调用（index.vue中goToCreateManager）
- [x] 6. 构建打包验证通过

---

## 提交规范

1. **分支命名**: `miniprogram/T-XXX-简短描述`（如 `miniprogram/T-001-scaffold`）
2. **提交信息**: `test(miniprogram): [T-001] 添加项目脚手架测试`
3. **PR要求**: 核心页面必须包含测试
4. **合并前检查**:
   ```bash
   npm run test:unit
   npm run build:h5
   npm run build:mp-weixin
   ```

---

## UI设计规范

- **主题色**: #1E3A5F（深海蓝）
- **上涨色**: #FF4D4F（红）
- **下跌色**: #52C41A（绿）
- **字体**: 苹方/PingFang SC
- **风格**: 西式复古精英风格

---

*最后更新: 2026-02-10*
*负责人: Miniprogram开发团队*
*状态: 前端完成，等待Backend服务提供API*

---

## 文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 开发规划 | `./TODO.md` | 本文件，开发规划与进度追踪 |
| 测试脚本文档 | `./TEST_SCRIPTS.md` | 测试脚本功能说明与位置索引 |
| 测试脚本源码 | `../../../miniprogram/tests/e2e/guest-mode.test.ts` | 游客模式E2E测试代码 |
