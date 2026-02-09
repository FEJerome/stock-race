# 内存持久化优化指南

## 概述

针对DeepSeek模型（128k上下文）相比Opus 4.5（200k上下文）的容量减少，本优化方案旨在减少内存持久化系统对上下文容量的压力。优化后的系统可减少70-80%的存储占用，并支持自动清理和灵活的配置。

## 优化功能

### 1. 会话模板压缩
- **旧格式**：73行完整模板，约600字符
- **新格式**：15行紧凑模板，约150字符（减少75%）
- **效果**：显著减少会话文件大小，降低上下文引用开销

### 2. 紧凑文本格式存储
- **单一格式**：只使用紧凑文本格式，避免内存溢出问题
- **文本优势**：内存安全、简单可靠、适合虚拟机环境
- **向后兼容**：支持读取旧格式会话文件

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

### 格式说明
- **当前只支持紧凑文本格式**：JSON格式已禁用，无需配置格式切换
- **内存安全优先**：针对虚拟机内存溢出问题专门优化

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
# 启用详细清理日志
export CLAUDE_CLEANUP_VERBOSE=true

# 更严格的清理策略
export CLAUDE_CLEANUP_MAX_AGE_DAYS=3
export CLAUDE_CLEANUP_MAX_SESSIONS=5
export CLAUDE_CLEANUP_MAX_SIZE_MB=20
```

### 最小化存储占用
```bash
# 激进清理策略（适合DeepSeek 128k上下文）
export CLAUDE_CLEANUP_MAX_AGE_DAYS=1
export CLAUDE_CLEANUP_MAX_SESSIONS=3
export CLAUDE_CLEANUP_MAX_SIZE_MB=10
```

### 禁用优化功能
```bash
# 禁用自动清理（不推荐）
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

### 紧凑文本格式（当前唯一支持格式）
```
# 2026-02-06-20260206-abc123
Started: 13:15
Updated: 13:15
---
State: [brief context]
Tasks: [active tasks]
Next: [notes for next session]
Files: [relevant files]
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
1. **使用紧凑文本格式**：内存安全、文件小巧，适合128k上下文容量限制
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

## 连续学习与智能优化功能

### 1. 智能压缩建议
基于标杆项目（everything-claude-code）的智能压缩建议系统，在合理时机建议手动压缩，避免自动压缩打断工作流。

**功能特点**：
- **阈值触发**：默认50次工具调用后建议压缩
- **阶段感知**：识别探索、执行、测试、优化阶段
- **时机优化**：在阶段转换时建议压缩，保护上下文连续性
- **用户可控**：环境变量调整敏感度和行为

**环境变量配置**：
```bash
# 压缩阈值（默认：50）
export CLAUDE_COMPACT_THRESHOLD=50

# 检查间隔（默认：25）
export CLAUDE_COMPACT_CHECK_INTERVAL=25

# 阶段感知（默认：启用）
export CLAUDE_COMPACT_PHASE_AWARE=true

# 详细模式（默认：禁用）
export CLAUDE_COMPACT_VERBOSE=false
```

### 2. 连续学习与模式检测
从会话中提取可重用模式，建立知识库，支持8种模式类型检测。

**检测模式类型**：
1. `error_resolution` - 错误解决模式
2. `user_corrections` - 用户纠正模式
3. `workarounds` - 变通方案模式
4. `debugging_techniques` - 调试技术模式
5. `project_specific` - 项目特定模式
6. `architecture_decisions` - 架构决策模式
7. `tool_usage_patterns` - 工具使用模式
8. `code_review_patterns` - 代码审查模式

**配置示例**（`.claude/skills/continuous-learning/config.json`）：
```json
{
  "min_session_length": 10,
  "extraction_threshold": "medium",
  "auto_approve": false,
  "learned_skills_path": "~/.claude/skills/learned/",
  "patterns_to_detect": [
    "error_resolution",
    "user_corrections",
    "workarounds",
    "debugging_techniques",
    "project_specific",
    "architecture_decisions",
    "tool_usage_patterns",
    "code_review_patterns"
  ]
}
```

### 3. 性能监控系统
全面监控钩子执行性能，支持执行时间、内存使用、成功率跟踪。

**核心功能**：
- **全面监控**：执行时间、内存使用、成功率
- **趋势分析**：按日统计，识别性能变化
- **阈值告警**：超时、高内存使用告警
- **自动清理**：定期清理旧性能数据

**使用方法**：
```bash
# 查看性能统计（最近7天）
node -e "const pm = require('./.claude/scripts/lib/performance-monitor'); console.log(JSON.stringify(pm.PerformanceMonitor.getOverallStats(7), null, 2))"

