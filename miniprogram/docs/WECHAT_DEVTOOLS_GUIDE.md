# 微信开发者工具调试指南

> 本文档指导如何在微信开发者工具中调试小程序

## 打包状态

✅ **打包完成**

- **输出目录**: `miniprogram/dist/build/mp-weixin/`
- **构建时间**: 2026-02-11
- **环境配置**: dev（联调环境，API 指向 192.168.110.147）

## 快速开始

### 1. 打开微信开发者工具

下载地址: https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html

### 2. 导入项目

1. 点击「+」或「导入项目」
2. **项目目录**: 选择 `miniprogram/dist/build/mp-weixin/`
3. **AppID**: 选择「测试号」（或使用你自己的小程序 AppID）
4. **项目名称**: Stock-Race AI股票竞赛
5. 点击「确定」

### 3. 关键配置检查

导入后，检查以下设置：

#### 3.1 关闭域名校验（开发调试必需）

```
微信开发者工具 → 设置 → 项目设置 → 本地设置
☑️ 勾选「不校验合法域名、web-view（业务域名）、TLS版本以及HTTPS证书」
```

#### 3.2 启用调试模式

```
点击工具栏上的「调试器」按钮，打开控制台
```

### 4. 验证环境配置

打开控制台（Console），查看启动日志：

```
当前环境: dev
API 地址: http://192.168.110.147:3001/api
```

如果显示以上信息，说明环境配置正确。

### 5. 测试 API 连接

在首页或登录页触发网络请求，检查 Network 面板：

1. 打开「调试器」→「Network」
2. 触发登录或获取数据
3. 检查请求 URL 是否为 `http://192.168.110.147:3001/api/...`

## 常见问题

### Q1: 提示 "url not in domain list"

**解决方案**:
- 确保已勾选「不校验合法域名」（见 3.1）
- 重启微信开发者工具

### Q2: 网络请求超时

**检查步骤**:
1. 确认 192.168.110.147 上的服务已启动
2. 在电脑上测试能否 ping 通 192.168.110.147
3. 在浏览器访问 http://192.168.110.147:3001/api/health

### Q3: 如何切换回本地环境？

**方法 1**: 在小程序内切换
- 进入「设置」页面 → 「环境配置」→ 选择「本地开发」

**方法 2**: 修改代码后重新打包
```typescript
// miniprogram/src/config/env.ts
return 'local'  // 修改默认值
```

### Q4: 需要配置服务器域名吗？

**开发阶段**: 不需要，勾选「不校验合法域名」即可

**真机调试/上线**: 需要，在微信公众平台配置：
- request 合法域名: `http://192.168.110.147`
- socket 合法域名: `ws://192.168.110.147`

## 项目结构

```
miniprogram/dist/build/mp-weixin/
├── app.js                 # 小程序入口
├── app.json               # 全局配置
├── app.wxss               # 全局样式
├── pages/                 # 页面文件
│   ├── index/            # 首页
│   ├── login/            # 登录页
│   ├── ai-managers/      # AI经理相关
│   ├── market/           # 行情相关
│   ├── portfolio/        # 持仓相关
│   ├── trades/           # 交易记录
│   ├── competition/      # 排行榜
│   └── settings/         # 设置相关
├── components/           # 组件
├── stores/               # Pinia 状态管理
├── api/                  # API 封装
└── utils/                # 工具函数
```

## 调试技巧

### 查看当前环境

在控制台执行：
```javascript
// 查看当前环境
uni.getStorageSync('app_env')

// 切换到本地环境
uni.setStorageSync('app_env', 'local')
uni.reLaunch({ url: '/pages/index/index' })

// 切换到联调环境
uni.setStorageSync('app_env', 'dev')
uni.reLaunch({ url: '/pages/index/index' })
```

### 清除缓存

```javascript
uni.clearStorageSync()
```

### 模拟登录状态

```javascript
// 设置演示 token
uni.setStorageSync('token', 'demo_token_for_testing_only')
```

## 热更新开发

如需修改代码并实时查看效果：

```bash
cd miniprogram
npm run dev:mp-weixin
```

这将启动热更新模式，修改代码后自动重新编译。

在微信开发者工具中：
1. 点击「工具」→「构建 npm」
2. 等待编译完成

## 下一步

1. ✅ 在微信开发者工具中导入项目
2. ✅ 勾选「不校验合法域名」
3. ✅ 验证 API 连接（查看 Network 面板）
4. ⏭️ 测试登录功能
5. ⏭️ 测试 AI 经理列表/详情功能
