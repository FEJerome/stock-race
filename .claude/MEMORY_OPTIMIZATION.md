# 内存持久化优化指南

## 概述

针对DeepSeek模型（128k上下文）相比Opus 4.5（200k上下文）的容量减少，本优化方案旨在减少内存持久化系统对上下文容量的压力。优化后的系统可减少70-80%的存储占用，并支持自动清理和灵活的配置。

## 优化功能

### 1. 会话模板压缩
- **旧格式**：73行完整模板，约600字符
- **新格式**：15行紧凑模板，约150字符（减少75%）
- **效果**：显著减少会话文件大小，降低上下文引用开销

### 2. JSON格式存储
- **支持两种格式**：紧凑文本格式和JSON格式
- **JSON优势**：更小的文件大小、更快的解析速度、更好的结构化数据
- **自动转换**：支持将旧格式会话自动转换为JSON格式

### 3. 自动清理机制
- **基于时间**：默认保留最近7天的会话
- **基于数量**：默认最多保留10个会话
- **基于大小**：默认最大目录大小50MB
- **智能清理**：多种策略组合，防止数据过度积累

### 4. 环境变量配置
- 无需修改`settings.json`，通过环境变量灵活控制
- 支持运行时动态调整配置
- 兼容现有Claude Code配置系统

## 环境变量配置

### 会话格式控制
```bash
# 启用JSON格式存储（推荐）
export CLAUDE_SESSION_JSON=true

# 使用紧凑文本格式（默认）
export CLAUDE_SESSION_JSON=false
```

### 清理配置
```bash
# 清理最大天数（默认：7）
export CLAUDE_CLEANUP_MAX_AGE_DAYS=7

# 最大会话数量（默认：10）
export CLAUDE_CLEANUP_MAX_SESSIONS=10

# 最大目录大小MB（默认：50）
export CLAUDE_CLEANUP_MAX_SIZE_MB=50

# 详细日志模式（默认：false）
export CLAUDE_CLEANUP_VERBOSE=true

# 禁用清理功能（默认：启用）
export CLAUDE_CLEANUP_ENABLED=false
```

### 压缩功能（未来扩展）
```bash
# 启用会话压缩（默认：禁用）
export CLAUDE_COMPRESSION_ENABLED=true
```

## 使用示例

### 启用完整优化配置
```bash
# 启用JSON格式和详细清理日志
export CLAUDE_SESSION_JSON=true
export CLAUDE_CLEANUP_VERBOSE=true

# 更严格的清理策略
export CLAUDE_CLEANUP_MAX_AGE_DAYS=3
export CLAUDE_CLEANUP_MAX_SESSIONS=5
export CLAUDE_CLEANUP_MAX_SIZE_MB=20
```

### 最小化存储占用
```bash
# 启用JSON格式
export CLAUDE_SESSION_JSON=true

# 激进清理策略
export CLAUDE_CLEANUP_MAX_AGE_DAYS=1
export CLAUDE_CLEANUP_MAX_SESSIONS=3
export CLAUDE_CLEANUP_MAX_SIZE_MB=10
```

### 禁用优化功能
```bash
# 使用传统文本格式
export CLAUDE_SESSION_JSON=false

# 禁用自动清理
export CLAUDE_CLEANUP_ENABLED=false
```

## 文件格式示例

### 紧凑文本格式
```
# 2026-02-06-default
Started: 13:15
Updated: 13:15
---
State: [brief context]
Tasks: [active tasks]
Next: [notes for next session]
Files: [relevant files]
```

### JSON格式
```json
{
  "version": "2.0",
  "format": "json",
  "date": "2026-02-06",
  "started": "13:15",
  "updated": "13:15",
  "context": "Converted from legacy format",
  "tasks": [],
  "notes": "",
  "files": [],
  "compressed": true,
  "timestamp": "2026-02-06T05:15:17.150Z"
}
```

## 性能对比