# 清理旧性能数据（保留30天）
node -e "const pm = require('./.claude/scripts/lib/performance-monitor'); console.log('Deleted:', pm.PerformanceMonitor.cleanupOldStats(30))"
```

### 4. 测试工具
完整的测试套件，确保功能可靠性和稳定性。

**快速测试**：
```bash
# 快速功能测试
node .claude/scripts/tools/quick-test.js

# 完整集成测试
node .claude/scripts/tools/test-integration.js --verbose

# 测试特定功能
node .claude/scripts/tools/test-integration.js --hook session-end --hook evaluate-session
```

### 5. 与标杆项目的对比提升
| 功能维度 | 标杆项目 | 当前项目实现 | 提升点 |
|----------|----------|--------------|--------|
| **智能提取** | 基础模式检测 | 增强模式检测（8种模式） | 更全面的模式识别 |
| **配置灵活性** | 固定配置 | 可配置检测级别和模式 | 更高灵活性 |
| **性能监控** | 无 | 完整的性能监控系统 | 系统可观测性 |
| **测试工具** | 无 | 完整集成测试套件 | 更好的可测试性 |
| **DeepSeek优化** | 无 | 专门针对128k上下文优化 | 更好的容量适应性 |
| **模型感知配置** | 无 | 支持不同模型容量的自动优化 | 无缝模型切换 |

## 模型切换配置指南

### 概述
系统现在支持根据AI模型的上下文容量自动调整优化策略。通过简单的环境变量配置，可以在DeepSeek（128k）、GLM 4.7（200k）、Kimi K2.5（256k）等不同模型间无缝切换，无需手动调整清理参数和压缩阈值。

### 核心环境变量

#### 1. 模型容量配置（推荐）
```bash
# 方法1：直接指定上下文容量（单位：千token）
export CLAUDE_MODEL_CONTEXT_SIZE=128    # DeepSeek 128k
export CLAUDE_MODEL_CONTEXT_SIZE=200    # GLM 4.7 200k
export CLAUDE_MODEL_CONTEXT_SIZE=256    # Kimi K2.5 256k

# 方法2：指定模型类型（自动推断容量）
export CLAUDE_MODEL_TYPE=deepseek       # 自动应用128k优化
export CLAUDE_MODEL_TYPE=glm           # 自动应用200k优化
export CLAUDE_MODEL_TYPE=kimi          # 自动应用256k优化
export CLAUDE_MODEL_TYPE=opus          # 自动应用200k优化
```

#### 2. 优化策略配置
```bash
# 优化策略（默认为balanced）
export CLAUDE_OPTIMIZATION_PROFILE=aggressive   # 激进优化，最小化存储占用
export CLAUDE_OPTIMIZATION_PROFILE=balanced     # 平衡优化（默认）
export CLAUDE_OPTIMIZATION_PROFILE=relaxed      # 宽松优化，保留更多历史

# 组合使用示例
export CLAUDE_MODEL_CONTEXT_SIZE=128
export CLAUDE_OPTIMIZATION_PROFILE=aggressive   # DeepSeek 128k + 激进优化
```

### 不同模型的默认配置

| 模型/容量 | 清理策略 | 压缩阈值 | 适用场景 |
|-----------|----------|----------|----------|
| **DeepSeek 128k** | 保留3天，最多5个会话，最大20MB | 40次工具调用 | 小容量模型，需要严格管理上下文 |
| **GLM 4.7 200k** | 保留7天，最多12个会话，最大50MB | 50次工具调用 | 标准200k容量，平衡历史与性能 |
| **Kimi K2.5 256k** | 保留10天，最多15个会话，最大80MB | 60次工具调用 | 大容量模型，可保留更多历史 |
| **超256k模型** | 保留14天，最多20个会话，最大100MB | 70次工具调用 | 超大容量，最大化历史参考 |

### 配置示例

#### 示例1：DeepSeek 128k环境
```bash
# 最简配置 - 只指定模型类型
export CLAUDE_MODEL_TYPE=deepseek

