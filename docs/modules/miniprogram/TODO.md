# Miniprogram 模块 - 开发任务追踪

> 本文档仅记录未完成和待其他服务跟进的工作项。
> 已完成功能请查阅 [HAVE_DONE.md](./HAVE_DONE.md)。
> **最后更新：2026-02-25**

---

## 格式说明（自动化开发使用）

任务必须使用以下格式标记：
```markdown
<!-- AUTO-TASK: BEGIN {task-id} -->
### {task-id}: 任务标题
- **自动化任务**: {queue-task-id}      # 对应 queue.json 的任务ID
- **状态**: ✅ 已完成 / 🔄 开发中 / ✅ 已完成 / ⛔ 阻塞
- **优先级**: P0/P1/P2
- **技术方案**: 详细实现步骤
- **验收标准**: 完成检查项
<!-- AUTO-TASK: END {task-id} -->
```

---

## 状态图例

- 🔴 **P0-紧急** - 阻塞性问题，必须立即解决
- 🟠 **P1-高** - 重要功能，优先处理
- 🟡 **P2-中** - 一般功能，按计划处理
- 🟢 **P3-低** - 优化项，有空时处理
- 🔲 待开发
- 🔄 开发中
- ⚠️ 待验证/部分完成
- ⏸️ 阻塞（依赖其他服务）
- ✅ 已完成（已移至 HAVE_DONE.md）

---

## 🔴 P0 - 紧急阻塞任务（2026-02-25新增）

### 问题描述
**当前状况**：小程序启动后白屏，控制台报错 `未获取到context! 注意：v2.0版本后，需要自行获取canvas的绘图上下文并传入opts.context`

**根本原因**：项目使用 `@qiun/ucharts@2.5.0`（v2.x API），但 4 个图表组件使用 v1.x 的 `<qiun-data-charts>` 组件方式，API 完全不兼容。

**影响范围**：所有图表页面无法正常显示（AI经理详情页收益曲线、持仓分布图等）

**解决方案**：重写图表组件，使用 uCharts v2.x 原生 API（通过 `uni.createCanvasContext` 获取上下文后调用 `new uCharts()`）

---

### UC-V2-001: 创建 uCharts v2.x 通用工具模块

| 属性 | 内容 |
|------|------|
| **任务编号** | UC-V2-001 |
| **优先级** | 🔴 P0-紧急 |
| **状态** | ✅ 已完成 |
| **预估工时** | 0.5天 |
| **阻塞状态** | 阻塞所有图表功能 |

**开发要求**：
1. 创建 `src/utils/ucharts.ts` 通用模块
2. 封装 `initChart(canvasId, options)` 函数，内部使用 `uni.createSelectorQuery` 获取 canvas 节点
3. 封装 `getCanvasContext(canvasId)` 函数，返回 `uni.createCanvasContext` 获取的上下文
4. 处理平台差异（微信小程序 canvas 2d 与旧版 canvas）
5. 导出 uCharts 实例创建辅助函数

**技术要点**：
```typescript
// 参考实现
export function createUChart(canvasId: string, opts: any) {
  return new Promise((resolve, reject) => {
    const query = uni.createSelectorQuery()
    query.select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const uchart = new uCharts({
          context: ctx,
          canvasId,
          ...opts
        })
        resolve(uchart)
      })
  })
}
```

**测试要求**（测试团队依据此制定测试用例）：
- TC-UCV2-001-01: `getCanvasContext` 在微信开发者工具能正确获取 canvas 2d 上下文
- TC-UCV2-001-02: `getCanvasContext` 在真机环境（iOS/Android）能正确获取上下文
- TC-UCV2-001-03: 错误处理 - canvasId 不存在时返回有意义的错误信息
- TC-UCV2-001-04: 多次调用同一 canvasId 不会创建重复实例
- TC-UCV2-001-05: 页面卸载时正确销毁 uCharts 实例（避免内存泄漏）

---

### UC-V2-002: 重构 HoldingPieChart.vue 适配 v2.x

| 属性 | 内容 |
|------|------|
| **任务编号** | UC-V2-002 |
| **优先级** | 🔴 P0-紧急 |
| **状态** | 🔲 待开发 |
| **预估工时** | 0.5天 |
| **依赖** | UC-V2-001 |

**开发要求**：
1. 移除 `<qiun-data-charts>` 组件标签
2. 添加 `<canvas id="holding-pie-chart" canvas-id="holding-pie-chart" style="width:100%;height:280px"></canvas>`
3. 在 `onMounted` 中调用 UC-V2-001 的 `createUChart` 初始化饼图
4. 配置项从 `chartOpts` 转换为 uCharts v2.x 格式
5. 监听 `props.holdings` 变化时调用 `uchart.updateData()` 更新
6. 处理组件卸载时的资源释放

**测试要求**：
- TC-UCV2-002-01: 空持仓时显示"暂无持仓"占位图
- TC-UCV2-002-02: 5个以内持仓时正确渲染饼图各区块
- TC-UCV2-002-03: 超过5个持仓时"其他"区块正确合并计算
- TC-UCV2-002-04: 饼图区块颜色与配置（深海蓝、马鞍棕等8色）一致
- TC-UCV2-002-05: 点击饼图区块触发 `click` 事件并传递正确数据
- TC-UCV2-002-06: 数据更新时饼图平滑过渡动画
- TC-UCV2-002-07: 页面多次进入/退出不会出现图表重叠或内存泄漏

