# 微信开发者工具调试指南

> 本文档指导如何在微信开发者工具中调试小程序

## 🎯 推荐开发方式

**热重载开发模式（推荐）** ✅

日常开发、调试、实时查看修改效果，请使用热重载模式：

```bash
cd miniprogram
npm run dev:mp-weixin
```

然后在微信开发者工具中导入 `dist/dev/mp-weixin/` 目录，并勾选「启用文件监听」。

详细步骤请参考「方式一：热重载开发模式」章节。

---

## 打包状态

✅ **打包完成**

- **开发输出目录**: `miniprogram/dist/dev/mp-weixin/`（热重载模式）
- **生产输出目录**: `miniprogram/dist/build/mp-weixin/`（生产构建）
- **构建时间**: 2026-02-13
- **环境配置**: dev（联调环境，API 指向 192.168.110.147）

## 快速开始

### 方式一：热重载开发模式（推荐）✅

**适用场景**：日常开发、调试、实时查看修改效果

#### 步骤 1：启动开发服务器

在 Trae 终端中执行：

```bash
cd miniprogram
npm run dev:mp-weixin
```

**启动标志**：
```
DONE  Build complete. Watching for changes...
ready in 7263ms.
```

#### 步骤 2：复制静态资源

首次启动时，需要复制静态资源：

```bash
cd miniprogram
xcopy static dist\dev\mp-weixin\static /E /I /Y
```

#### 步骤 3：导入项目到微信开发者工具

1. 打开微信开发者工具
2. 点击「+」或「导入项目」
3. **项目目录**: 选择 `miniprogram/dist/dev/mp-weixin/`（注意是 `dev` 目录）
4. **AppID**: 选择「测试号」（或使用你自己的小程序 AppID）
5. **项目名称**: Stock-Race AI股票竞赛
6. 点击「确定」

#### 步骤 4：启用自动刷新

在微信开发者工具中：

```
设置 → 项目设置 → 本地设置
☑️ 勾选「启用文件监听」
```

#### 步骤 5：开始开发

现在你可以：
1. **在 Trae 中修改代码**（任何 `.vue`、`.ts`、`.scss` 文件）
2. **保存文件**（按 `Ctrl+S`）
3. **自动编译**：终端会显示编译日志
4. **自动刷新**：微信开发者工具会自动刷新显示最新代码

**热重载工作流程**：
```
修改代码 → 保存文件 → 自动编译 → 自动刷新 → 查看效果
```

### 方式二：生产构建模式

**适用场景**：发布上线、性能测试、最终验证

#### 步骤 1：执行生产构建

```bash
cd miniprogram
npm run build:mp-weixin
```

#### 步骤 2：导入项目到微信开发者工具

1. 打开微信开发者工具
2. 点击「+」或「导入项目」
3. **项目目录**: 选择 `miniprogram/dist/build/mp-weixin/`（注意是 `build` 目录）
4. **AppID**: 选择「测试号」
5. **项目名称**: Stock-Race AI股票竞赛
6. 点击「确定」

### 开发命令对比

| 命令 | 模式 | 输出目录 | 用途 |
|------|------|---------|------|
| `npm run dev:mp-weixin` | 开发（热重载） | `dist/dev/mp-weixin/` | 日常开发、调试 |
| `npm run build:mp-weixin` | 生产构建 | `dist/build/mp-weixin/` | 发布上线、性能测试 |
| `npm run build:mp-weixin:clean` | 清理后构建 | `dist/build/mp-weixin/` | 清理缓存后重新构建 |

### 3. 关键配置检查

导入后，检查以下设置：

#### 3.1 关闭域名校验（开发调试必需）

```
微信开发者工具 → 设置 → 项目设置 → 本地设置
☑️ 勾选「不校验合法域名、web-view（业务域名）、TLS版本以及HTTPS证书」
```

#### 3.2 启用文件监听（热重载必需）

```
微信开发者工具 → 设置 → 项目设置 → 本地设置
☑️ 勾选「启用文件监听」
```

**重要**：使用热重载模式时，必须勾选此项才能自动刷新。

#### 3.3 启用调试模式

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

### 源代码结构