# 等价于
export CLAUDE_MODEL_CONTEXT_SIZE=128
export CLAUDE_CLEANUP_MAX_AGE_DAYS=3
export CLAUDE_CLEANUP_MAX_SESSIONS=5
export CLAUDE_CLEANUP_MAX_SIZE_MB=20
export CLAUDE_COMPACT_THRESHOLD=40
export CLAUDE_COMPACT_CHECK_INTERVAL=20
```

#### 示例2：GLM 4.7 200k环境
```bash
# 使用模型类型自动配置
export CLAUDE_MODEL_TYPE=glm
export CLAUDE_OPTIMIZATION_PROFILE=balanced

# 或手动指定容量
export CLAUDE_MODEL_CONTEXT_SIZE=200
```

#### 示例3：Kimi K2.5 256k环境
```bash
# 大容量模型使用宽松配置
export CLAUDE_MODEL_TYPE=kimi
export CLAUDE_OPTIMIZATION_PROFILE=relaxed

# 生成的配置：
# - 保留10天历史，最多15个会话
# - 压缩阈值60次工具调用
# - 支持更多历史参考
```

#### 示例4：混合配置（高级）
```bash
# 使用模型感知配置，但手动覆盖特定参数
export CLAUDE_MODEL_CONTEXT_SIZE=200
export CLAUDE_OPTIMIZATION_PROFILE=aggressive
export CLAUDE_CLEANUP_MAX_SESSIONS=8      # 覆盖自动配置
export CLAUDE_COMPACT_THRESHOLD=45        # 覆盖自动配置
```

### 配置优先级说明
系统按以下优先级应用配置（从高到低）：
1. **直接环境变量**：`CLAUDE_CLEANUP_MAX_SESSIONS`等具体参数（最高优先级）
2. **优化策略**：`CLAUDE_OPTIMIZATION_PROFILE`（激进/平衡/宽松）
3. **模型类型**：`CLAUDE_MODEL_TYPE`（deepseek/glm/kimi/opus）
4. **上下文容量**：`CLAUDE_MODEL_CONTEXT_SIZE`（128/200/256等）
5. **系统默认**：平衡优化配置（最低优先级）

### 验证配置
```bash
# 查看当前模型感知配置
node -e "const utils = require('./.claude/scripts/lib/utils'); console.log(JSON.stringify(utils.getModelAwareConfig(), null, 2))"

# 测试不同配置
export CLAUDE_MODEL_TYPE=deepseek
node -e "const utils = require('./.claude/scripts/lib/utils'); console.log('DeepSeek配置:', JSON.stringify(utils.getModelAwareConfig().model, null, 2))"

export CLAUDE_MODEL_TYPE=kimi
export CLAUDE_OPTIMIZATION_PROFILE=relaxed
node -e "const utils = require('./.claude/scripts/lib/utils'); console.log('Kimi配置:', JSON.stringify(utils.getModelAwareConfig().model, null, 2))"
```

### 最佳实践
1. **新模型适配**：切换模型时，只需设置`CLAUDE_MODEL_TYPE`或`CLAUDE_MODEL_CONTEXT_SIZE`
2. **项目特定配置**：为不同项目创建环境变量配置文件
3. **渐进调整**：先从平衡配置开始，根据实际使用情况调整
4. **监控效果**：定期检查会话文件大小和数量，确保配置合理

### 故障排除
1. **环境变量不生效**：确保在Claude Code会话开始前设置环境变量
2. **配置冲突**：直接环境变量（如`CLAUDE_CLEANUP_MAX_SESSIONS`）会覆盖自动配置
3. **未知模型类型**：使用`CLAUDE_MODEL_CONTEXT_SIZE`替代`CLAUDE_MODEL_TYPE`
4. **验证配置**：使用上述验证命令检查实际应用的配置

## 更新历史

### v1.1.0 (2026-02-07)
- **彻底禁用JSON格式**：针对虚拟机内存溢出问题，完全移除JSON格式支持
- **删除相关代码**：删除所有JSON格式处理函数，避免废弃代码残留
- **简化会话处理**：只保留紧凑文本格式，提高内存安全性
- **修复会话命名**：修复同一天内会话文件被覆盖的问题
- **优化虚拟机兼容**：专门针对DeepSeek 128k上下文和虚拟机环境优化

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