---

### UC-V2-003: 重构 LineChart.vue 适配 v2.x

| 属性 | 内容 |
|------|------|
| **任务编号** | UC-V2-003 |
| **优先级** | 🔴 P0-紧急 |
| **状态** | 🔲 待开发 |
| **预估工时** | 0.5天 |
| **依赖** | UC-V2-001 |

**开发要求**：
1. 移除 `<qiun-data-charts>` 组件标签
2. 添加 `<canvas>` 标签，支持 `enableScroll` 时启用滚动
3. 适配 v2.x 的折线图配置（`type: 'line'`）
4. 支持多条线（series）配置
5. 处理 xAxis/yAxis 配置转换
6. 支持 `smooth` 参数控制曲线/直线

**测试要求**：
- TC-UCV2-003-01: 单条折线数据正确渲染
- TC-UCV2-003-02: 多条折线（最多6条）不同颜色正确渲染
- TC-UCV2-003-03: `smooth=true` 时曲线平滑，`smooth=false` 时直线连接
- TC-UCV2-003-04: `enableScroll=true` 且数据点超过30个时可横向滚动
- TC-UCV2-003-05: Y轴网格线为虚线（dash）样式
- TC-UCV2-003-06: 点击数据点触发 `click` 事件并传递正确数据
- TC-UCV2-003-07: 空数据时显示"暂无数据"占位图

---

### UC-V2-004: 重构 KLineChart.vue 适配 v2.x

| 属性 | 内容 |
|------|------|
| **任务编号** | UC-V2-004 |
| **优先级** | 🔴 P0-紧急 |
| **状态** | 🔲 待开发 |
| **预估工时** | 0.5天 |
| **依赖** | UC-V2-001 |

**开发要求**：
1. 移除 `<qiun-data-charts>` 组件标签
2. 添加 `<canvas>` 标签
3. 适配 v2.x 的 K线图配置（`type: 'candle'`）
4. 正确处理 K线数据格式 `[open, close, low, high]`
5. 配置涨跌颜色（A股习惯：红涨绿跌）
6. 支持 `period` 参数切换日K/周K/月K

**测试要求**：
- TC-UCV2-004-01: 日K数据正确渲染蜡烛图
- TC-UCV2-004-02: 上涨蜡烛为红色（`upColor: '#ff4d4f'`），下跌为绿色（`downColor: '#52c41a'`）
- TC-UCV2-004-03: MA5/MA10/MA20 移动平均线正确计算和显示
- TC-UCV2-004-04: 切换 period 时图表数据正确更新
- TC-UCV2-004-05: 数据可横向滚动查看历史K线
- TC-UCV2-004-06: 点击K线显示 Tooltip 含日期、开收高低价格
- TC-UCV2-004-07: 数据点少于5个时不显示MA线

---

### UC-V2-005: 重构 ProfitCurveChart.vue 适配 v2.x

| 属性 | 内容 |
|------|------|
| **任务编号** | UC-V2-005 |
| **优先级** | 🔴 P0-紧急 |
| **状态** | 🔲 待开发 |
| **预估工时** | 0.5天 |
| **依赖** | UC-V2-001, UC-V2-003 |

**开发要求**：
1. 复用 UC-V2-003 的折线图基础能力
2. 移除 `<qiun-data-charts>` 组件标签
3. 添加 `<canvas>` 标签
4. 支持面积图效果（`showArea=true`）
5. 收益为正时线条红色，负时绿色
6. 头部显示累计收益和收益率

**测试要求**：
- TC-UCV2-005-01: 正收益时折线及面积图为红色系
- TC-UCV2-005-02: 负收益时折线及面积图为绿色系
- TC-UCV2-005-03: 头部正确显示累计收益金额和收益率百分比
- TC-UCV2-005-04: `showArea=true` 时显示半透明面积填充
- TC-UCV2-005-05: 数据点tooltip显示日期和当日收益
- TC-UCV2-005-06: 时间范围文本正确显示起始和结束日期
- TC-UCV2-005-07: 单数据点时正确渲染不报错

---

### UC-V2-006: 构建验证和集成测试

| 属性 | 内容 |
|------|------|
| **任务编号** | UC-V2-006 |
| **优先级** | 🔴 P0-紧急 |
| **状态** | 🔲 待开发 |
| **预估工时** | 0.5天 |
| **依赖** | UC-V2-002 ~ UC-V2-005 |

**开发要求**：
1. 执行 `npm run build:mp-weixin` 确保无 TypeScript 编译错误
2. 检查构建产物中无 `<qiun-data-charts>` 残留
3. 验证 `pages/ai-managers/detail.vue` 正确引用新图表组件
4. 更新 `package.json` 确认 `@qiun/ucharts` 版本为 2.5.0
5. 删除不再使用的 v1.x 组件配置（如有）