```
miniprogram/
├── src/                   # 源代码目录
│   ├── pages/            # 页面文件
│   │   ├── index/        # 首页
│   │   ├── login/        # 登录页
│   │   ├── ai-managers/  # AI经理相关
│   │   ├── market/       # 行情相关
│   │   ├── portfolio/    # 持仓相关
│   │   ├── trades/       # 交易记录
│   │   ├── competition/  # 排行榜
│   │   └── settings/     # 设置相关
│   ├── components/       # 组件
│   ├── stores/           # Pinia 状态管理
│   ├── api/              # API 封装
│   ├── utils/            # 工具函数
│   ├── config/           # 配置文件
│   ├── App.vue           # 根组件
│   └── main.ts           # 入口文件
├── static/               # 静态资源
│   └── icons/            # 图标文件
├── manifest.json         # 小程序配置（根目录）
├── pages.json            # 页面配置（根目录）
├── uni.config.js         # uni-app 配置
├── vite.config.ts        # Vite 配置
└── package.json          # 项目依赖
```

### 开发输出结构（热重载）

```
miniprogram/dist/dev/mp-weixin/
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
├── utils/                # 工具函数
└── static/               # 静态资源
    └── icons/            # 图标文件
```

### 生产输出结构（构建）

```
miniprogram/dist/build/mp-weixin/
├── app.js                 # 小程序入口（压缩）
├── app.json               # 全局配置
├── app.wxss               # 全局样式（压缩）
├── pages/                 # 页面文件（压缩）
│   ├── index/            # 首页
│   ├── login/            # 登录页
│   ├── ai-managers/      # AI经理相关
│   ├── market/           # 行情相关
│   ├── portfolio/        # 持仓相关
│   ├── trades/           # 交易记录
│   ├── competition/      # 排行榜
│   └── settings/         # 设置相关
├── components/           # 组件（压缩）
├── stores/               # Pinia 状态管理（压缩）
├── api/                  # API 封装（压缩）
├── utils/                # 工具函数（压缩）
└── static/               # 静态资源
    └── icons/            # 图标文件
```

### 目录说明

| 目录 | 说明 | 用途 |
|------|------|------|
| `src/` | 源代码目录 | 开发时修改的代码 |
| `dist/dev/mp-weixin/` | 开发输出目录 | 热重载模式，未压缩 |
| `dist/build/mp-weixin/` | 生产输出目录 | 生产构建，已压缩 |
| `static/` | 静态资源 | 图片、图标等静态文件 |

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

## 热重载开发详细说明

### 开发服务器特性

使用 `npm run dev:mp-weixin` 启动的开发服务器具有以下特性：

1. **文件监听**：自动检测 `src/` 目录下的文件变化
2. **自动编译**：文件变化后自动重新编译
3. **实时输出**：终端实时显示编译状态
4. **快速响应**：通常在 1-2 秒内完成编译

### 热重载工作流程

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  修改代码    │ →  │  保存文件    │ →  │  自动编译    │ →  │  自动刷新    │
│ (Trae IDE)  │    │ (Ctrl+S)    │    │ (uni-app)   │    │ (微信开发者工具) │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### 支持热重载的文件类型

- ✅ `.vue` 文件（组件和页面）
- ✅ `.ts` 文件（TypeScript 代码）
- ✅ `.scss` 文件（样式文件）
- ✅ `.json` 文件（配置文件）

### 终端输出示例

正常编译：
```
Build complete. Watching for changes...
ready in 7263ms.
```

文件变化时：
```
[文件路径] changed
Build complete. Watching for changes...
```

编译错误时：
```
[错误信息]
Build failed. Watching for changes...
```

### 常见问题

#### Q1: 修改代码后没有自动刷新

**解决方案**：
1. 检查微信开发者工具是否勾选了「启用文件监听」
2. 检查开发服务器是否正在运行
3. 检查终端是否有编译错误
4. 尝试手动刷新微信开发者工具（按 `F5`）

#### Q2: 静态资源修改后没有更新

**解决方案**：
```bash
# 手动复制静态资源
cd miniprogram
xcopy static dist\dev\mp-weixin\static /E /I /Y
```

