# 微信小程序 MCP 自动化测试指南

> 本文档面向微信小程序开发团队，提供 weixin-devtools-mcp 服务的完整使用指南。
> 适用于：功能开发、自动化测试、图表验证、UI 回归测试。
>
> 最后更新：2026-02-25

---

## 📋 目录

1. [MCP 服务概述](#一-mcp-服务概述)
2. [环境准备](#二-环境准备)
3. [可用工具清单](#三-可用工具清单)
4. [快速开始](#四-快速开始)
5. [图表测试专项指南](#五-图表测试专项指南)
6. [常见测试场景示例](#六-常见测试场景示例)
7. [最佳实践](#七-最佳实践)
8. [故障排除](#八-故障排除)

---

## 一、MCP 服务概述

### 1.1 什么是 MCP

MCP（Model Context Protocol）是 Claude Code 与外部工具通信的标准协议。通过 MCP，Claude 可以直接控制微信开发者工具，实现小程序的自动化测试。

### 1.2 weixin-devtools-mcp 功能

- **31 个专业工具** - 覆盖连接、查询、交互、断言、截图、网络监控
- **智能连接** - 支持 auto/launch/connect 三种模式
- **自动网络监控** - 实时拦截 wx.request/uploadFile/downloadFile
- **完整断言体系** - 支持文本、属性、状态校验
- **丰富调试能力** - 页面截图、Console 监听、网络请求追踪

### 1.3 适用场景

| 场景 | 说明 |
|------|------|
| 图表功能测试 | 验证 uCharts 渲染、数据更新、交互响应 |
| UI 回归测试 | 页面布局、样式、响应式验证 |
| 功能流程测试 | 登录、创建 AI 账户、交易流程等 |
| 网络请求监控 | API 对接验证、请求参数检查 |
| 真机预览测试 | 截图对比、性能监控 |

---

## 二、环境准备

### 2.1 前置条件

1. **微信开发者工具** 已安装
2. **项目路径**: `C:\dev\projects\stock-race\miniprogram`
3. **MCP 配置** 已生效（由架构团队配置）

### 2.2 配置文件位置

```
.claude/mcp.json
```

**当前配置**（已启用 full profile，31 个工具）：
```json
{
  "mcpServers": {
    "weixin-devtools": {
      "command": "node",
      "args": [
        "/c/dev/projects/weixin-devtools-mcp/build/server.js",
        "--tools-profile=full"
      ],
      "env": {
        "WEIXIN_MCP_TOOLS_PROFILE": "full"
      }
    }
  }
}
```

### 2.3 重启 Claude Code

配置修改后，**必须重启 Claude Code 扩展**：
- VSCode 命令面板: `Claude Code: Reload Extension`
- 或重启 VSCode

---

## 三、可用工具清单

### 3.1 完整工具列表（31个）

#### 连接与页面管理
| 工具名 | 功能 | 常用度 |
|--------|------|--------|
| `connect_devtools` | 连接微信开发者工具 | ⭐⭐⭐ |
| `reconnect_devtools` | 重新连接 | ⭐⭐ |
| `disconnect_devtools` | 断开连接 | ⭐⭐ |
| `get_connection_status` | 获取连接状态 | ⭐⭐⭐ |
| `get_current_page` | 获取当前页面路径 | ⭐⭐⭐ |
| `get_page_snapshot` | 获取页面完整结构 | ⭐⭐⭐ |
| `navigate_to` | 跳转到指定页面 | ⭐⭐⭐ |
| `navigate_back` | 返回上一页 | ⭐⭐ |
| `switch_tab` | 切换 tabBar | ⭐⭐⭐ |
| `relaunch` | 重启小程序 | ⭐⭐ |

#### 元素查询与交互
| 工具名 | 功能 | 常用度 |
|--------|------|--------|
| `query_selector` | 查找元素（CSS选择器） | ⭐⭐⭐ |
| `click` | 点击元素 | ⭐⭐⭐ |
| `input_text` | 输入文本 | ⭐⭐⭐ |
| `get_value` | 获取表单值 | ⭐⭐⭐ |
| `set_form_control` | 设置表单控件值 | ⭐⭐ |
| `evaluate_script` | 执行 JavaScript | ⭐⭐ |
| `wait_for` | 等待元素出现 | ⭐⭐⭐ |

#### 断言验证
| 工具名 | 功能 | 常用度 |
|--------|------|--------|
| `assert_text` | 验证文本内容 | ⭐⭐⭐ |
| `assert_attribute` | 验证元素属性 | ⭐⭐⭐ |
| `assert_state` | 验证元素状态（visible/enabled等） | ⭐⭐⭐ |

#### 调试与截图（图表测试关键）
| 工具名 | 功能 | 常用度 |
|--------|------|--------|
| `screenshot` | **页面截图** | ⭐⭐⭐ |
| `list_console_messages` | 获取 Console 日志 | ⭐⭐⭐ |
| `get_console_message` | 获取单条 Console 消息 | ⭐⭐ |
| `list_network_requests` | 获取网络请求列表 | ⭐⭐⭐ |
| `get_network_request` | 获取单个请求详情 | ⭐⭐ |
| `clear_network_requests` | 清空请求记录 | ⭐⭐ |

#### 诊断工具
| 工具名 | 功能 | 常用度 |
|--------|------|--------|
| `diagnose_connection` | 连接诊断 | ⭐⭐ |
| `check_environment` | 环境检查 | ⭐⭐ |
| `debug_page_elements` | 调试页面元素 | ⭐⭐ |
| `debug_connection_flow` | 调试连接流程 | ⭐⭐ |

---

## 四、快速开始

### 4.1 第一个测试：验证首页加载

```typescript
// 1. 连接微信开发者工具
connect_devtools({
  projectPath: "C:\\dev\\projects\\stock-race\\miniprogram",
  strategy: "auto",
  verbose: true
})

// 2. 等待首页加载完成
wait_for({
  selector: ".immersive-dashboard",
  timeout: 10000
})

// 3. 截图保存
screenshot({
  path: "C:\\dev\\projects\\stock-race\\test-output\\home-loaded.png"
})

// 4. 验证关键元素存在
assert_state({
  selector: ".treasury-card",
  visible: true
})
```

### 4.2 连接参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `projectPath` | string | 小程序项目根目录（绝对路径） |
| `strategy` | string | 连接策略：auto/launch/connect |
| `verbose` | boolean | 是否输出详细日志 |

**连接策略说明**：
- `auto`（推荐）- 自动检测，优先连接已有实例
- `launch` - 强制启动新的开发者工具
- `connect` - 只连接已有实例，失败则报错

---

## 五、图表测试专项指南

> 本章节针对 UC-V2 任务群的图表组件测试需求

### 5.1 图表测试通用流程

```typescript
/**
 * 图表组件测试标准流程
 * 适用于：HoldingPieChart、LineChart、KLineChart、ProfitCurveChart
 */

// ========== 步骤 1: 前置准备 ==========
// 连接开发者工具
connect_devtools({
  projectPath: "C:\\dev\\projects\\stock-race\\miniprogram",
  strategy: "auto"
})

// 导航到包含图表的页面
navigate_to({
  url: "/pages/ai-managers/detail?id=1"
})

// 等待页面加载
wait_for({
  selector: ".chart-container",
  timeout: 5000
})

// ========== 步骤 2: 验证图表渲染 ==========
// 截图记录初始状态
screenshot({
  path: "C:\\dev\\projects\\stock-race\\test-output\\chart-initial.png"
})

// 验证 canvas 存在
assert_state({
  selector: "canvas",
  visible: true
})

// ========== 步骤 3: 验证图表数据 ==========
// 获取图表容器信息
evaluate_script({
  script: `
    const chartCanvas = document.querySelector('canvas');
    return {
      width: chartCanvas?.width,
      height: chartCanvas?.height,
      hasContext: !!chartCanvas?.getContext('2d')
    };
  `
})

// ========== 步骤 4: 交互测试（如适用） ==========
// 点击图表元素
try {
  query_selector({ selector: ".chart-container" })
  click({ uid: ".chart-container" })

  // 等待 Tooltip 显示
  wait_for({
    selector: ".chart-tooltip",
    timeout: 1000
  })

  // 截图记录交互状态
  screenshot({
    path: "C:\\dev\\projects\\stock-race\\test-output\\chart-interaction.png"
  })
} catch (e) {
  console.log("图表可能不支持点击交互")
}

// ========== 步骤 5: 数据更新测试 ==========
// 触发数据更新（如切换时间周期）
query_selector({ selector: ".period-tab.week" })
click({ uid: ".period-tab.week" })

// 等待数据刷新
wait_for({ timeout: 2000 })

// 截图记录更新后状态
screenshot({
  path: "C:\\dev\\projects\\stock-race\\test-output\\chart-updated.png"
})

// ========== 步骤 6: 清理 ==========
disconnect_devtools()
```

### 5.2 HoldingPieChart 专项测试

```typescript
/**
 * 持仓分布饼图测试
 * 组件路径: components/charts/HoldingPieChart.vue
 */

// 测试目标: 验证饼图正确显示持仓分布
async function testHoldingPieChart() {
  // 1. 进入 AI 经理详情页
  connect_devtools({
    projectPath: "C:\\dev\\projects\\stock-race\\miniprogram"
  })

  navigate_to({ url: "/pages/ai-managers/detail?id=1" })

  // 2. 等待饼图加载
  wait_for({
    selector: ".holding-pie-chart",
    timeout: 5000
  })

  // 3. 验证标题
  assert_text({
    selector: ".chart-title",
    text: "持仓分布"
  })

  // 4. 截图保存
  screenshot({
    path: "C:\\dev\\projects\\stock-race\\test-output\\holding-pie-chart.png"
  })

  // 5. 验证持仓列表（如果有）
  const hasList = query_selector({
    selector: ".holding-list"
  })

  if (hasList) {
    // 验证至少显示一个持仓
    assert_state({
      selector: ".holding-item",
      visible: true
    })

    // 验证颜色点存在
    assert_state({
      selector: ".color-dot",
      visible: true
    })
  }

  // 6. 测试空状态（如果有测试数据）
  // evaluate_script({
  //   script: `// 清空持仓数据测试空状态`
  // })
}
```

### 5.3 ProfitCurveChart 专项测试

```typescript
/**
 * 收益曲线图测试
 * 组件路径: components/charts/ProfitCurveChart.vue
 */

async function testProfitCurveChart() {
  connect_devtools({
    projectPath: "C:\\dev\\projects\\stock-race\\miniprogram"
  })

  navigate_to({ url: "/pages/ai-managers/detail?id=1" })

  // 1. 等待收益曲线区域加载
  wait_for({
    selector: ".profit-curve-chart",
    timeout: 5000
  })

  // 2. 验证头部信息显示
  assert_text({
    selector: ".chart-title",
    textContains: "收益曲线"
  })

  // 3. 截图 - 日K视图
  screenshot({
    path: "C:\\dev\\projects\\stock-race\\test-output\\profit-curve-daily.png"
  })

  // 4. 切换周期 - 周K
  query_selector({ selector: ".period-tab.week" })
  click({ uid: ".period-tab.week" })
  wait_for({ timeout: 1500 })

  screenshot({
    path: "C:\\dev\\projects\\stock-race\\test-output\\profit-curve-weekly.png"
  })

  // 5. 切换周期 - 月K
  query_selector({ selector: ".period-tab.month" })
  click({ uid: ".period-tab.month" })
  wait_for({ timeout: 1500 })

  screenshot({
    path: "C:\\dev\\projects\\stock-race\\test-output\\profit-curve-monthly.png"
  })

  // 6. 验证累计收益显示
  assert_state({
    selector: ".profit-value",
    visible: true
  })
}
```

### 5.4 KLineChart 专项测试

```typescript
/**
 * K线图测试
 * 组件路径: components/charts/KLineChart.vue
 */

async function testKLineChart() {
  connect_devtools({
    projectPath: "C:\\dev\\projects\\stock-race\\miniprogram"
  })

  // 进入股票详情页（假设路径）
  navigate_to({ url: "/pages/stock/detail?code=000001.SZ" })

  // 1. 等待 K线图加载
  wait_for({
    selector: ".kline-chart-container",
    timeout: 5000
  })

  // 2. 验证 K线图存在
  assert_state({
    selector: "canvas",
    visible: true
  })

  // 3. 截图
  screenshot({
    path: "C:\\dev\\projects\\stock-race\\test-output\\kline-chart.png"
  })

  // 4. 验证 MA 线标签（如果有）
  try {
    assert_text({
      selector: ".ma-label",
      textContains: "MA5"
    })
  } catch (e) {
    console.log("MA 标签可能不显示或选择器不同")
  }
}
```

### 5.5 图表测试截图规范

**截图命名规范**：
```
{组件名}-{状态}-{时间戳}.png

示例：
- holding-pie-chart-initial-20260225-143022.png
- profit-curve-weekly-20260225-143105.png
- kline-chart-interaction-20260225-143230.png
```

**截图输出目录**：
```
C:\dev\projects\stock-race\test-output\
```

---

## 六、常见测试场景示例

### 6.1 用户登录流程测试

```typescript
async function testLoginFlow() {
  connect_devtools({
    projectPath: "C:\\dev\\projects\\stock-race\\miniprogram"
  })

  // 1. 进入登录页
  navigate_to({ url: "/pages/login/login" })

  wait_for({
    selector: ".login-container",
    timeout: 5000
  })

  // 2. 输入用户名
  query_selector({ selector: "input[name=username]" })
  input_text({
    uid: "input[name=username]",
    text: "testuser"
  })

  // 3. 输入密码
  query_selector({ selector: "input[name=password]" })
  input_text({
    uid: "input[name=password]",
    text: "password123"
  })

  // 4. 点击登录
  query_selector({ selector: ".login-btn" })
  click({ uid: ".login-btn" })

  // 5. 等待跳转
  wait_for({
    selector: ".home-container",
    timeout: 10000
  })

  // 6. 验证登录成功
  assert_state({
    selector: ".user-avatar",
    visible: true
  })

  // 7. 截图
  screenshot({
    path: "C:\\dev\\projects\\stock-race\\test-output\\login-success.png"
  })
}
```

### 6.2 创建 AI 账户流程测试

```typescript
async function testCreateAIAccount() {
  connect_devtools({
    projectPath: "C:\\dev\\projects\\stock-race\\miniprogram"
  })

  // 前置条件：已登录
  navigate_to({ url: "/pages/ai-managers/create" })

  // 1. 填写表单
  query_selector({ selector: "input[name=name]" })
  input_text({
    uid: "input[name=name]",
    text: "测试基金经理"
  })

  // 2. 选择风险等级
  set_form_control({
    uid: "picker[name=riskLevel]",
    value: "稳健"
  })

  // 3. 设置初始资金
  input_text({
    uid: "input[name=initialCapital]",
    text: "100000"
  })

  // 4. 提交
  query_selector({ selector: ".submit-btn" })
  click({ uid: ".submit-btn" })

  // 5. 等待创建成功
  wait_for({
    selector: ".success-message",
    timeout: 5000
  })

  // 6. 验证跳转回列表页
  assert_state({
    selector: ".ai-manager-list",
    visible: true
  })
}
```

### 6.3 网络请求监控测试

```typescript
async function testNetworkMonitoring() {
  connect_devtools({
    projectPath: "C:\\dev\\projects\\stock-race\\miniprogram"
  })

  // 1. 清空之前的请求记录
  clear_network_requests()

  // 2. 触发 API 调用
  navigate_to({ url: "/pages/competition/ranking" })

  // 3. 等待请求完成
  wait_for({ timeout: 3000 })

  // 4. 获取排行榜请求
  const requests = list_network_requests({
    urlPattern: "/api/v1/public/rankings"
  })

  // 5. 验证请求存在
  expect(requests.length).toBeGreaterThan(0)

  // 6. 获取请求详情
  const request = get_network_request({
    reqid: requests[0].reqid
  })

  // 7. 验证响应状态
  assert_state({
    condition: request.response.status === 200,
    message: "排行榜 API 应返回 200"
  })
}
```

---

## 七、最佳实践

### 7.1 测试脚本组织

```
miniprogram/tests/mcp/
├── chart-tests/              # 图表专项测试
│   ├── holding-pie.test.ts
│   ├── profit-curve.test.ts
│   └── kline-chart.test.ts
├── flow-tests/               # 流程测试
│   ├── login-flow.test.ts
│   ├── create-ai-account.test.ts
│   └── trading-flow.test.ts
├── utils/                    # 测试工具
│   └── mcp-helpers.ts
└── screenshots/              # 测试截图输出
    ├── baseline/             # 基线截图
    └── current/              # 当前测试截图
```

### 7.2 封装通用函数

```typescript
// tests/mcp/utils/mcp-helpers.ts

/**
 * 带自动截图的连接函数
 */
export async function connectWithScreenshot(projectPath: string) {
  const result = await connect_devtools({
    projectPath,
    strategy: "auto"
  })

  // 连接成功后截图
  await screenshot({
    path: `C:\\dev\\projects\\stock-race\\test-output\\connect-${Date.now()}.png`
  })

  return result
}

/**
 * 等待图表渲染完成
 */
export async function waitForChart(selector: string, timeout = 5000) {
  await wait_for({
    selector,
    timeout
  })

  // 额外等待 canvas 渲染
  await new Promise(resolve => setTimeout(resolve, 500))
}

/**
 * 截图对比函数（需要额外实现图片对比）
 */
export async function assertScreenshotMatch(
  name: string,
  tolerance = 0.1
) {
  const currentPath = `C:\\dev\\projects\\stock-race\\test-output\\current\\${name}.png`
  const baselinePath = `C:\\dev\\projects\\stock-race\\test-output\\baseline\\${name}.png`

  await screenshot({ path: currentPath })

  // 对比逻辑（使用 pixelmatch 等库）
  // ...
}
```

### 7.3 测试数据准备

```typescript
// 使用 evaluate_script 注入测试数据
await evaluate_script({
  script: `
    // 注入测试用的持仓数据
    const testHoldings = [
      { stockCode: '000001', stockName: '平安银行', marketValue: 50000 },
      { stockCode: '000002', stockName: '万科A', marketValue: 30000 },
      { stockCode: '600519', stockName: '贵州茅台', marketValue: 120000 }
    ];

    // 假设全局暴露的测试接口
    if (window.__TEST__) {
      window.__TEST__.setHoldings(testHoldings);
    }
  `
})
```

### 7.4 错误处理

```typescript
async function safeTest(testName: string, testFn: () => Promise<void>) {
  try {
    console.log(`[测试开始] ${testName}`)
    await testFn()
    console.log(`[测试通过] ${testName}`)
  } catch (error) {
    console.error(`[测试失败] ${testName}:`, error)

    // 失败时截图
    await screenshot({
      path: `C:\\dev\\projects\\stock-race\\test-output\\error-${testName}-${Date.now()}.png`
    })

    throw error
  } finally {
    // 确保断开连接
    await disconnect_devtools()
  }
}
```

---

## 八、故障排除

### 8.1 常见问题

#### Q1: 连接失败 "Connection closed"

**可能原因**：
- 微信开发者工具未开启
- 项目路径错误
- 端口被占用

**解决方案**：
```bash
# 1. 检查微信开发者工具是否开启自动化
# 设置 -> 安全设置 -> 服务端口: 开启

# 2. 验证项目路径
ls C:\dev\projects\stock-race\miniprogram\app.json
# 应该存在
```

#### Q2: query_selector 找不到元素

**可能原因**：
- 页面尚未加载完成
- 选择器错误
- 元素在自定义组件内

**解决方案**：
```typescript
// 1. 增加等待时间
wait_for({
  selector: ".my-element",
  timeout: 10000  // 增加到 10 秒
})

// 2. 使用 evaluate_script 调试
const debug = evaluate_script({
  script: `
    return {
      body: document.body.innerHTML.substring(0, 500),
      selectors: {
        byClass: document.querySelectorAll('.my-class').length,
        byId: document.querySelectorAll('#my-id').length
      }
    };
  `
})
console.log('调试信息:', debug)
```

#### Q3: screenshot 截图为空或白屏

**可能原因**：
- 页面尚未渲染完成
- 小程序启动中

**解决方案**：
```typescript
// 1. 等待页面完全加载
wait_for({ selector: "page", timeout: 10000 })

// 2. 额外等待渲染
await new Promise(r => setTimeout(r, 1000))

// 3. 再截图
screenshot({ path: "..." })
```

### 8.2 调试技巧

```typescript
// 获取页面完整结构用于调试
const snapshot = get_page_snapshot()
console.log('页面结构:', JSON.stringify(snapshot, null, 2))

// 获取 Console 日志
const logs = list_console_messages()
logs.forEach(log => {
  console.log(`[${log.level}] ${log.message}`)
})

// 连接诊断
diagnose_connection()
```

### 8.3 获取帮助

如遇到本文档未覆盖的问题：

1. **查阅 MCP 服务文档**: `C:\dev\projects\weixin-devtools-mcp\CLAUDE.md`
2. **运行健康检查**: `node scripts/mcp/test-mcp-valid.mjs`
3. **联系架构团队**: 提交 issue 到项目文档

---

## 附录

### A. 快速命令参考

```bash
# 运行 MCP 连接测试
cd C:\dev\projects\stock-race
node scripts/mcp/test-mcp-valid.mjs

# 查看截图输出目录
ls C:\dev\projects\stock-race\test-output\

# 清空测试截图
rm -rf C:\dev\projects\stock-race\test-output\*.png
```

### B. 相关文档链接

- [TEST_SCRIPTS.md](./TEST_SCRIPTS.md) - 测试脚本索引
- [TODO.md](./TODO.md) - 开发任务追踪
- [HAVE_DONE.md](./HAVE_DONE.md) - 已完成功能
- [weixin-devtools-mcp CLAUDE.md](../../../../weixin-devtools-mcp/CLAUDE.md) - MCP 服务详细文档

---

**文档维护者**: 首席架构师
**最后更新**: 2026-02-25
**版本**: v1.0