**测试要求**：
- TC-UCV2-006-01: `npm run build:mp-weixin` 构建成功，无 TS 错误
- TC-UCV2-006-02: 微信开发者工具控制台无 uCharts 相关警告
- TC-UCV2-006-03: AI经理详情页所有图表（收益曲线、持仓分布）正常显示
- TC-UCV2-006-04: iOS 真机（iPhone 12+）图表正常显示
- TC-UCV2-006-05: Android 真机（主流机型）图表正常显示
- TC-UCV2-006-06: 页面进入/退出10次无内存泄漏（通过小程序内存监控）
- TC-UCV2-006-07: 弱网环境下图表优雅降级（显示loading或重试按钮）

---

### UC-V2-007: 技术文档更新

| 属性 | 内容 |
|------|------|
| **任务编号** | UC-V2-007 |
| **优先级** | 🟡 P2-中 |
| **状态** | 🔲 待开发 |
| **预估工时** | 0.25天 |
| **依赖** | UC-V2-006 |

**开发要求**：
1. 更新 `docs/modules/miniprogram/TECH_STACK.md`，说明 uCharts v2.x 使用方式
2. 在组件代码中添加注释说明 v2.x API 的使用方式
3. 更新 HAVE_DONE.md，标记图表组件适配完成

**测试要求**：
- TC-UCV2-007-01: 新开发者阅读文档后能独立创建一个新图表组件

---

## 一、联调就绪状态声明

### 🚨 项目管理要求（2026-02-25更新）

> **当前状态**：❌ **未达联调就绪状态**（uCharts v2.x 适配阻塞）
>
> **阻塞原因**：P0 任务 UC-V2-001 ~ UC-V2-006 未完成前，图表功能不可用，影响核心用户体验
>
> **联调启动条件**：
> 1. ✅ 所有P0任务（除UC-V2-007文档外）开发完成
> 2. ✅ 所有P0任务测试用例通过
> 3. ✅ 真机测试通过（iOS + Android）

---

### 联调就绪标准定义

| 类别 | 条件 | 当前状态 |
|------|------|----------|
| **功能完整性** | 所有P0任务开发完成 | ❌ UC-V2-001~006 待开发 |
| **代码稳定性** | 所有P0功能通过单元测试 | ❌ 待UC-V2完成后测试 |
| **接口对接** | 所有Backend/Market Data接口已对接 | ✅ HTTP和WebSocket接口全部对接完成 |
| **数据一致性** | 多端数据流转逻辑正确 | ✅ WebSocket实时数据+HTTP降级保障已实现 |

---

### 外部依赖状态

| 依赖服务 | 所需接口 | 状态 | 说明 |
|----------|---------|------|------|
| Backend | O3-001 排行榜API | ✅ 已就绪 | `GET /api/v1/public/rankings` |
| Backend | O3-002 行情API | ✅ 已就绪 | `GET /api/v1/public/market/quotes` |
| Backend | O3-003 游客Token | ✅ 已就绪 | `POST /api/v1/guest/token` |
| Backend | C5-004 数据迁移 | ✅ 已就绪 | `POST /api/v1/guest/migrate` |
| Market Data | O6-001 WebSocket | ✅ 已就绪 | `ws://market-data:8001/ws/public/quotes` |

---

## 二、阻塞任务（需其他服务跟进）

### 2.1 等待 Backend 服务

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| 微信登录API | `POST /api/auth/wechat-login` | ⏸️ | 微信code换取token |
| 排行榜公开API | `GET /api/ranking/:period` | ⏸️ | 日/周/月榜，无需认证 |
| 行情公开API | `GET /api/market/quotes` | ⏸️ | 股票行情列表，无需认证 |
| 股票搜索API | `GET /api/market/search` | ⏸️ | 股票搜索，无需认证 |

**说明**：以上Backend接口在P0 UC-V2任务完成后对接

---

## 三、技术债务（P1优先级）

### 3.1 测试完善

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| 单元测试补充 | 🟠 P1 | 为T-001~T-010补充单元测试 | 3天 |
| AI经理详情页测试 | ✅ | 已完成18个单元测试用例 | 0.5天 |

### 3.2 代码优化

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| AI经理详情页 | ✅ | 已完成：收益曲线、持仓列表、交易记录、决策历史、立即决策功能 | 2026-02-11 |
| ~~图表组件集成~~ | ~~P2~~ | ~~引入ucharts展示收益曲线~~ | ~~1天~~ |
| 错误边界处理 | 🟡 P2 | 添加Vue错误边界组件 | 0.5天 |

> **注**：图表组件集成任务已被 UC-V2-001~007 替代

---

## 四、未来规划（与架构演进相关）

### 4.1 短期（1-2周）- P0/P1

- [ ] **🔴 UC-V2-001~007**: uCharts v2.x 适配（阻塞性问题）
- [ ] 🟠 对接Backend排行榜API
- [ ] 🟠 对接Backend行情API

### 4.2 中期（1-2月）- P2

- [ ] 🟡 补充单元测试覆盖
- [ ] 🟡 性能优化（图片懒加载、虚拟滚动）
- [ ] 🟡 uCharts 3D图表特性调研（为用户创造现代体验）

