# Miniprogram 模块 - 开发任务追踪

> 本文档仅记录未完成和待其他服务跟进的工作项。
> 已完成功能请查阅 [HAVE_DONE.md](./HAVE_DONE.md)。
> 最后更新：2026-02-11

---

## 状态图例

- 🔲 待开发
- 🔄 开发中
- ⚠️ 待验证/部分完成
- ⏸️ 阻塞（依赖其他服务）
- ✅ 已完成（已移至 HAVE_DONE.md）

---

## 一、未完成工作项

### Phase 4: 排行榜与行情

| 编号 | 任务 | 状态 | 优先级 | 说明 |
|------|------|------|--------|------|
| T-008 | 收益排行榜页数据对接 | ⚠️ | P1 | 页面框架完成，需Backend API |
| T-009 | 股票行情页数据对接 | ⚠️ | P1 | 页面框架完成，需Backend API |

---

### Phase 5: 个人中心

| 编号 | 任务 | 状态 | 优先级 | 说明 |
|------|------|------|--------|------|
| T-010 | 个人中心页完善 | ⚠️ | P2 | 页面框架完成，需完善功能 |

---

## 二、阻塞任务（需其他服务跟进）

### 2.1 等待 Backend 服务

| 任务 | 依赖 | 状态 | 说明 |
|------|------|------|------|
| 微信登录API | `POST /api/auth/wechat-login` | ⏸️ | 微信code换取token |
| 排行榜公开API | `GET /api/ranking/:period` | ⏸️ | 日/周/月榜，无需认证 |
| 行情公开API | `GET /api/market/quotes` | ⏸️ | 股票行情列表，无需认证 |
| 股票搜索API | `GET /api/market/search` | ⏸️ | 股票搜索，无需认证 |

**API详细规格**:

**1. 微信登录接口** (`POST /api/auth/wechat-login`)
```typescript
// 请求
{
  code: string;        // 微信登录凭证，必填
  userInfo?: {         // 用户信息（可选）
    nickName?: string;
    avatarUrl?: string;
  }
}

// 响应
{
  code: 200;
  data: {
    token: string;
    user: { id: string; username: string; nickname: string; avatar?: string; }
  }
}
```

**2. 排行榜接口** (`GET /api/ranking/:period`)
```typescript
// 路径参数: period = 'daily' | 'weekly' | 'monthly'
// 查询参数: page, pageSize

// 响应
{
  code: 200;
  data: {
    list: [{ id: string; name: string; returnRate: number; userId: string; avatar?: string; rank: number; }];
    total: number;
    page: number;
    pageSize: number;
  }
}
```

**3. 行情接口** (`GET /api/market/quotes`)
```typescript
// 查询参数: page, pageSize

// 响应
{
  code: 200;
  data: {
    list: [{ code: string; name: string; price: number; change: number; changePercent: number; volume: number; marketCap: number; }];
    total: number;
    updateTime: string;
  }
}
```

---

## 三、技术债务

### 3.1 测试完善

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| 单元测试补充 | P2 | 为T-001~T-010补充单元测试 | 3天 |
| AI经理详情页测试 | P2 | T-007完成后补充测试 | 0.5天 |

### 3.2 代码优化

| 项目 | 优先级 | 说明 | 预计工作量 |
|------|--------|------|-----------|
| AI经理详情页 | P1 | 完成收益曲线、持仓列表、交易记录 | 2天 |
| 图表组件集成 | P2 | 引入ucharts展示收益曲线 | 1天 |
| 错误边界处理 | P3 | 添加Vue错误边界组件 | 0.5天 |

---

## 四、未来规划（与架构演进相关）

### 4.1 短期（1-2周）

- [ ] 对接Backend排行榜API
- [ ] 对接Backend行情API
- [ ] 完成AI经理详情页
- [ ] 完善个人中心页

### 4.2 中期（1-2月）

- [ ] 补充单元测试覆盖
- [ ] 集成ucharts图表组件
- [ ] 性能优化（图片懒加载、虚拟滚动）

### 4.3 长期（3月+）

- [ ] 微信登录真机测试上线
- [ ] 实时行情WebSocket推送
- [ ] 消息推送通知
- [ ] 分享功能（收益海报、邀请好友）

---

## 五、外部依赖跟踪

| 依赖服务 | 所需功能 | 当前状态 | 跟进日期 |
|----------|---------|---------|---------|
| Backend | 微信登录API | 🔲 未开始 | - |
| Backend | 排行榜公开API | 🔲 未开始 | - |
| Backend | 行情公开API | 🔲 未开始 | - |
| Backend | 股票搜索API | 🔲 未开始 | - |

---

## 六、最近更新记录

| 日期 | 更新内容 | 更新人 |
|------|---------|--------|
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

## 七、文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 已完成功能 | `./HAVE_DONE.md` | 已完成功能与架构师评价 |
| 测试脚本 | `./TEST_SCRIPTS.md` | 测试脚本功能说明与索引 |
| 测试源码 | `../../../miniprogram/tests/` | E2E测试代码 |

---

*文档版本: v2.0（精简版）*
*最后更新: 2026-02-11*
*维护者: 首席架构师*

**提示：已完成功能详情和代码审查报告请查阅 [HAVE_DONE.md](./HAVE_DONE.md)**
