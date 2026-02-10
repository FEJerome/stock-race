# Miniprogram 测试脚本文档

**文档用途**: 记录所有测试脚本的功能、覆盖范围和文件位置，供架构师查阅和检验。

**维护者**: Miniprogram开发团队

**最后更新**: 2026-02-10

---

## 测试脚本目录结构

```
miniprogram/tests/
├── e2e/                           # 端到端测试
│   └── guest-mode.test.ts         # [T-011] 游客模式E2E测试
└── README.md                      # 测试目录说明
```

---

## 测试脚本详情

### 1. 游客模式 E2E 测试

**文件位置**: `miniprogram/tests/e2e/guest-mode.test.ts`

**关联功能**: [T-011] 游客模式改造 (Phase 6)

**测试目标**: 验证游客可以无需登录访问小程序，仅在需要时触发登录

**测试范围**:
- 首页、排行榜、行情页（公开数据）
- 需要登录的敏感操作（创建AI经理、查看持仓等）
- 微信授权登录流程
- 游客模式状态管理
- API权限控制

**测试覆盖用例**:

| 用例ID | 用例名称 | 测试目的 | 预期结果 |
|--------|----------|----------|----------|
| TC-GUEST-001 | 游客访问首页 | 验证未登录用户可进入首页 | 不触发登录页重定向，显示游客UI |
| TC-GUEST-002 | 游客访问排行榜 | 验证游客可查看公开排行榜 | 正常显示排行榜数据 |
| TC-GUEST-003 | 游客访问行情页 | 验证游客可查看股票行情 | 正常显示行情数据，支持搜索 |
| TC-GUEST-004 | 游客访问受限功能 | 验证敏感操作需要登录 | 点击创建AI经理时提示登录 |
| TC-GUEST-005 | 用户主动登录流程 | 验证微信授权登录流程 | 成功获取code和用户信息，切换用户模式 |
| TC-GUEST-006 | 游客模式状态管理 | 验证状态持久化 | 正确识别游客状态，退出后恢复游客模式 |
| TC-GUEST-007 | API权限控制测试 | 验证API访问权限 | 公开API无需token，私有API返回401 |

**Mock数据**:
- 模拟排行榜数据（3条记录）
- 模拟行情数据（平安银行、万科A）
- 模拟游客模式响应
- 模拟微信登录和获取用户信息接口

**运行方式**:
```bash
cd miniprogram
npm run test:e2e
# 或
npx vitest run tests/e2e/guest-mode.test.ts
```

**依赖**:
- vitest (测试框架)
- @vue/test-utils (Vue组件测试工具)

---

## 测试规范

### 命名规范

- **E2E测试文件**: `{feature-name}.test.ts`
- **测试描述**: `TC-{FEATURE}-{XXX}: {描述}`
- **Mock数据**: `mock{DataName}`

### 测试编写原则

1. **独立性**: 每个测试用例应独立运行，不依赖其他测试
2. **可重复性**: 测试应可在任何环境重复执行
3. **清晰性**: 测试描述应清晰表达测试目的
4. **覆盖率**: 核心功能应覆盖正常流程和异常流程

### Mock规范

```typescript
// 统一Mock uni 接口
const mockUni = {
  storage: {} as Record<string, any>,
  navigateTo(options: { url: string }) { ... },
  redirectTo(options: { url: string }) { ... },
  switchTab(options: { url: string }) { ... },
  getStorageSync(key: string) { ... },
  setStorageSync(key: string, value: any) { ... },
  showToast(options: { title: string }) { ... },
  login(options: { provider: string }) { ... },
  getUserInfo(options: any) { ... },
}
```

---

## 测试与开发对应关系

| 开发条目 | 测试文件 | 测试类型 | 状态 |
|----------|----------|----------|------|
| [T-001] 项目脚手架 | - | - | 无测试 |
| [T-002] HTTP请求封装 | - | - | 无测试 |
| [T-003] Pinia状态管理 | - | - | 无测试 |
| [T-004] 微信登录 | - | - | 无测试 |
| [T-005] AI账户列表 | - | - | 无测试 |
| [T-006] AI账户创建 | - | - | 无测试 |
| [T-007] AI账户详情 | - | - | 无测试 |
| [T-008] 收益排行榜 | - | - | 无测试 |
| [T-009] 股票行情 | - | - | 无测试 |
| [T-010] 个人中心 | - | - | 无测试 |
| [T-011] 游客模式 | `e2e/guest-mode.test.ts` | E2E测试 | 已完成 |

---

## 持续集成建议

```yaml
# .github/workflows/miniprogram-test.yml 示例
name: Miniprogram Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd miniprogram && npm ci
      - run: cd miniprogram && npm run test:e2e
```

---

## 备注

- 当前测试覆盖主要集中在[T-011]游客模式功能
- 历史功能（T-001至T-010）测试待补充
- 建议后续为核心页面补充单元测试

*文档版本: 1.0*