### 4.3 长期（3月+）- P3

- [ ] 🟢 微信登录真机测试上线
- [ ] 🟢 消息推送通知
- [ ] 🟢 分享功能（收益海报、邀请好友）

---

## 五、架构优化任务（2026-02-11新增）

### 5.1 冲突解决方案

#### 冲突1：循环依赖解决（共享Redis + 冷启动）

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C1-MP-001 | 实现服务健康检查 | ✅ **已完成** | P1 | 检测Backend和Market Data可用性，实现文件：`src/services/health.ts`（2026-02-12） |
| C1-MP-002 | 实现降级展示模式 | ✅ **已完成** | P1 | 服务不可用时展示缓存数据和提示，实现文件：`src/components/common/ServiceStatusBar.vue`（2026-02-12） |

**阻塞状态**: 依赖 [infra/TODO.md](../infra/TODO.md) C1-003（健康检查SDK规范）

#### 冲突5：游客模式适配

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| C5-007 | 实现游客Token获取 | ✅ **已完成** | P0 | 无JWT时自动调用`/api/guest/auth/token` |
| C5-007B | 游客Token本地存储 | ✅ **已完成** | P0 | 本地存储游客Token（有效期24h/72h） |
| C5-008 | 登录后数据迁移 | ✅ **已完成** | P0 | 调用Backend接口绑定游客数据到正式账户 |
| C5-008B | 本地数据清理 | ✅ **已完成** | P1 | 迁移成功后清理本地游客数据 |
| C5-010 | 游客模式UI适配 | ⚠️ **部分完成** | 🟠 P1 | 提示用户游客状态、剩余时间、登录入口 |

**阻塞状态**: 依赖C5-001~C5-006（Backend游客模式接口）

#### 优化6：Miniprogram数据流优化

| 编号 | 任务 | 状态 | 优先级 | 测试描述 |
|------|------|------|--------|----------|
| O6-005 | 实现WebSocket连接管理 | ✅ **已完成** | P0 | 连接Market Data公开WebSocket，实现文件：`src/services/websocket.ts`, `src/composables/useWebSocketManager.ts`（2026-02-12） |
| O6-005B | 实现股票订阅管理 | ✅ **已完成** | P0 | 根据AI账户持仓动态订阅/取消订阅，实现文件：`src/services/websocket.ts`, `src/composables/useWebSocketManager.ts`（2026-02-12） |
| O6-006 | 实现数据合并逻辑 | ✅ **已完成** | P0 | Pinia Store合并实时行情+Backend收益数据，实现文件：`src/stores/market.ts`（2026-02-12） |
| O6-006B | 持仓收益实时计算 | ✅ **已完成** | P0 | 基于实时股价+Backend成本数据计算收益，实现文件：`src/stores/trading.ts`（2026-02-12） |
| O6-007 | WebSocket自动重连 | ✅ **已完成** | P1 | 断线自动重连，降级HTTP轮询，实现文件：`src/services/websocket.ts`, `src/components/common/RealtimeIndicator.vue`（2026-02-12） |
| O6-009 | 收益数据定期刷新 | ✅ **已完成** | P1 | 每分钟调用Backend获取准确累计收益，实现文件：`src/stores/trading.ts`（2026-02-12） |
| O6-010 | 数据一致性保障 | ✅ **已完成** | P1 | WebSocket断开时使用Backend缓存数据，实现文件：`src/services/websocket.ts`（2026-02-12） |

**状态**: ✅ 已完成（2026-02-12），依赖O6-001, O6-002（Market Data公开WebSocket）已就绪

---

## 六、外部依赖跟踪（2026-02-12更新）

| 依赖服务 | 所需功能 | 当前状态 | 跟进日期 | 说明 |
|----------|---------|---------|---------|------|
| Backend | 微信登录API | ✅ 已完成 | 2026-02-12 | `POST /api/auth/wechat-login` |
| Backend | 排行榜公开API | ✅ 已完成 | 2026-02-12 | `GET /api/v1/public/rankings`，见O3-001 |
| Backend | 行情公开API | ✅ 已完成 | 2026-02-12 | `GET /api/v1/public/market/quotes`，见O3-002 |
| Backend | 股票搜索API | ✅ 已完成 | 2026-02-12 | `GET /api/v1/public/market/search`，见O3-001 |
| Backend | 游客Token接口 | ✅ 已完成 | 2026-02-12 | `POST /api/v1/guest/token`，见C5-001 |
| Backend | 游客AI账户接口 | ✅ 已完成 | 2026-02-12 | `POST /api/v1/guest/ai-accounts`，见C5-002 |
| Backend | 游客对话接口 | ✅ 已完成 | 2026-02-12 | `POST /api/v1/guest/ai-accounts/:id/chat`，见C5-003 |
| Backend | 游客数据迁移 | ✅ 已完成 | 2026-02-12 | `POST /api/v1/guest/migrate`，见C5-004 |
| Market Data | 公开WebSocket | ✅ 已完成 | 2026-02-12 | `ws://market-data:8001/ws/public/quotes`，见O6-001 |
| Backend | 收益数据接口优化 | ✅ 已完成 | 2026-02-12 | `GET /api/ai-accounts/{id}/performance`，见O6-003 |