#### Q3: 编译速度很慢

**解决方案**：
1. 检查是否有大量文件同时变化
2. 检查磁盘性能
3. 关闭不必要的文件监听目录
4. 重启开发服务器

#### Q4: 终端显示编译错误

**解决方案**：
1. 查看详细的错误信息
2. 修复代码错误
3. 保存文件后自动重新编译
4. 如果错误持续，重启开发服务器

### 性能优化建议

1. **减少监听文件**：在 `vite.config.ts` 中配置 `ignored` 选项
2. **增加监听间隔**：调整 `server.watch.interval` 参数
3. **使用 SSD**：将项目放在 SSD 硬盘上
4. **关闭不必要的应用**：关闭占用系统资源的应用

### 开发最佳实践

1. **定期保存**：养成频繁保存的习惯，避免大量修改一次性提交
2. **小步迭代**：每次修改少量代码，便于定位问题
3. **查看编译日志**：及时查看终端输出，发现编译错误
4. **测试验证**：每次修改后立即测试，确保功能正常
5. **版本控制**：定期提交代码，避免丢失工作成果

### 配置文件同步

项目中存在两套配置文件，需要保持同步：

| 配置文件 | 位置 | 用途 |
|---------|------|------|
| `manifest.json` | `src/manifest.json` | 源文件（开发时修改） |
| `manifest.json` | `miniprogram/manifest.json` | 构建时使用（需同步） |
| `pages.json` | `src/pages.json` | 源文件（开发时修改） |
| `pages.json` | `miniprogram/pages.json` | 构建时使用（需同步） |
| `App.vue` | `src/App.vue` | 源文件（开发时修改） |
| `App.vue` | `miniprogram/App.vue` | 构建时使用（需同步） |
| `main.ts` | `src/main.ts` | 源文件（开发时修改） |
| `main.ts` | `miniprogram/main.ts` | 构建时使用（需同步） |

**重要提示**：
- 修改 `src/` 目录下的配置文件后，需要手动同步到 `miniprogram/` 根目录
- 如果不同步，构建时可能使用旧的配置
- 建议在修改配置文件后立即同步

**同步命令**：
```bash
# 同步 manifest.json
copy src\manifest.json manifest.json /Y

# 同步 pages.json
copy src\pages.json pages.json /Y

# 同步 App.vue
copy src\App.vue App.vue /Y

# 同步 main.ts
copy src\main.ts main.ts /Y
```

## 下一步

### 热重载开发流程

1. ✅ 启动开发服务器：`npm run dev:mp-weixin`
2. ✅ 复制静态资源：`xcopy static dist\dev\mp-weixin\static /E /I /Y`
3. ✅ 在微信开发者工具中导入 `dist/dev/mp-weixin/` 目录
4. ✅ 勾选「不校验合法域名」
5. ✅ 勾选「启用文件监听」
6. ⏭️ 开始开发：修改代码 → 保存 → 自动编译 → 自动刷新
7. ⏭️ 测试功能：验证修改后的效果
8. ⏭️ 循环开发：重复步骤 6-7

### 生产构建流程

1. ✅ 执行生产构建：`npm run build:mp-weixin`
2. ✅ 在微信开发者工具中导入 `dist/build/mp-weixin/` 目录
3. ✅ 测试生产版本性能
4. ⏭️ 提交审核或发布

### 快速参考

| 任务 | 命令 |
|------|------|
| 启动热重载 | `npm run dev:mp-weixin` |
| 生产构建 | `npm run build:mp-weixin` |
| 清理后构建 | `npm run build:mp-weixin:clean` |
| 复制静态资源 | `xcopy static dist\dev\mp-weixin\static /E /I /Y` |
| 类型检查 | `npm run type-check` |
| 代码检查 | `npm run lint` |
| 代码格式化 | `npm run format` |

### 常用快捷键

| 操作 | 快捷键 |
|------|--------|
| 保存文件 | `Ctrl + S` |
| 刷新微信开发者工具 | `F5` |
| 打开调试器 | `Ctrl + Shift + I` |
| 清除缓存 | 在控制台执行 `uni.clearStorageSync()` |