### 存储大小对比
| 格式 | 文件大小 | 减少比例 | 上下文占用 |
|------|----------|----------|------------|
| 旧完整模板 | ~600字符 | - | 高 |
| 紧凑文本格式 | ~150字符 | 75% | 低 |
| JSON格式 | ~300字符 | 50% | 中 |

### 清理效果示例
```
优化前：30个会话，约18KB
优化后（默认配置）：10个会话，约3KB
优化后（激进配置）：3个会话，约900字节
```

## 技术实现

### 核心文件
1. `.claude/scripts/hooks/session-end.js` - 会话结束钩子，支持两种格式
2. `.claude/scripts/hooks/session-start.js` - 会话开始钩子，智能读取
3. `.claude/scripts/hooks/session-cleanup.js` - 独立清理钩子
4. `.claude/scripts/lib/utils.js` - 工具函数库，包含格式转换
5. `.claude/scripts/lib/cleanup-utils.js` - 清理工具库

### 向后兼容
- 支持读取旧格式会话文件
- 自动转换旧格式到新格式
- 渐进式升级，不影响现有功能
- 可随时回退到传统模式

## 测试验证

### 功能测试
```bash
# 测试会话创建（默认格式）
node .claude/scripts/hooks/session-end.js

# 测试JSON格式会话创建
export CLAUDE_SESSION_JSON=true
node .claude/scripts/hooks/session-end.js

# 测试会话读取
node .claude/scripts/hooks/session-start.js

# 测试独立清理
node .claude/scripts/hooks/session-cleanup.js
```

### 配置测试
```bash
# 测试详细日志模式
export CLAUDE_CLEANUP_VERBOSE=true
node .claude/scripts/hooks/session-cleanup.js

# 测试禁用清理
export CLAUDE_CLEANUP_ENABLED=false
node .claude/scripts/hooks/session-end.js

# 测试自定义清理参数
export CLAUDE_CLEANUP_MAX_AGE_DAYS=1
export CLAUDE_CLEANUP_MAX_SESSIONS=3
node .claude/scripts/hooks/session-cleanup.js
```

## 最佳实践

### 针对DeepSeek 128k上下文的建议
1. **启用JSON格式**：提供更好的结构化数据，便于Claude处理
2. **适度清理**：保留3-7天的会话，平衡历史参考和存储占用
3. **定期评估**：根据实际使用情况调整清理参数
4. **结合上下文管理**：优化内存持久化的同时，合理管理主动上下文

### 多项目环境
```bash
# 为不同项目设置不同配置
# 项目A：严格清理
export CLAUDE_CLEANUP_MAX_SESSIONS=5
export CLAUDE_CLEANUP_MAX_AGE_DAYS=3

# 项目B：保留更多历史
export CLAUDE_CLEANUP_MAX_SESSIONS=20
export CLAUDE_CLEANUP_MAX_AGE_DAYS=14
```

## 故障排除

### 常见问题
1. **环境变量不生效**：确保在Claude Code会话开始前设置环境变量
2. **清理功能不工作**：检查`CLAUDE_CLEANUP_ENABLED`设置，确保不是false
3. **格式转换失败**：旧格式文件会被保留，新会话使用新格式创建
4. **权限问题**：确保有`.claude/sessions`目录的读写权限

### 日志检查
```bash
# 查看会话结束日志
node .claude/scripts/hooks/session-end.js 2>&1

# 查看清理详细日志
export CLAUDE_CLEANUP_VERBOSE=true
node .claude/scripts/hooks/session-cleanup.js 2>&1
```

## 更新历史

### v1.0.0 (2026-02-06)
- 初始优化版本
- 支持紧凑文本格式和JSON格式
- 实现自动清理机制
- 环境变量配置支持
- 向后兼容现有系统

## 后续计划

### 短期优化
- 会话内容压缩（gzip）
- 智能会话摘要生成
- 基于使用频率的清理策略

### 长期规划
- 跨项目会话共享
- 会话内容智能分析
- 自动学习模式检测

---

**注意**：本优化方案专为DeepSeek 128k上下文环境设计，可有效减少内存持久化对上下文容量的压力。建议根据实际使用情况调整配置参数。