**状态说明**: ✅ 所有Backend和Market Data接口已就绪，Miniprogram可立即开始对接开发

---

## 七、最近更新记录

| 日期 | 更新内容 | 更新人 |
|------|---------|--------|
| **2026-02-25** | **新增**: [MCP_GUIDE.md](./MCP_GUIDE.md) - weixin-devtools-mcp 完整使用指南（31工具、图表测试示例、故障排除） | 首席架构师 |
| **2026-02-25** | **验证**: MCP 服务连接测试通过（full profile, 31工具，含 screenshot） | 首席架构师 |
| **2026-02-25** | **🔴 紧急**: 新增 UC-V2-001~007 uCharts v2.x 适配任务群，当前最高优先级，阻塞性问题 | 首席架构师 |
| 2026-02-12 | 完成WebSocket功能群（O6-005~O6-010）和健康检查功能（C1-MP-001/002），达到联调就绪状态 | 开发团队 |
| 2026-02-11 | 配置默认环境为 dev（192.168.110.147），完成 API 适配 | 开发团队 |
| 2026-02-11 | 创建环境配置使用文档 ENV_CONFIG.md | 开发团队 |
| 2026-02-11 | 完成多环境配置系统（local/dev/prod） | 开发团队 |
| 2026-02-11 | 完成T-010个人中心页完善（含环境配置） | 开发团队 |
| 2026-02-11 | 完成T-007 AI经理详情页完善 | 开发团队 |
| 2026-02-11 | 重构TODO.md，创建HAVE_DONE.md | 首席架构师 |
| 2026-02-10 | 完成T-011游客模式改造 | 开发团队 |
| 2026-02-05 | 完成T-010个人中心页框架 | 开发团队 |
| 2026-02-03 | 完成T-009行情页框架 | 开发团队 |
| 2026-02-01 | 完成T-008排行榜页框架 | 开发团队 |
| 2026-01-30 | 完成T-007 AI账户详情页框架 | 开发团队 |
| 2026-01-27 | 完成T-006 AI账户创建页 | 开发团队 |
| 2026-01-25 | 完成T-005 AI账户列表页 | 开发团队 |
| 2026-01-23 | 完成T-004微信登录页 | 开发团队 |
| 2026-01-22 | 完成T-003 Pinia状态管理 | 开发团队 |
| 2026-01-21 | 完成T-002 HTTP请求封装 | 开发团队 |
| 2026-01-20 | 完成T-001项目脚手架 | 开发团队 |

---

## 八、文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| **MCP 使用指南** | **[MCP_GUIDE.md](./MCP_GUIDE.md)** | weixin-devtools-mcp 完整使用指南（必读） |
| 已完成功能 | `./HAVE_DONE.md` | 已完成功能与架构师评价 |
| 测试脚本 | `./TEST_SCRIPTS.md` | 测试脚本功能说明与索引 |
| 测试源码 | `../../../miniprogram/tests/` | E2E测试代码 |
| uCharts适配任务 | **本文档 🔴 P0 区块** | UC-V2-001~007 详细规格 |

### 开发必读

1. **使用 MCP 进行自动化测试**: 阅读 [MCP_GUIDE.md](./MCP_GUIDE.md)
2. **了解测试要求**: 查看本文档 🔴 P0 区块各任务的"测试要求"列
3. **编写测试用例**: 参考 [TEST_SCRIPTS.md](./TEST_SCRIPTS.md) 的规范 |

---

## 九、联调冲刺任务（2026-02-12新增）

> **⚠️ 重要：联调已暂停，等待P0 uCharts适配任务完成**
>
> 原定P0任务（T-008, T-009, C5-007等）已完成，但因UC-V2阻塞，暂不进入联调阶段。

---

### 9.1 🔴 P0 - 公开API对接（Backend接口已就绪）

**Backend状态**: ✅ O3-001 排行榜接口 `/api/v1/public/rankings` 已完成
**Backend状态**: ✅ O3-002 行情接口 `/api/v1/public/market/quotes` 已完成

| 编号 | 任务 | 状态 | 预估工时 | 开发要求 | 验收标准 |
|------|------|------|----------|----------|----------|
| T-008 | 收益排行榜页数据对接 | ✅ **已完成** | 0.5天 | 1. ✅ 创建 `api/public.ts` 封装公开API<br>2. ✅ 更新 `pages/competition/ranking.vue`，对接真实API<br>3. ✅ 支持分页参数 page, pageSize | 页面显示Backend返回的真实排行榜数据，日/周/月榜切换正常 |
| T-009 | 股票行情页数据对接 | ✅ **已完成** | 0.5天 | 1. ✅ 创建 `api/public.ts` 封装公开API<br>2. ✅ 更新 `pages/market/quotes.vue`，对接真实API<br>3. ✅ 处理新字段：change, changePercent, volume | 行情页面显示Backend返回的真实股票数据，价格、涨跌幅、成交量正确显示 |

**接口规格详情**:

**1. 排行榜接口** `GET /api/v1/public/rankings`
```typescript
// 请求参数
{ page: 1, limit: 20, sort: 'by_return' }

// 响应格式
{
  "data": [
    {
      "rank": 1,
      "ai_manager_name": "量化先锋",
      "total_return": 0.256,
      "sharpe_ratio": 1.85,
      "win_rate": 0.72
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 150 }
}
```

**2. 行情接口** `GET /api/v1/public/market/quotes`
```typescript
// 请求参数
{ symbols: "000001.SZ,600000.SH" } // 可选，不传返回热门股票

// 响应格式
{
  "data": [
    {
      "symbol": "000001.SZ",
      "name": "平安银行",
      "price": 12.58,
      "change": 0.35,
      "change_percent": 2.86,
      "volume": 1250000
    }
  ]
}
```

---

### 9.2 🔴 P0 - Guest模式集成（Backend接口已就绪）

**Backend状态**: ✅ O3-003 游客Token接口 `/api/v1/guest/token` 已完成
**Backend状态**: ✅ C5-001~C5-006 游客模式全部完成

| 编号 | 任务 | 状态 | 预估工时 | 开发要求 | 验收标准 |
|------|------|------|----------|----------|----------|
| C5-007 | 游客Token获取 | ✅ **已完成** | 0.5天 | 1. ✅ 在 `api/guest.ts` 中实现 `getGuestToken(code, deviceId)` 方法，调用 `POST /api/guest/auth/token`<br>2. ✅ 在 `stores/auth.ts` 中实现 `initGuestMode()` 和 `refreshGuestToken()` action，无JWT时自动调用<br>3. ✅ 使用 `uni.login` 获取微信code作为设备标识 | 无JWT时自动获取游客Token，请求成功返回 guest_token 和 expires_at |
| C5-007B | 游客Token本地存储 | ✅ **已完成** | 0.5天 | 1. ✅ 使用 `uni.setStorageSync('stock_race_guest_session', session)` 存储游客会话<br>2. ✅ 存储内容包括：token, openid, expiresAt, hasAIAccount, lastActivityAt<br>3. ✅ 在 `initGuestMode()` 中读取本地存储的Token并检查过期时间<br>4. ✅ 过期自动重新获取 | 游客Token持久化存储，App重启后仍保持游客状态，Token过期前自动刷新 |
| C5-010 | 游客模式UI适配 | ⚠️ **部分完成** | 0.5天 | 1. 🔲 **未完成**：首页 (`pages/index/index.vue`) 顶部添加游客状态提示条<br>2. ✅ 登录页 (`pages/login/login.vue`) 已添加"暂不登录，继续浏览"入口<br>3. 🔲 **待验证**：游客模式下"创建AI账户"按钮限制<br>4. 🔲 **未完成**：我的页面 (`pages/settings/profile.vue`) 游客头像和标识 | 游客状态清晰可见，登录入口明显，游客无法访问的功能有明确提示 |
| C5-008 | 登录后数据迁移 | ✅ **已完成** | 0.5天 | 1. ✅ 在 `stores/auth.ts` 中实现 `loginAndBindGuest(code)` 方法<br>2. ✅ 先调用 `guestApi.bindGuestData(guestToken)` 绑定游客数据<br>3. ✅ 再执行微信登录，成功后调用 `clearGuestSession()` 清理游客状态 | 游客登录后，之前在游客模式下创建的AI账户和对话数据成功迁移到正式账户 |
| C5-008B | 本地数据清理 | ✅ **已完成** | 0.5天 | 1. ✅ 在 `stores/auth.ts` 中实现 `clearGuestSession()` 方法<br>2. ✅ 清理内容：`uni.removeStorageSync('stock_race_guest_session')`<br>3. ✅ 登出时调用 `clearGuestSession()` | 登录成功后本地游客数据完全清理，避免数据混淆 |

---

### 9.3 🔴 P0 - WebSocket实时行情

**Market Data状态**: ✅ O6-001 公开WebSocket `/ws/public/quotes` 已就绪
**Backend状态**: ✅ O6-003 收益接口含持仓成本 已就绪

