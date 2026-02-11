# Miniprogram 环境配置指南

> 本文档说明如何配置和使用多环境系统

## 环境概述

支持三种环境配置：

| 环境 | 标识 | API 基础地址 | 用途 |
|------|------|-------------|------|
| 本地开发 | `local` | `http://localhost:3001/api` | 本地开发调试 |
| 联调环境 | `dev` | `http://192.168.110.147:3001/api` | 真机联调测试（默认） |
| 生产环境 | `prod` | `https://api.stockrace.com/api` | 正式生产环境 |

## 当前配置

**默认环境**: `dev`（联调环境）

各服务地址：
- Backend API: `http://192.168.110.147:3001/api`
- AI Service: `http://192.168.110.147:8000/api/v1`
- Data Service: `http://192.168.110.147:8001`
- WebSocket: `ws://192.168.110.147:3001`

## 切换环境

### 方式一：通过个人中心页切换（推荐）

1. 进入「我的」或「设置」页面
2. 点击「环境配置」菜单
3. 选择目标环境
4. 确认切换，小程序将自动重启

### 方式二：修改默认配置（开发者）

编辑 `src/config/env.ts`：

```typescript
// 修改默认返回值
return 'dev'  // 可选: 'local' | 'dev' | 'prod'
```

### 方式三：通过本地存储切换（调试）

在控制台执行：

```javascript
// 切换到联调环境
uni.setStorageSync('app_env', 'dev')

// 切换到本地环境
uni.setStorageSync('app_env', 'local')

// 重启小程序
uni.reLaunch({ url: '/pages/index/index' })
```

## API 使用说明

项目中所有 API 调用都已通过 `request.ts` 统一封装，会自动使用当前环境的配置。

### 在 Store 中使用

```typescript
import { aiApi } from '@/api/ai'

const result = await aiApi.getAccounts()
```

### 在页面中使用

```typescript
import { useAIStore } from '@/stores/ai'

const aiStore = useAIStore()
await aiStore.fetchAccounts()
```

### 直接获取配置（高级用法）

```typescript
import { API_BASE_URL, IS_DEV } from '@/utils/constants'

console.log('当前 API 地址:', API_BASE_URL)
console.log('是否联调环境:', IS_DEV)
```

## 验证配置

### 检查当前环境

在任意页面的 `onMounted` 中添加：

```typescript
import { getCurrentEnv, getEnvConfig } from '@/config/env'

onMounted(() => {
  const env = getCurrentEnv()
  const config = getEnvConfig()
  console.log('当前环境:', env)
  console.log('API 地址:', config.apiBaseUrl)
})
```

### 网络请求验证

1. 打开微信开发者工具
2. 进入「调试器」→「Network」
3. 触发任意 API 请求（如登录）
4. 检查请求 URL 是否为 `http://192.168.110.147:3001/api/...`

## 常见问题

### Q1: 请求失败，提示 "fail url not in domain list"

**原因**: 微信小程序需要配置服务器域名白名单

**解决方案**:
1. 开发调试：勾选「不校验合法域名」
   - 微信开发者工具 → 设置 → 项目设置 → 本地设置 → 勾选「不校验合法域名」

2. 真机调试：配置服务器域名
   - 微信公众平台 → 开发 → 开发管理 → 开发设置 → 服务器域名
   - 添加 request 合法域名：`http://192.168.110.147`

### Q2: 如何确认当前使用的是哪个环境？

**方法 1**: 查看个人中心页的「环境配置」菜单，会显示当前环境标签

**方法 2**: 查看控制台日志，启动时会输出当前环境信息

**方法 3**: 检查网络请求的 URL 前缀

### Q3: 切换环境后数据会保留吗？

- Token 等登录信息会保留（存储在本地）
- 缓存数据会保留
- 但不同环境的数据是独立的（如 local 和 dev 的账户数据不同）

### Q4: 能否在真机上切换到 local 环境？

不能。真机无法访问你本地的 localhost，只能在开发者工具中使用 local 环境。

真机请使用 `dev` 环境（192.168.110.147）。

## 后端服务健康检查

在使用前，请确保 192.168.110.147 上的服务已启动：

```bash
# 测试 Backend 服务
curl http://192.168.110.147:3001/api/health

# 测试 AI Service
curl http://192.168.110.147:8000/api/v1/health/

# 测试 Data Service
curl http://192.168.110.147:8001/health
```

## 更新记录

| 日期 | 更新内容 |
|------|---------|
| 2026-02-11 | 创建多环境配置系统，默认使用 dev 环境 |
