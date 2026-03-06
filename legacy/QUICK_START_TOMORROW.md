# 明日快速开始指南 - 全自动化开发测试

**日期**: 2026-02-26
**目标**: 完整测试自动化开发流程 + MCP 功能验证

---

## 第一步：打开 Git Bash

**不要**在 VS Code 终端或 Claude Code 中执行！

1. 在项目文件夹上右键 → **Git Bash Here**
2. 或从开始菜单打开 Git Bash，然后 `cd /c/dev/projects/stock-race`

---

## 第二步：检查环境

```bash
# 检查 Docker Desktop 是否运行
docker ps

# 检查微信开发者工具是否启动
# 手动打开微信开发者工具，确保项目已加载
```

---

## 第三步：运行单次模式测试

```bash
# 执行单次模式（自动处理一个任务后退出）
./scripts/auto/dev-loop.sh --once
```

**预期行为**:
1. 脚本读取 queue.json，找到 MINI-UC-V2-001
2. 启动新 Claude 会话
3. 执行智能体完成以下工作：
   - 创建 `miniprogram/src/utils/ucharts.ts`
   - 编写单元测试
   - 使用 MCP 编译验证
   - 使用 MCP 截图验证
4. 更新任务状态为 completed
5. 脚本退出

---

## 第四步：查看日志（如出现问题）

```bash
# 实时查看日志
tail -f logs/auto-dev/loop.log

# 查看执行日志
ls -la logs/auto-dev/execution_*.log
cat logs/auto-dev/execution_xxxxxxxx.log

# 查看报告
cat logs/auto-dev/reports/phase2_execution_report_20260225.md
```

---

## 第五步：批量测试（单次模式成功后）

```bash
# 先录入更多任务到 queue.json（手动编辑或使用 jq）

# 然后运行夜间模式（处理完所有任务后退出）
./scripts/auto/dev-loop.sh --night
```

---

## 常见问题

### Q1: 提示 "Claude Code cannot be launched inside another Claude Code session"
**原因**: 你在 VS Code 终端或 Claude Code 中运行了脚本
**解决**: 必须在 **Git Bash** 中直接执行

### Q2: MCP 连接失败
**检查**: 微信开发者工具是否启动？项目路径是否正确？
**解决**: 打开微信开发者工具，确保已加载 miniprogram 项目

### Q3: 编译失败
**检查**: 查看 `logs/auto-dev/errors/` 中的错误日志
**解决**: 根据错误信息修复代码，然后使用 resume-task.sh 恢复任务

---

## 任务队列当前状态

| 任务ID | 模块 | 优先级 | 状态 | MCP |
|--------|------|--------|------|-----|
| MINI-UC-V2-001 | miniprogram | P0 | pending | ✅ |

**任务描述**: 创建 uCharts v2.x 通用工具模块（解决白屏问题）

---

## 相关文档

- [执行报告](logs/auto-dev/reports/phase2_execution_report_20260225.md)
- [自动化开发使用指南](docs/agents/AUTO_DEV_USAGE_GUIDE.md)
- [MCP 使用指南](docs/modules/miniprogram/MCP_GUIDE.md)
- [任务队列](tasks/queue.json)

---

**执行前必读**: 确保在 Git Bash 中执行，不要在 Claude Code 会话中运行！