| 编号 | 任务 | 状态 | 预估工时 | 阻塞联调 | 开发要求 | 验收标准 |
|------|------|------|----------|----------|----------|----------|
| O6-005 | WebSocket连接管理 | ✅ **已完成** | 1天 | - | 1. ✅ 创建 `services/websocket.ts` 模块<br>2. ✅ 使用 `uni.connectSocket` 连接 `ws://market-data:8001/ws/public/quotes`<br>3. ✅ 实现连接状态管理（connecting/connected/disconnected）<br>4. ✅ 全局单例模式，确保只有一个WebSocket连接<br><br>**核心功能**：全局单例WebSocket管理器，支持多页面共享连接，状态实时同步到Pinia Store（2026-02-12） | WebSocket连接成功，onOpen回调触发，连接状态可在Pinia中访问 |
| O6-005B | 股票订阅管理 | ✅ **已完成** | 0.5天 | - | 1. ✅ 在 `services/websocket.ts` 中实现 `subscribe(symbols: string[])` 方法<br>2. ✅ 发送消息格式：`{ action: 'subscribe', symbols: ['000001.SZ'] }`<br>3. ✅ 在 `stores/trading.ts` 中监听持仓变化，自动订阅持仓股票<br>4. ✅ 取消订阅方法 `unsubscribe(symbols)`，页面卸载时调用<br><br>**核心功能**：智能订阅管理，根据AI账户持仓自动订阅/取消订阅，最多50只股票限流控制（2026-02-12） | 持仓股票自动订阅，WebSocket收到对应股票的实时行情推送 |
| O6-006 | 数据合并逻辑 | ✅ **已完成** | 1天 | - | 1. ✅ 在 `stores/market.ts` 中添加 `mergeRealtimeQuotes(quotes)` action<br>2. ✅ WebSocket收到数据后，合并到Pinia store中的行情列表<br>3. ✅ 更新 `stores/trading.ts` 中的持仓数据，用实时价格替换缓存价格<br><br>**核心功能**：Pinia Store实时数据合并，支持批量更新，防抖处理避免频繁渲染（2026-02-12） | Pinia Store中行情数据实时更新，UI自动响应价格变化 |
| O6-006B | 持仓收益实时计算 | ✅ **已完成** | 0.5天 | - | 1. ✅ 在 `stores/trading.ts` 中添加 `realizedPnl` 计算属性<br>2. ✅ 使用实时价格 × 持仓数量 - 成本<br>3. ✅ 收益率为正显示红色（A股习惯），为负显示绿色<br><br>**核心功能**：基于WebSocket实时价格计算持仓收益，支持浮动盈亏和收益率实时展示（2026-02-12） | 持仓页面收益随实时价格变化自动重新计算并显示 |
| O6-007 | WebSocket自动重连 | ✅ **已完成** | 0.5天 | - | 1. ✅ WebSocket断开时（onClose/onError）自动重连<br>2. ✅ 使用指数退避策略：1s, 2s, 4s, 8s...最多30s<br>3. ✅ 重连失败降级到HTTP轮询（每5秒调用Backend行情接口）<br><br>**核心功能**：指数退避重连策略，最大重连次数10次，自动降级HTTP轮询保证数据连续性（2026-02-12） | 断网恢复后WebSocket自动重连，重连失败时HTTP轮询兜底 |
| O6-009 | 收益数据定期刷新 | ✅ **已完成** | 0.5天 | - | 1. ✅ 使用 `setInterval` 每分钟调用 `GET /api/ai-accounts/:id/performance`<br>2. ✅ 更新 `stores/trading.ts` 中的累计收益数据<br>3. ✅ 页面不可见时暂停定时器（节约电量）<br><br>**核心功能**：定时器管理，页面可见性API监听，后台自动暂停节省电量（2026-02-12） | 累计收益每分钟刷新，显示Backend计算的准确收益 |
| O6-010 | 数据一致性保障 | ✅ **已完成** | 0.5天 | - | 1. ✅ WebSocket断开时使用Backend缓存数据（已自动降级HTTP）<br>2. ✅ 页面加载时先调用HTTP接口获取初始数据<br>3. ✅ WebSocket连接成功后用实时数据覆盖<br><br>**核心功能**：三级数据保障机制（WebSocket实时→HTTP轮询→缓存数据），确保行情不中断（2026-02-12） | WebSocket断开时行情不中断，数据始终保持一致性 |

---

### 9.4 🟢 P1 - 服务健康检查（中优先级）

| 编号 | 任务 | 状态 | 预估工时 | 开发要求 | 验收标准 |
|------|------|------|----------|----------|----------|
| C1-MP-001 | 服务健康检查 | ✅ **已完成** | 0.5天 | 1. ✅ 创建 `services/health.ts` 模块<br>2. ✅ 启动时调用 `GET /api/v1/public/health` 检查Backend可用性<br>3. ✅ 调用 `GET /health` 检查Market Data可用性<br>4. ✅ 记录服务状态到Pinia store<br><br>**核心功能**：并行健康检查，支持超时控制（5s），状态持久化到`stores/health.ts`（2026-02-12） | 启动时显示服务状态，Backend/Market Data不可用时提示用户 |
| C1-MP-002 | 降级展示模式 | ✅ **已完成** | 0.5天 | 1. ✅ Backend不可用时展示缓存数据和"网络异常"提示<br>2. ✅ Market Data不可用时隐藏实时行情，显示"行情更新暂停"<br>3. ✅ 提供"重试"按钮让用户手动刷新<br><br>**核心功能**：`ServiceStatusBar.vue`组件全局展示，智能降级策略，手动重试机制（2026-02-12） | 服务不可用时用户体验友好，有明确提示和重试机制 |

---

## 十、项目里程碑（更新 2026-02-25）

```
当前 ──► [完成UC-V2 uCharts适配] ──► [构建验证] ──► [真机测试] ──► [联调就绪] ──► [进入联调]
       (预计2.5天)              (0.5天)      (0.5天)

UC-V2 任务群:
├── UC-V2-001: 通用工具模块 (0.5天)
├── UC-V2-002: 饼图组件 (0.5天)
├── UC-V2-003: 折线图组件 (0.5天)
├── UC-V2-004: K线图组件 (0.5天)
├── UC-V2-005: 收益曲线组件 (0.5天)
├── UC-V2-006: 构建验证 (0.5天)
└── UC-V2-007: 文档更新 (0.25天)
```

---

## 十一、项目管理要求声明（2026-02-25更新）

### 🚨 严格项目管理规定

**1. 联调准入门槛（不可协商）**
- ❌ **当前阻塞**: UC-V2-001~006 uCharts v2.x 适配任务未完成
- 图表功能为AI经理详情页核心功能，必须100%完成后方可联调
- 禁止"边开发边联调"的并行模式

**2. 当前状态评估**
- ❌ **未达联调就绪状态**（2026-02-25更新）
- 🔴 **P0阻塞**: uCharts v2.x 适配（UC-V2-001~006）
- ⏸️ **已暂停**: 原定P0公开API对接、游客模式、WebSocket等已完成但暂不联调

**3. 开发团队任务（新）**

| 阶段 | 任务 | 工时 | 产出物 | 测试要求 |
|------|------|------|--------|----------|
| **阶段1** | UC-V2-001 通用工具 | 0.5天 | `src/utils/ucharts.ts` | TC-UCV2-001-01~05 |
| **阶段2** | UC-V2-002/003/004/005 组件重构 | 2天 | 4个图表组件文件 | 每组件7+测试用例 |
| **阶段3** | UC-V2-006 构建验证 | 0.5天 | 构建通过 + 真机测试 | TC-UCV2-006-01~07 |
| **阶段4** | UC-V2-007 文档更新 | 0.25天 | 更新TECH_STACK.md | TC-UCV2-007-01 |

**4. 联调启动条件（更新）**
Miniprogram团队申请联调时，必须提供：
- [ ] UC-V2-001~006 代码审查通过证明
- [ ] 真机测试报告（iOS + Android 各1款主流机型）
- [ ] 原有P0验收checklist全部打勾确认（T-008, T-009, C5-007等）

**5. 测试先行原则**
- 每个UC-V2任务后已标注测试要求（TC-UCV2-XXX）
- 开发团队依据测试要求制定具体测试用例
- 开发完成并通过全部测试后方可标记为"已完成"

---

## 十二、测试脚本更新要求

测试团队需在 [TEST_SCRIPTS.md](./TEST_SCRIPTS.md) 中新增以下测试脚本索引：

| 测试脚本 | 覆盖任务 | 测试用例数 | 说明 |
|----------|---------|-----------|------|
| `ucharts-utils.test.ts` | UC-V2-001 | 5+ | 通用工具函数测试 |
| `holding-pie-chart.test.ts` | UC-V2-002 | 7+ | 饼图组件测试 |
| `line-chart.test.ts` | UC-V2-003 | 7+ | 折线图组件测试 |
| `kline-chart.test.ts` | UC-V2-004 | 7+ | K线图组件测试 |
| `profit-curve-chart.test.ts` | UC-V2-005 | 7+ | 收益曲线组件测试 |
| `charts-integration.test.ts` | UC-V2-006 | 7+ | 构建和集成测试 |

---

*文档版本: v3.0（2026-02-25 uCharts v2.x 紧急适配版）*
*最后更新: 2026-02-25*
*维护者: 首席架构师*

---

**评审结论**: Miniprogram模块 **当前未达联调就绪状态**（2026-02-25）
- ❌ **P0阻塞**: UC-V2-001~006 uCharts v2.x 适配任务待完成
- ⏸️ **已完成待联调**: T-008, T-009, C5-007, C5-007B, C5-008, C5-008B, O6-005~010, C1-MP-001/002
- 🟠 **待完善**: C5-010首页游客提示条（非阻塞，可在UC-V2后处理）

**下一步行动**:
1. 立即开始 UC-V2-001 通用工具模块开发
2. 测试团队依据测试要求制定测试用例
3. 按顺序完成 UC-V2-002~006
4. 通过全部测试后更新本文档状态
5. 重新申请联调

**提示：已完成功能详情和代码审查报告请查阅 [HAVE_DONE.md](./HAVE_DONE.md)**

---

## 十三、自动化开发测试任务

<!-- AUTO-TASK: BEGIN AUTO-TEST-001 -->
### AUTO-TEST-001: 创建自动化测试示例文件
- **自动化任务**: MINI-TEST-001
- **状态**: ✅ 已完成
- **优先级**: P2
- **技术方案**:
  1. 在 `src/utils/` 目录下创建 `auto-test.ts` 文件
  2. 导出一个简单的 `hello()` 函数，返回字符串 "Hello Auto Dev"
  3. 添加 JSDoc 注释
  4. 创建对应的单元测试文件 `tests/utils/auto-test.test.ts`
  5. 测试用例：验证 `hello()` 返回正确的字符串
- **验收标准**:
  - [ ] `src/utils/auto-test.ts` 文件存在且可编译
  - [ ] `hello()` 函数返回 "Hello Auto Dev"
  - [ ] 单元测试通过
  - [ ] 代码已提交到 git
<!-- AUTO-TASK: END AUTO-TEST-001 -->

- **完成时间**: 2026-02-25 17:11 [自动化]
