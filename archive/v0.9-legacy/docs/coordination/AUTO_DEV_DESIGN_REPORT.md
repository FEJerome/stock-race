# 自动化开发系统设计方案报告

> **文档用途**: 为虚拟机智能体提供自动化开发系统的完整设计方案
> **设计者**: 首席架构师
> **创建日期**: 2026-02-15
> **目标**: 实现无人值守的线性自动化开发，保留模块化优势，支持人工干预

---

## 📋 目录

1. [需求分析](#需求分析)
2. [方案设计理念](#方案设计理念)
3. [系统架构设计](#系统架构设计)
4. [工作流程设计](#工作流程设计)
5. [核心优势分析](#核心优势分析)
6. [技术实现细节](#技术实现细节)
7. [人工干预机制](#人工干预机制)
8. [文件结构设计](#文件结构设计)
9. [使用指南](#使用指南)
10. [注意事项](#注意事项)
11. [与原方案对比](#与原方案对比)
12. [实施建议](#实施建议)

---

## 需求分析

### 用户背景

1. **个人开发团队**
   - 只有一个开发者
   - 无法同时管理多个智能体的协调工作
   - 需要降低开发复杂度

2. **现有项目特点**
   - 6个独立服务模块（backend、frontend、infra、market-data-service、news-service、trading-ai-service、miniprogram）
   - 每个模块3个文档（TODO.md、TEST_SCRIPTS.md、HAVE_DONE.md）
   - 共18个文档需要维护
   - 模块职责边界清晰

3. **现有方案问题**
   - 任务派发模式需要协调智能体管理多个智能体状态
   - 模块间协调复杂，容易混乱
   - 无法在开发者不在计算机旁时持续开发
   - 夜间10小时无法充分利用

### 核心需求

#### 需求1：保留模块化优势
- ✅ 保留6个模块的独立维护
- ✅ 保留每个模块3个文档的结构
- ✅ 保留模块职责边界

#### 需求2：上下文限制优化
- ✅ 每次只加载当前模块的3个文档
- ✅ 避免上下文超限
- ✅ 降低Token消耗

#### 需求3：全自动化执行
- ✅ 脚本循环执行任务队列
- ✅ 无需人工干预
- ✅ 适合夜间/无人值守开发（10小时持续）

#### 需求4：线性流程简化
- ✅ 无需复杂的并行协调
- ✅ 无需处理代码冲突
- ✅ 降低个人开发复杂度

#### 需求5：任务队列管理
- ✅ 统一管理所有待开发任务
- ✅ 按优先级和依赖关系排序
- ✅ 实时跟踪任务状态

#### 需求6：人工干预机制
- ✅ 自动记录阻塞任务
- ✅ 详细记录阻塞原因
- ✅ 集中处理阻塞任务
- ✅ 不中断自动化流程
- ✅ 支持任务恢复执行

---

## 方案设计理念

### 核心思想

**"任务队列 + 模块化上下文 + 人工干预"** 混合方案

结合**任务派发模式**、**线性流程模式**和**人工干预机制**的优势：

```
任务派发模式的优势：
  ✅ 模块化清晰
  ✅ 职责边界明确
  ✅ 上下文限制

线性流程模式的优势：
  ✅ 全自动化执行
  ✅ 线性流程简单
  ✅ 无人值守开发

人工干预机制的优势：
  ✅ 不中断自动化流程
  ✅ 集中处理阻塞任务
  ✅ 提供合理的人工干预途径

混合方案 = 任务派发模式的模块化 + 线性流程的自动化 + 人工干预的灵活性
```

### 设计原则

1. **模块化优先**
   - 保留6个模块的独立维护
   - 保留每个模块3个文档的结构
   - 模块职责边界清晰

2. **上下文限制**
   - 每次只加载当前模块的3个文档
   - 避免上下文超限
   - 降低Token消耗

3. **全自动化**
   - 脚本循环执行任务队列
   - 无需人工干预
   - 适合夜间/无人值守开发

4. **线性流程**
   - 无需复杂的并行协调
   - 无需处理代码冲突
   - 降低个人开发复杂度

5. **任务驱动**
   - 统一任务队列管理
   - 按优先级和依赖关系排序
   - 实时跟踪任务状态

6. **人工辅助**
   - 自动记录阻塞任务
   - 集中处理阻塞任务
   - 不中断自动化流程

---

## 系统架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    自动化开发系统                            │
├─────────────────────────────────────────────────────────────────┤
│                                                           │
│  1. 任务队列层 (TASK_QUEUE.md)                             │
│     - 统一管理所有待开发任务                                │
│     - 按优先级和依赖关系排序                                │
│     - 实时跟踪任务状态                                      │
│     - 提供脚本可解析的标准化格式                              │
│                                                           │
│  2. 自动化脚本层 (scripts/auto-dev/)                       │
│     - get-next-task.sh: 获取下一个任务                       │
│     - update-task-status.sh: 更新任务状态                    │
│     - get-module-docs.sh: 获取模块文档                      │
│     - auto-dev-loop.sh: 主循环脚本                           │
│     - import-tasks-from-modules.sh: 批量导入任务              │
│     - record-blocked-task.sh: 记录阻塞任务                   │
│     - resolve-intervention.sh: 解决阻塞任务                  │
│                                                           │
│  3. 模块文档层 (docs/modules/)                             │
│     - 6个模块 × 3个文档 = 18个文档                        │
│     - TODO.md: 待开发任务                                   │
│     - TEST_SCRIPTS.md: 测试脚本                             │
│     - HAVE_DONE.md: 已完成功能                               │
│                                                           │
│  4. 人工干预层 (MANUAL_INTERVENTION.md)                    │
│     - 记录阻塞任务                                          │
│     - 按优先级排序                                          │
│     - 提供处理建议                                          │
│     - 跟踪处理状态                                          │
│                                                           │
│  5. 执行引擎层 (Claude Code)                              │
│     - 读取任务信息和模块文档                                 │
│     - 执行开发任务                                          │
│     - 更新模块文档                                          │
│                                                           │
│  6. 日志记录层 (logs/)                                     │
│     - 记录所有执行日志                                      │
│     - 支持实时监控                                          │
│     - 便于问题排查                                          │
│                                                           │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

```
1. 脚本启动
   ↓
2. 读取 TASK_QUEUE.md
   ↓
3. 解析任务列表，按优先级和依赖关系排序
   ↓
4. 获取下一个待执行任务
   ↓
5. 识别任务所属模块
   ↓
6. 加载模块的3个文档
   (TODO.md + TEST_SCRIPTS.md + HAVE_DONE.md)
   ↓
7. 构建任务提示词
   ↓
8. 调用 Claude Code 执行任务
   ↓
9. Claude Code 读取任务信息和模块文档
   ↓
10. Claude Code 执行开发任务
    ↓
11. Claude Code 更新模块文档
    ↓
12. 判断执行结果
    ├─ 成功 → 更新任务状态为 completed
    ├─ 失败（阻塞） → 记录到人工干预清单，更新任务状态为 blocked，继续下一个任务
    └─ 失败（普通） → 更新任务状态为 failed
    ↓
13. 记录执行日志
    ↓
14. 检查是否还有任务
    ├─ 是 → 返回步骤4
    └─ 否 → 结束
```

---

## 工作流程设计

### 主循环流程

```
开始
  ↓
初始化配置
  - 读取命令行参数
  - 设置日志文件
  - 验证环境
  ↓
主循环（直到达到最大迭代次数或没有任务）
  ↓
  ├─ 获取下一个待执行任务
  │   ├─ 读取 TASK_QUEUE.md
  │   ├─ 按优先级排序（P0 > P1 > P2 > P3）
  │   ├─ 检查依赖关系
  │   └─ 返回第一个可执行的任务
  │   ↓
  ├─ 识别任务所属模块
  │   └─ 从任务信息中提取 module 字段
  │   ↓
  ├─ 加载模块文档
  │   ├─ 调用 get-module-docs.sh
  │   ├─ 返回3个文档路径
  │   └─ 验证文档存在性
  │   ↓
  ├─ 更新任务状态为 in_progress
  │   └─ 调用 update-task-status.sh
  │   ↓
  ├─ 执行任务
  │   ├─ 构建任务提示词
  │   ├─ 调用 Claude Code
  │   ├─ 记录执行时间
  │   └─ 捕获执行结果
  │   ↓
  ├─ 处理执行结果
  │   ├─ 成功 → 更新状态为 completed
  │   ├─ 失败（阻塞） → 记录到人工干预清单，更新状态为 blocked
  │   └─ 失败（普通） → 更新状态为 failed，记录错误信息
  │   ↓
  ├─ 等待任务间隔时间
  │   └─ 可配置（默认60秒）
  │   ↓
  └─ 继续下一个任务
  ↓
结束
  - 生成执行报告
  - 输出统计信息
  - 关闭日志文件
```

### 任务执行流程

```
Claude Code 接收任务
  ↓
读取任务信息
  - task_id
  - title
  - module
  - description
  - acceptance_criteria
  ↓
读取模块文档
  - TODO.md（了解待开发任务）
  - TEST_SCRIPTS.md（了解测试要求）
  - HAVE_DONE.md（了解已完成功能）
  ↓
分析任务
  - 理解任务需求
  - 查看验收标准
  - 了解模块当前状态
  ↓
执行开发
  - 编写代码
  - 运行测试
  - 更新文档
  ↓
验证结果
  - 检查验收标准
  - 运行测试脚本
  - 确认功能正常
  ↓
更新模块文档
  - TODO.md：标记任务为已完成
  - TEST_SCRIPTS.md：添加测试脚本（如有）
  - HAVE_DONE.md：记录已完成功能
  ↓
返回执行结果
  - 成功/失败
  - 执行时间
  - 错误信息（如有）
```

### 人工干预流程

```
自动化开发发现阻塞任务
  ↓
判断是否需要人工干预
  ├─ 需求不明确 → 是
  ├─ 技术决策 → 是
  ├─ 依赖配置 → 是
  ├─ 架构问题 → 是
  ├─ 环境问题 → 是
  ├─ API问题 → 是
  └─ 代码错误 → 否（普通失败）
  ↓
记录到人工干预清单
  - 生成干预ID
  - 记录阻塞原因
  - 记录阻塞描述
  - 提供处理建议
  ↓
更新任务状态为 blocked
  ↓
继续执行下一个任务（不中断自动化）
  ↓
第二天早上
  ↓
人工查看人工干预清单
  ↓
按优先级处理阻塞任务
  ├─ P0任务（紧急）
  ├─ P1任务（高优先级）
  └─ P2/P3任务（中低优先级）
  ↓
执行人工操作
  ├─ 确认需求
  ├─ 选择技术方案
  ├─ 配置依赖
  ├─ 评审架构
  ├─ 修复环境
  └─ 处理API问题
  ↓
更新任务描述
  ↓
解决干预任务
  - 更新干预状态为 resolved
  - 记录解决方案
  ↓
恢复任务执行
  - 更新任务状态为 pending
  - 或重新启动自动化开发
```

---

## 核心优势分析

### 优势1：保留模块化优势

**说明**：
- 6个模块独立维护（backend、frontend、infra等）
- 每个模块3个文档（TODO/TEST_SCRIPTS/HAVE_DONE）
- 模块职责边界清晰

**对比原方案**：
- ✅ 与原方案相同，保留模块化结构
- ✅ 无需重构现有文档体系
- ✅ 降低迁移成本

**优势**：
- 模块职责清晰，易于维护
- 新开发者容易理解项目结构
- 便于团队协作（如果需要）

### 优势2：上下文限制优化

**说明**：
- 每次只加载当前模块的3个文档
- 避免上下文超限
- 降低Token消耗

**对比原方案**：
- ✅ 与原方案相同，保留上下文限制策略
- ✅ 每个智能体只了解自己模块的上下文
- ✅ 避免全局上下文加载

**优势**：
- 降低Token消耗
- 提高响应速度
- 避免上下文超限错误

### 优势3：全自动化执行

**说明**：
- 脚本循环执行任务队列
- 无需人工干预
- 适合夜间/无人值守开发

**对比原方案**：
- ❌ 原方案需要协调智能体管理多个智能体
- ✅ 新方案无需人工干预
- ✅ 可以在开发者不在时持续开发

**优势**：
- 夜间10小时可以充分利用
- 无需人工监控
- 提高开发效率

### 优势4：线性流程简化

**说明**：
- 无需复杂的并行协调
- 无需处理代码冲突
- 降低个人开发复杂度

**对比原方案**：
- 🔴 原方案需要协调智能体管理4个并行智能体
- 🔴 原方案需要处理模块间代码冲突
- 🟢 新方案线性执行，无需协调

**优势**：
- 降低个人开发复杂度
- 无需处理代码冲突
- 流程简单易懂

### 优势5：任务队列管理

**说明**：
- 统一管理所有待开发任务
- 按优先级和依赖关系排序
- 实时跟踪任务状态

**对比原方案**：
- ❌ 原方案任务分散在6个模块的TODO.md中
- ✅ 新方案统一在TASK_QUEUE.md中管理
- ✅ 便于查看全局任务状态

**优势**：
- 全局任务视图
- 优先级管理
- 依赖关系管理

### 优势6：人工干预机制

**说明**：
- 自动记录阻塞任务
- 详细记录阻塞原因
- 集中处理阻塞任务
- 不中断自动化流程
- 支持任务恢复执行

**对比原方案**：
- ❌ 原方案遇到阻塞任务会中断自动化
- ✅ 新方案自动记录阻塞任务，继续执行
- ✅ 第二天早上集中处理

**优势**：
- 不中断自动化流程
- 集中处理阻塞任务
- 信息完整记录
- 易于追溯和处理

---

## 技术实现细节

### 1. 任务队列文档设计

#### 文档位置
```
docs/coordination/TASK_QUEUE.md
```

#### 文档结构

```markdown
# 自动化开发任务队列

## 📋 文档说明

本文档是自动化线性开发流程的**核心驱动文档**，包含以下功能：

1. **任务队列管理**: 按优先级和依赖关系组织所有待开发任务
2. **模块映射**: 每个任务明确指定所属模块
3. **状态跟踪**: 实时记录任务执行状态（pending/in_progress/completed/failed/blocked）
4. **自动化支持**: 提供脚本可解析的标准化格式

---

## 🎯 任务队列总览

### 统计信息
- **总任务数**: 0
- **待执行**: 0
- **进行中**: 0
- **已完成**: 0
- **失败**: 0
- **阻塞**: 0

### 模块分布
| 模块 | 待执行 | 进行中 | 已完成 | 失败 | 阻塞 |
|------|--------|--------|--------|------|------|
| backend | 0 | 0 | 0 | 0 | 0 |
| frontend | 0 | 0 | 0 | 0 | 0 |
| infra | 0 | 0 | 0 | 0 | 0 |
| market-data-service | 0 | 0 | 0 | 0 | 0 |
| news-service | 0 | 0 | 0 | 0 | 0 |
| trading-ai-service | 0 | 0 | 0 | 0 | 0 |
| miniprogram | 0 | 0 | 0 | 0 | 0 |

---

## 📝 任务列表

### 状态图例
- 🔲 `pending` - 待执行
- 🔄 `in_progress` - 进行中
- ✅ `completed` - 已完成
- ❌ `failed` - 失败
- ⏸️ `blocked` - 阻塞（等待人工干预）

### 任务格式说明

每个任务包含以下字段：

- `task_id`: 唯一任务ID（格式：`T-模块-序号`）
- `title`: 任务标题
- `module`: 所属模块
- `priority`: 优先级（P0/P1/P2/P3）
- `status`: 当前状态
- `description`: 任务描述
- `acceptance_criteria`: 验收标准
- `dependencies`: 依赖的任务ID列表
- `estimated_hours`: 预估工时
- `assigned_to`: 分配给的智能体（可选）
- `started_at`: 开始时间
- `completed_at`: 完成时间
- `error_message`: 失败原因（如果状态为failed）
- `block_reason`: 阻塞原因（如果状态为blocked）
- `intervention_id`: 关联的干预ID（如果状态为blocked）

### 任务示例

#### P0-001: 修复关键Bug
- **task_id**: `T-backend-001`
- **title**: 修复关键Bug
- **module**: `backend`
- **priority**: `P0`
- **status**: `pending`
- **description**: 修复XX功能的关键Bug，导致用户无法正常使用
- **acceptance_criteria**:
  - [ ] Bug已修复
  - [ ] 相关测试通过
  - [ ] 无回归问题
- **dependencies**: []
- **estimated_hours**: 2
- **assigned_to**: `null`
- **started_at**: `null`
- **completed_at**: `null`
- **error_message**: `null`
- **block_reason**: `null`
- **intervention_id**: `null`

---

## 🔄 执行历史

### 最近完成的任务
| 任务ID | 模块 | 标题 | 完成时间 | 耗时 |
|--------|------|------|----------|------|
| - | - | - | - | - |

### 最近失败的任务
| 任务ID | 模块 | 标题 | 失败时间 | 失败原因 |
|--------|------|------|----------|----------|
| - | - | - | - | - |

### 最近阻塞的任务
| 任务ID | 模块 | 标题 | 阻塞时间 | 阻塞原因 | 干预ID |
|--------|------|------|----------|----------|--------|
| - | - | - | - | - | - |

---

## 📊 统计图表

### 按优先级分布
```
P0: ████ (0)
P1: ████ (0)
P2: ████ (0)
P3: ████ (0)
```

### 按模块分布
```
backend:             ████ (0)
frontend:            ████ (0)
infra:               ████ (0)
market-data-service: ████ (0)
news-service:        ████ (0)
trading-ai-service:  ████ (0)
miniprogram:         ████ (0)
```

### 状态分布
```
pending:      ████ (0)
in_progress: ████ (0)
completed:    ████ (0)
failed:       ████ (0)
blocked:      ████ (0)
```
```

#### 关键设计要点

1. **标准化格式**
   - 使用统一的任务格式
   - 便于脚本解析
   - 易于维护

2. **优先级管理**
   - P0（紧急）> P1（高）> P2（中）> P3（低）
   - 脚本按优先级顺序执行任务

3. **依赖关系**
   - 每个任务可以指定依赖的任务ID
   - 脚本检查依赖是否都已完成
   - 只有依赖满足的任务才会被执行

4. **状态跟踪**
   - 实时记录任务状态
   - 支持任务流转
   - 便于监控进度
   - 新增 `blocked` 状态用于人工干预

5. **阻塞信息**
   - 记录阻塞原因
   - 关联干预ID
   - 便于追溯和处理

### 2. 自动化脚本设计

#### 脚本列表

1. **get-next-task.sh** - 获取下一个待执行任务
2. **update-task-status.sh** - 更新任务状态
3. **get-module-docs.sh** - 获取模块文档路径
4. **auto-dev-loop.sh** - 主循环脚本
5. **import-tasks-from-modules.sh** - 批量导入任务
6. **record-blocked-task.sh** - 记录阻塞任务
7. **resolve-intervention.sh** - 解决阻塞任务

#### 脚本1：get-next-task.sh

**功能**：
- 从TASK_QUEUE.md读取任务列表
- 按优先级排序（P0 > P1 > P2 > P3）
- 检查依赖关系
- 返回第一个可执行的任务

**输入**：
- 无（从TASK_QUEUE.md读取）

**输出**：
```
TASK_ID=T-backend-001
TITLE=修复关键Bug
MODULE=backend
DESCRIPTION=修复XX功能的关键Bug
CRITERIA=- [ ] Bug已修复
HOURS=2
```

**实现逻辑**：
```bash
1. 读取 TASK_QUEUE.md
2. 按优先级遍历任务（P0 -> P1 -> P2 -> P3）
3. 对于每个任务：
   a. 检查状态是否为 pending
   b. 检查依赖是否都已完成
   c. 如果满足，返回该任务
4. 如果没有可执行任务，返回 NO_TASK=true
```

#### 脚本2：update-task-status.sh

**功能**：
- 更新任务状态
- 更新时间戳
- 记录错误信息（如果失败）
- 记录阻塞信息（如果阻塞）

**输入**：
```bash
./update-task-status.sh <task_id> <status> [error_message] [block_reason] [intervention_id]
```

**状态选项**：
- `pending` - 待执行
- `in_progress` - 进行中
- `completed` - 已完成
- `failed` - 失败
- `blocked` - 阻塞

**实现逻辑**：
```bash
1. 验证状态是否有效
2. 检查任务ID是否存在
3. 更新任务状态字段
4. 根据状态更新时间戳：
   - in_progress: 更新 started_at
   - completed: 更新 completed_at
   - failed: 更新 error_message
   - blocked: 更新 block_reason 和 intervention_id
5. 更新统计信息
```

#### 脚本3：get-module-docs.sh

**功能**：
- 根据模块名称获取3个文档路径
- 返回文档大小信息
- 估算Token数量

**输入**：
```bash
./get-module-docs.sh <module_name>
```

**可用模块**：
- backend
- frontend
- infra
- market-data-service
- news-service
- trading-ai-service
- miniprogram

**输出**：
```
MODULE=backend
TODO_FILE=docs/modules/backend/TODO.md
TEST_SCRIPTS_FILE=docs/modules/backend/TEST_SCRIPTS.md
HAVE_DONE_FILE=docs/modules/backend/HAVE_DONE.md
TODO_SIZE=12345
TEST_SCRIPTS_SIZE=6789
HAVE_DONE_SIZE=9876
TOTAL_SIZE=29010
ESTIMATED_TOKENS=7252
```

**实现逻辑**：
```bash
1. 验证模块名称
2. 构建3个文档路径
3. 检查文档是否存在
4. 计算文档大小
5. 估算Token数量（1 token ≈ 4 bytes）
6. 输出结果
```

#### 脚本4：auto-dev-loop.sh

**功能**：
- 主循环脚本，负责整个自动化开发流程
- 调用其他脚本完成任务执行
- 记录执行日志
- 生成执行报告
- 处理阻塞任务

**输入**：
```bash
./auto-dev-loop.sh [max_iterations] [sleep_between_tasks]
```

**参数说明**：
- `max_iterations`: 最大迭代次数（默认100）
- `sleep_between_tasks`: 任务间隔时间，单位秒（默认60）

**实现逻辑**：
```bash
1. 初始化配置
   - 读取命令行参数
   - 设置日志文件
   - 验证环境

2. 主循环（直到达到最大迭代次数或没有任务）
   a. 获取下一个待执行任务
   b. 识别任务所属模块
   c. 加载模块文档
   d. 更新任务状态为 in_progress
   e. 执行任务（调用Claude Code）
   f. 处理执行结果
      - 成功 → 更新状态为 completed
      - 失败（阻塞） → 记录到人工干预清单，更新状态为 blocked
      - 失败（普通） → 更新状态为 failed
   g. 等待任务间隔时间

3. 结束
   - 生成执行报告
   - 输出统计信息
   - 关闭日志文件
```

**关键特性**：
- 颜色输出（便于日志阅读）
- 实时日志记录
- 错误处理和恢复
- 中断信号捕获（Ctrl+C）
- 执行时间统计
- 阻塞任务自动记录

#### 脚本5：import-tasks-from-modules.sh

**功能**：
- 从模块TODO.md批量导入任务到TASK_QUEUE.md
- 解析任务信息
- 生成任务队列格式

**输入**：
```bash
./import-tasks-from-modules.sh [module_name]
```

**参数说明**：
- `module_name`: 可选，指定模块名称
- 如果不指定，则导入所有模块的任务

**实现逻辑**：
```bash
1. 确定目标模块（指定或全部）
2. 遍历模块的TODO.md
3. 解析任务信息（根据实际TODO.md格式调整）
4. 生成任务队列格式
5. 添加到TASK_QUEUE.md
6. 备份原始文件
```

#### 脚本6：record-blocked-task.sh

**功能**：
- 记录阻塞任务到人工干预清单
- 生成干预ID
- 记录阻塞原因和处理建议

**输入**：
```bash
./record-blocked-task.sh <task_id> <block_reason> <block_description> <suggested_solution>
```

**参数说明**：
- `task_id`: 任务ID
- `block_reason`: 阻塞原因分类（REQUIREMENT/TECH_DECISION/DEPENDENCY/ARCHITECTURE/ENVIRONMENT/API_ISSUE/OTHER）
- `block_description`: 详细的阻塞原因描述
- `suggested_solution`: 建议的解决方案

**输出**：
```
✅ 阻塞任务已记录到人工干预清单
干预ID: I-20260215-001
任务ID: T-backend-001
阻塞原因: REQUIREMENT
阻塞时间: 2026-02-15T22:30:00Z
```

**实现逻辑**：
```bash
1. 生成干预ID（格式：I-YYYYMMDD-XXX）
2. 从任务队列获取任务信息
3. 创建临时文件
4. 在"待处理任务"章节后添加阻塞任务
5. 更新统计信息
6. 替换原文件
7. 输出结果
```

#### 脚本7：resolve-intervention.sh

**功能**：
- 解决阻塞任务
- 更新干预状态
- 记录解决方案

**输入**：
```bash
./resolve-intervention.sh <intervention_id> <resolution> <notes>
```

**参数说明**：
- `intervention_id`: 干预ID
- `resolution`: 解决方案描述
- `notes`: 处理备注

**输出**：
```
✅ 干预任务已解决
干预ID: I-20260215-001
解决时间: 2026-02-16T08:30:00Z
处理人: 开发者
解决方案: 确认了具体要修复的功能是用户认证模块，已更新任务描述
```

**实现逻辑**：
```bash
1. 检查干预ID是否存在
2. 创建临时文件
3. 更新干预状态为 resolved
4. 更新处理时间、处理人、解决方案、备注
5. 替换原文件
6. 更新统计信息
7. 输出结果
```

### 3. Claude Code 集成设计

#### 调用方式

```bash
# 假设使用 claude-code 命令行工具
echo "$prompt" | claude-code --non-interactive
```

#### 任务提示词构建

```markdown
任务ID: $task_id
任务标题: $title
所属模块: $module

任务描述:
$description

验收标准:
$criteria

模块文档:
1. TODO文档: $todo_file
2. TEST_SCRIPTS文档: $test_scripts_file
3. HAVE_DONE文档: $have_done_file

执行要求:
1. 阅读模块的3个文档，了解当前开发状态
2. 根据任务描述和验收标准执行开发
3. 遵循模块的开发规范和测试要求
4. 完成后更新模块的 TODO/TEST_SCRIPTS/HAVE_DONE 文档
5. 运行相关测试确保功能正常

请开始执行任务。
```

#### 执行结果处理

```bash
# 捕获执行结果
if [ $? -eq 0 ]; then
    # 成功
    update_task_status "$TASK_ID" "completed"
else
    # 判断是否是阻塞任务
    if is_blocked_task "$TASK_ID"; then
        # 记录到人工干预清单
        record_blocked_task "$TASK_ID" "$BLOCK_REASON" "$BLOCK_DESCRIPTION" "$SUGGESTED_SOLUTION"
        # 更新任务状态为 blocked
        update_task_status "$TASK_ID" "blocked" "" "$BLOCK_REASON" "$INTERVENTION_ID"
    else
        # 普通失败
        update_task_status "$TASK_ID" "failed" "执行失败，请查看日志"
    fi
fi
```

---

## 人工干预机制

### 核心思想

**"自动化为主，人工干预为辅"**

```
自动化开发流程
  ↓
遇到阻塞任务
  ↓
自动记录到人工干预清单
  ↓
标记任务状态为 blocked
  ↓
继续执行下一个任务（不中断自动化）
  ↓
第二天早上
  ↓
人工集中处理阻塞任务
  ↓
恢复任务执行
```

### 设计原则

1. **自动化优先**
   - 大部分任务自动完成
   - 阻塞任务自动记录
   - 不中断自动化流程

2. **人工辅助**
   - 需要人工决策的任务记录下来
   - 第二天早上集中处理
   - 处理后恢复自动化

3. **信息完整**
   - 详细记录阻塞原因
   - 提供处理建议
   - 保留执行上下文

4. **易于处理**
   - 阻塞任务集中在一个文档
   - 按优先级排序
   - 提供快速处理指引

### 阻塞任务识别

**不是所有失败都是阻塞任务！**

| 任务类型 | 处理方式 | 示例 |
|----------|----------|------|
| **阻塞任务**（需要人工干预） | 记录到人工干预清单 | 需求不明确、技术决策、依赖配置 |
| **普通失败**（代码错误） | 标记为 failed | 语法错误、测试失败 |

### 阻塞原因分类

| 分类代码 | 分类名称 | 说明 |
|----------|----------|------|
| `REQUIREMENT` | 需求不明确 | 任务描述不够清晰，需要确认 |
| `TECH_DECISION` | 技术决策 | 需要人工选择技术方案 |
| `DEPENDENCY` | 依赖配置 | 需要手动配置外部资源 |
| `ARCHITECTURE` | 架构问题 | 需要人工评审架构设计 |
| `ENVIRONMENT` | 环境问题 | 测试环境需要手动修复 |
| `API_ISSUE` | API问题 | 第三方API需要人工处理 |
| `OTHER` | 其他原因 | 其他需要人工干预的情况 |

### 人工干预清单文档

#### 文档位置
```
docs/coordination/MANUAL_INTERVENTION.md
```

#### 文档结构

```markdown
# 人工干预任务清单

## 📋 文档说明

本文档用于记录自动化开发过程中需要人工干预的阻塞任务。

### 使用场景

1. **需求不明确**: 任务描述不够清晰，需要人工确认
2. **技术决策**: 需要人工选择技术方案
3. **依赖配置**: 需要手动配置外部资源
4. **架构问题**: 需要人工评审架构设计
5. **环境问题**: 测试环境需要手动修复
6. **API问题**: 第三方API需要人工处理
7. **其他原因**: 其他需要人工干预的情况

### 处理流程

```
自动化开发发现阻塞任务
  ↓
自动记录到本文档
  ↓
标记任务状态为 blocked
  ↓
继续执行其他任务
  ↓
第二天早上
  ↓
人工集中处理阻塞任务
  ↓
更新本文档处理结果
  ↓
恢复任务执行
```

---

## 📊 统计信息

### 阻塞任务统计
- **总阻塞任务数**: 0
- **待处理**: 0
- **处理中**: 0
- **已解决**: 0
- **已取消**: 0

### 按阻塞原因分类
| 阻塞原因 | 数量 | 占比 |
|----------|------|------|
| 需求不明确 | 0 | 0% |
| 技术决策 | 0 | 0% |
| 依赖配置 | 0 | 0% |
| 架构问题 | 0 | 0% |
| 环境问题 | 0 | 0% |
| API问题 | 0 | 0% |
| 其他原因 | 0 | 0% |

### 按模块分类
| 模块 | 待处理 | 处理中 | 已解决 | 已取消 |
|------|--------|--------|--------|--------|
| backend | 0 | 0 | 0 | 0 |
| frontend | 0 | 0 | 0 | 0 |
| infra | 0 | 0 | 0 | 0 |
| market-data-service | 0 | 0 | 0 | 0 |
| news-service | 0 | 0 | 0 | 0 |
| trading-ai-service | 0 | 0 | 0 | 0 |
| miniprogram | 0 | 0 | 0 | 0 |

---

## 📝 阻塞任务列表

### 状态图例
- 🔲 `pending` - 待处理
- 🔄 `in_progress` - 处理中
- ✅ `resolved` - 已解决
- ❌ `cancelled` - 已取消

### 任务格式说明

每个阻塞任务包含以下字段：

- `intervention_id`: 唯一干预ID（格式：`I-日期-序号`）
- `task_id`: 原任务ID
- `title`: 任务标题
- `module`: 所属模块
- `block_reason`: 阻塞原因分类
- `block_description`: 详细阻塞原因
- `required_action`: 需要的人工操作
- `suggested_solution`: 建议的解决方案
- `priority`: 优先级（P0/P1/P2/P3）
- `status`: 当前状态（pending/in_progress/resolved/cancelled）
- `blocked_at`: 阻塞时间
- `processed_at`: 处理时间
- `processed_by`: 处理人
- `resolution`: 解决方案描述
- `notes`: 处理备注

---

## 🔲 待处理任务（按优先级排序）

### P0 - 紧急任务

#### I-20260215-001: [示例] 需要确认API接口规范
- **intervention_id**: `I-20260215-001`
- **task_id**: `T-backend-001`
- **title**: 修复关键Bug
- **module**: `backend`
- **block_reason**: `REQUIREMENT`
- **block_description**: 任务中提到的"XX功能"不够明确，需要确认具体是指哪个功能模块。当前TODO.md中提到了3个类似的功能，无法确定具体要修复哪一个。
- **required_action**: 确认具体要修复的功能模块，更新任务描述
- **suggested_solution**: 查看backend/HAVE_DONE.md中的已完成功能，对比TODO.md中的待修复项，确定具体目标
- **priority**: `P0`
- **status**: `pending`
- **blocked_at**: `2026-02-15T22:30:00Z`
- **processed_at**: `null`
- **processed_by**: `null`
- **resolution**: `null`
- **notes**: `null`

---

## 🔄 处理中任务

### P1 - 高优先级

#### I-20260215-002: [示例] 需要选择缓存方案
- **intervention_id**: `I-20260215-002`
- **task_id**: `T-infra-003`
- **title**: 实现缓存层
- **module**: `infra`
- **block_reason**: `TECH_DECISION`
- **block_description**: 任务要求实现缓存层，但没有指定使用Redis还是Memcached。两种方案各有优劣，需要人工决策。
- **required_action**: 选择缓存技术方案（Redis或Memcached），更新任务描述
- **suggested_solution**: 评估当前项目是否已使用Redis（用于事件总线），如果已使用则优先选择Redis以减少技术栈复杂度
- **priority**: `P1`
- **status**: `in_progress`
- **blocked_at**: `2026-02-15T23:15:00Z`
- **processed_at**: `2026-02-16T08:30:00Z`
- **processed_by**: `开发者`
- **resolution**: `null`
- **notes**: 正在评估两种方案的优劣，预计1小时内完成决策

---

## ✅ 已解决任务

### 最近解决的阻塞任务

| 干预ID | 任务ID | 模块 | 阻塞原因 | 解决时间 | 处理人 | 解决方案 |
|---------|--------|------|----------|----------|----------|----------|
| I-20260214-001 | T-frontend-002 | REQUIREMENT | 2026-02-15T08:00:00Z | 开发者 | 确认了功能需求，更新了任务描述 |
| I-20260214-002 | T-backend-003 | DEPENDENCY | 2026-02-15T09:30:00Z | 开发者 | 配置了外部API密钥，任务恢复执行 |

---

## ❌ 已取消任务

| 干预ID | 任务ID | 模块 | 阻塞原因 | 取消时间 | 取消原因 |
|---------|--------|------|----------|----------|----------|
| I-20260213-001 | T-market-data-service-001 | API_ISSUE | 2026-02-14T10:00:00Z | 第三方API已下线，任务不再需要 |

---

## 📊 处理历史

### 2026-02-15 阻塞任务汇总

**总阻塞任务数**: 2
**待处理**: 1
**处理中**: 1
**已解决**: 0
**已取消**: 0

**阻塞原因分布**:
- REQUIREMENT: 1 (50%)
- TECH_DECISION: 1 (50%)

**模块分布**:
- backend: 1
- infra: 1

---

## 🔧 处理指南

### 处理流程

#### 步骤1：查看阻塞任务

```bash
# 查看人工干预清单
cat docs/coordination/MANUAL_INTERVENTION.md

# 或使用编辑器打开
vim docs/coordination/MANUAL_INTERVENTION.md
```

#### 步骤2：按优先级处理

1. **优先处理P0任务**（紧急）
2. **然后处理P1任务**（高优先级）
3. **最后处理P2/P3任务**（中低优先级）

#### 步骤3：执行人工操作

根据阻塞原因执行相应操作：

| 阻塞原因 | 处理操作 |
|----------|----------|
| REQUIREMENT | 确认需求，更新任务描述 |
| TECH_DECISION | 选择技术方案，更新任务描述 |
| DEPENDENCY | 配置外部资源，验证依赖 |
| ARCHITECTURE | 评审架构设计，提供指导 |
| ENVIRONMENT | 修复环境问题，验证修复 |
| API_ISSUE | 处理API问题，或更新任务 |
| OTHER | 根据具体情况处理 |

#### 步骤4：更新干预状态

```bash
# 更新干预状态为 in_progress
# 执行人工操作
# 更新干预状态为 resolved
# 填写 resolution 字段
```

#### 步骤5：恢复任务执行

```bash
# 方式1：更新任务状态为 pending
./scripts/auto-dev/update-task-status.sh T-backend-001 pending

# 方式2：重新启动自动化开发
./scripts/auto-dev/auto-dev-loop.sh
```

### 处理模板

#### 模板1：需求不明确

```markdown
#### I-YYYYMMDD-XXX: 需求不明确
- **intervention_id**: `I-YYYYMMDD-XXX`
- **task_id**: `T-XXX`
- **title**: `任务标题`
- **module**: `模块名称`
- **block_reason**: `REQUIREMENT`
- **block_description**: 详细的阻塞原因说明
- **required_action**: 需要的人工操作
- **suggested_solution**: 建议的解决方案
- **priority**: `P0/P1/P2/P3`
- **status**: `pending`
- **blocked_at**: `阻塞时间`
- **processed_at**: `null`
- **processed_by**: `null`
- **resolution**: `null`
- **notes**: `null`

**处理记录**:
- [ ] 确认需求
- [ ] 更新任务描述
- [ ] 验证需求清晰
- [ ] 恢复任务执行
```

#### 模板2：技术决策

```markdown
#### I-YYYYMMDD-XXX: 技术决策
- **intervention_id**: `I-YYYYMMDD-XXX`
- **task_id**: `T-XXX`
- **title**: `任务标题`
- **module**: `模块名称`
- **block_reason**: `TECH_DECISION`
- **block_description**: 详细的阻塞原因说明
- **required_action**: 需要的人工操作
- **suggested_solution**: 建议的解决方案
- **priority**: `P0/P1/P2/P3`
- **status**: `pending`
- **blocked_at**: `阻塞时间`
- **processed_at**: `null`
- **processed_by**: `null`
- **resolution**: `null`
- **notes**: `null`

**处理记录**:
- [ ] 评估技术方案
- [ ] 选择最优方案
- [ ] 更新任务描述
- [ ] 恢复任务执行
```

---

## ⚠️ 注意事项

### 1. 阻塞任务识别

**说明**：
- 不是所有失败任务都是阻塞任务
- 只有需要人工干预的任务才记录到人工干预清单
- 普通失败任务（如代码错误）应该直接标记为 failed

**判断标准**：
- 需求不明确 → 阻塞任务
- 技术决策 → 阻塞任务
- 依赖配置 → 阻塞任务
- 架构问题 → 阻塞任务
- 环境问题 → 阻塞任务
- API问题 → 阻塞任务
- 代码错误 → 普通失败任务

### 2. 阻塞原因分类

**说明**：
- 正确分类阻塞原因
- 便于统计分析
- 便于快速定位问题

**实践**：
- 使用预定义的分类代码
- 如果不确定，使用 `OTHER`
- 在 `block_description` 中详细说明

### 3. 处理优先级

**说明**：
- P0任务应该优先处理
- P1任务其次
- P2/P3任务最后处理

**实践**：
- 第二天早上先处理P0任务
- 然后处理P1任务
- 最后处理P2/P3任务

### 4. 处理记录

**说明**：
- 详细记录处理过程
- 便于后续参考
- 便于问题追溯

**实践**：
- 在 `resolution` 字段中详细说明解决方案
- 在 `notes` 字段中记录处理过程中的发现
- 更新干预状态为 `resolved`

### 5. 任务恢复

**说明**：
- 人工处理后需要恢复任务执行
- 可以手动更新任务状态为 `pending`
- 或重新启动自动化开发

**实践**：
```bash
# 方式1：手动恢复
./scripts/auto-dev/update-task-status.sh T-backend-001 pending

# 方式2：重新启动自动化开发
./scripts/auto-dev/auto-dev-loop.sh
```

---

## 📚 相关文档

- [自动化开发设计方案](./AUTO_DEV_DESIGN_REPORT.md) - 自动化开发系统完整设计
- [任务队列文档](./TASK_QUEUE.md) - 任务队列管理
- [自动化开发使用指南](./AUTO_DEV_GUIDE.md) - 详细使用指南
- [协作流程](../agents/COLLABORATION_FLOW.md) - 多智能体协作流程

---

## 🔄 变更记录

### 2026-02-15: 创建人工干预机制文档
- 创建 MANUAL_INTERVENTION.md 文档
- 定义阻塞任务格式和分类
- 设计处理流程和脚本
- 提供使用示例和注意事项

---

**维护说明**:
- 本文档由自动化脚本和协调智能体共同维护
- 脚本负责自动记录阻塞任务
- 协调智能体负责维护文档结构
- 开发者负责处理阻塞任务

**最后更新**: 2026-02-15
**版本**: 1.0.0
```

---

## 文件结构设计

### 完整目录结构

```
stock-race/
├── docs/
│   ├── coordination/
│   │   ├── TASK_QUEUE.md              # 任务队列（核心文档）
│   │   ├── MANUAL_INTERVENTION.md     # 人工干预清单
│   │   ├── AUTO_DEV_GUIDE.md         # 详细使用指南
│   │   ├── PROGRESS.md              # 项目进度看板
│   │   └── ...
│   └── modules/
│       ├── backend/
│       │   ├── TODO.md
│       │   ├── TEST_SCRIPTS.md
│       │   └── HAVE_DONE.md
│       ├── frontend/
│       │   ├── TODO.md
│       │   ├── TEST_SCRIPTS.md
│       │   └── HAVE_DONE.md
│       ├── infra/
│       │   ├── TODO.md
│       │   ├── TEST_SCRIPTS.md
│       │   └── HAVE_DONE.md
│       ├── market-data-service/
│       │   ├── TODO.md
│       │   ├── TEST_SCRIPTS.md
│       │   └── HAVE_DONE.md
│       ├── news-service/
│       │   ├── TODO.md
│       │   ├── TEST_SCRIPTS.md
│       │   └── HAVE_DONE.md
│       ├── trading-ai-service/
│       │   ├── TODO.md
│       │   ├── TEST_SCRIPTS.md
│       │   └── HAVE_DONE.md
│       └── miniprogram/
│           ├── TODO.md
│           ├── TEST_SCRIPTS.md
│           └── HAVE_DONE.md
├── scripts/
│   └── auto-dev/
│       ├── get-next-task.sh
│       ├── update-task-status.sh
│       ├── get-module-docs.sh
│       ├── auto-dev-loop.sh
│       ├── import-tasks-from-modules.sh
│       ├── record-blocked-task.sh
│       ├── resolve-intervention.sh
│       └── README.md
└── logs/
    └── auto-dev-*.log
```

### 文件说明

#### 核心文档

1. **TASK_QUEUE.md** - 任务队列
   - 统一管理所有待开发任务
   - 按优先级和依赖关系排序
   - 实时跟踪任务状态
   - 提供脚本可解析的标准化格式

2. **MANUAL_INTERVENTION.md** - 人工干预清单
   - 记录阻塞任务
   - 按优先级排序
   - 提供处理建议
   - 跟踪处理状态

3. **AUTO_DEV_GUIDE.md** - 详细使用指南
   - 快速开始指南
   - 高级使用场景
   - 错误处理和恢复
   - 最佳实践

#### 自动化脚本

1. **get-next-task.sh** - 获取下一个待执行任务
2. **update-task-status.sh** - 更新任务状态
3. **get-module-docs.sh** - 获取模块文档路径
4. **auto-dev-loop.sh** - 主循环脚本
5. **import-tasks-from-modules.sh** - 批量导入任务
6. **record-blocked-task.sh** - 记录阻塞任务
7. **resolve-intervention.sh** - 解决阻塞任务

#### 模块文档

每个模块包含3个文档：

1. **TODO.md** - 待开发任务
   - 列出当前模块待开发的功能
   - 按优先级排序
   - 包含任务描述和验收标准

2. **TEST_SCRIPTS.md** - 测试脚本
   - 列出当前模块的测试脚本
   - 包含测试说明和执行方法
   - 记录测试结果

3. **HAVE_DONE.md** - 已完成功能
   - 记录当前模块已完成的功能
   - 包含功能说明和实现细节
   - 便于了解模块当前状态

---

## 使用指南

### 快速开始

#### 步骤1：准备环境

```bash
# 1. 安装 Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 2. 配置 API 密钥
export ANTHROPIC_API_KEY="your-api-key"

# 3. 验证安装
claude-code --version
```

#### 步骤2：创建任务队列

```bash
# 1. 创建任务队列文档
vim docs/coordination/TASK_QUEUE.md

# 2. 添加任务
# 参考文档中的任务格式

# 3. 或从模块TODO.md导入
./scripts/auto-dev/import-tasks-from-modules.sh
```

#### 步骤3：启动自动化开发

```bash
# 1. 启动主循环脚本
./scripts/auto-dev/auto-dev-loop.sh

# 2. 或指定最大迭代次数和任务间隔
./scripts/auto-dev/auto-dev-loop.sh 100 60

# 3. 后台运行
nohup ./scripts/auto-dev/auto-dev-loop.sh 100 60 > /dev/null 2>&1 &
```

#### 步骤4：监控执行进度

```bash
# 1. 查看实时日志
tail -f logs/auto-dev-*.log

# 2. 查看任务队列状态
cat docs/coordination/TASK_QUEUE.md

# 3. 查看人工干预清单
cat docs/coordination/MANUAL_INTERVENTION.md
```

### 高级使用

#### 场景1：批量导入任务

```bash
# 从所有模块导入任务
./scripts/auto-dev/import-tasks-from-modules.sh

# 从指定模块导入任务
./scripts/auto-dev/import-tasks-from-modules.sh backend
```

#### 场景2：手动更新任务状态

```bash
# 更新任务状态为 in_progress
./scripts/auto-dev/update-task-status.sh T-backend-001 in_progress

# 更新任务状态为 completed
./scripts/auto-dev/update-task-status.sh T-backend-001 completed

# 更新任务状态为 failed
./scripts/auto-dev/update-task-status.sh T-backend-001 failed "执行失败，请查看日志"

# 更新任务状态为 blocked
./scripts/auto-dev/update-task-status.sh T-backend-001 blocked "" "REQUIREMENT" "I-20260215-001"
```

#### 场景3：处理阻塞任务

```bash
# 查看人工干预清单
cat docs/coordination/MANUAL_INTERVENTION.md

# 解决阻塞任务
./scripts/auto-dev/resolve-intervention.sh I-20260215-001 "确认了具体要修复的功能是用户认证模块，已更新任务描述" "查看了 HAVE_DONE.md 和 TODO.md，确认了具体功能"

# 恢复任务执行
./scripts/auto-dev/update-task-status.sh T-backend-001 pending
```

### 错误处理

#### 查看失败的任务

```bash
# 查看失败的任务
cat docs/coordination/TASK_QUEUE.md | grep -B 5 "status: \`failed\`"

# 查看错误日志
cat logs/auto-dev-*.log | grep -A 10 "ERROR"
```

#### 重新执行失败的任务

```bash
# 更新任务状态为 pending
./scripts/auto-dev/update-task-status.sh T-frontend-001 pending

# 脚本会自动重新执行
```

#### 处理阻塞任务

```bash
# 查看阻塞的任务
cat docs/coordination/TASK_QUEUE.md | grep -B 5 "status: \`blocked\`"

# 查看人工干预清单
cat docs/coordination/MANUAL_INTERVENTION.md

# 解决阻塞任务
./scripts/auto-dev/resolve-intervention.sh I-20260215-001 "解决方案描述" "处理备注"

# 恢复任务执行
./scripts/auto-dev/update-task-status.sh T-backend-001 pending
```

---

## 注意事项

### 1. Token 消耗管理

**说明**：
- 每次只加载当前模块的3个文档
- 避免上下文超限
- 降低Token消耗

**实践**：
```bash
# 查看模块文档的预估 Token 数量
./scripts/auto-dev/get-module-docs.sh backend

# 监控 API 使用量
# 定期检查 Anthropic 控制台
```

### 2. 任务依赖管理

**说明**：
- 确保依赖的任务ID存在且状态为 `completed`
- 避免创建循环依赖的任务
- 高优先级任务应该先于低优先级任务完成

**实践**：
```markdown
### P1-002: 实现功能B
- **task_id**: `T-frontend-002`
- **dependencies**: [`T-frontend-001`]  # 依赖功能A先完成
```

### 3. 错误处理

**说明**：
- 脚本会自动将失败任务标记为 `failed`
- 某些错误可能需要手动修复
- 所有错误都会记录到日志文件

**实践**：
```bash
# 查看失败的任务
cat docs/coordination/TASK_QUEUE.md | grep -B 5 "status: \`failed\`"

# 查看错误日志
cat logs/auto-dev-*.log | grep -A 10 "ERROR"

# 手动修复后重新执行
./scripts/auto-dev/update-task-status.sh T-frontend-001 pending
```

### 4. 人工干预处理

**说明**：
- 阻塞任务不会中断自动化流程
- 第二天早上集中处理
- 按优先级排序处理

**实践**：
```bash
# 查看人工干预清单
cat docs/coordination/MANUAL_INTERVENTION.md

# 按优先级处理阻塞任务
# P0任务（紧急）> P1任务（高）> P2/P3任务（中低）

# 解决阻塞任务
./scripts/auto-dev/resolve-intervention.sh I-20260215-001 "解决方案描述" "处理备注"

# 恢复任务执行
./scripts/auto-dev/update-task-status.sh T-backend-001 pending
```

### 5. Git 管理

**说明**：
- 脚本不会自动提交代码，需要手动提交
- 如果有 Git 冲突，需要手动解决
- 定期备份代码和文档

**实践**：
```bash
# 定期提交代码
git add .
git commit -m "自动化开发更新"
git push

# 解决冲突
git pull
# 手动解决冲突
git add .
git commit -m "解决冲突"
git push
```

### 6. 资源限制

**说明**：
- 注意 Anthropic API 的速率限制
- 监控 CPU 和内存使用情况
- 定期清理日志文件

**实践**：
```bash
# 监控系统资源
top
htop

# 清理日志文件
find logs/ -name "auto-dev-*.log" -mtime +7 -delete
```

---

## 与原方案对比

### 对比表格

| 维度 | 原方案（任务派发） | 新方案（自动化线性） |
|------|-------------------|-------------------|
| **模块化** | ✅ 6个模块独立 | ✅ 6个模块独立 |
| **上下文限制** | ✅ 每个模块独立上下文 | ✅ 每次只加载当前模块 |
| **并行开发** | ✅ 最多4个智能体并行 | ❌ 线性执行 |
| **协调复杂度** | 🔴 高（需要协调智能体） | 🟢 低（无需协调） |
| **代码冲突** | 🟡 可能发生 | 🟢 不会发生 |
| **无人值守** | 🟡 困难（需要协调） | ✅ 容易（脚本循环） |
| **个人开发** | 🔴 复杂（多智能体协调） | 🟢 简单（线性流程） |
| **夜间开发** | 🟡 无法持续10小时 | ✅ 可以持续10小时 |
| **Token消耗** | 🟢 低（每个智能体独立） | 🟢 低（每次只加载当前模块） |
| **任务管理** | 🟡 分散在6个TODO.md | ✅ 统一在TASK_QUEUE.md |
| **依赖管理** | 🟡 需要协调智能体 | ✅ 自动检查依赖关系 |
| **进度跟踪** | 🟡 需要协调智能体汇总 | ✅ 实时更新状态 |
| **错误处理** | 🟡 需要协调智能体介入 | ✅ 自动标记失败任务 |
| **日志记录** | 🟡 分散在各个智能体 | ✅ 统一日志文件 |
| **人工干预** | ❌ 阻塞任务中断自动化 | ✅ 自动记录，继续执行 |
| **阻塞处理** | ❌ 需要立即处理 | ✅ 第二天早上集中处理 |

### 适用场景对比

#### 原方案适合的场景

✅ **大型复杂项目**
- 多个独立服务模块
- 模块间依赖关系清晰
- 需要并行开发加速

✅ **团队协作场景**
- 多个开发者/智能体协作
- 需要专业化分工
- 需要灵活的任务调度

✅ **长期维护项目**
- 模块边界稳定
- 需要持续迭代
- 需要清晰的文档体系

#### 新方案适合的场景

✅ **个人开发项目**
- 只有一个开发者
- 无法管理多智能体协调
- 需要降低开发复杂度

✅ **中小型项目**
- 模块数量少（<10个）
- 依赖关系简单
- 可以线性开发

✅ **原型验证阶段**
- 快速迭代验证想法
- 需要频繁调整架构
- 不需要严格的模块化

✅ **无人值守自动化**
- 夜间自动开发
- 持续集成场景
- 减少人工干预

✅ **资源受限环境**
- Token预算有限
- 无法支持多智能体并行
- 需要降低协调成本

✅ **需要人工干预**
- 任务可能需要人工决策
- 需要灵活的人工干预机制
- 不希望阻塞任务中断自动化

---

## 实施建议

### 第一阶段：基础准备（1天）

#### 目标
- 创建所有必需的文件和脚本
- 验证环境配置
- 测试基本功能

#### 任务清单

1. **创建核心文档**
   - [ ] 创建 `docs/coordination/TASK_QUEUE.md`
   - [ ] 创建 `docs/coordination/MANUAL_INTERVENTION.md`
   - [ ] 创建 `docs/coordination/AUTO_DEV_GUIDE.md`
   - [ ] 创建 `scripts/auto-dev/README.md`

2. **创建自动化脚本**
   - [ ] 创建 `scripts/auto-dev/get-next-task.sh`
   - [ ] 创建 `scripts/auto-dev/update-task-status.sh`
   - [ ] 创建 `scripts/auto-dev/get-module-docs.sh`
   - [ ] 创建 `scripts/auto-dev/auto-dev-loop.sh`
   - [ ] 创建 `scripts/auto-dev/import-tasks-from-modules.sh`
   - [ ] 创建 `scripts/auto-dev/record-blocked-task.sh`
   - [ ] 创建 `scripts/auto-dev/resolve-intervention.sh`

3. **赋予脚本执行权限**
   ```bash
   chmod +x scripts/auto-dev/*.sh
   ```

4. **验证环境**
   - [ ] 验证 Claude Code CLI 已安装
   - [ ] 验证 API 密钥已配置
   - [ ] 验证模块文档存在

5. **准备测试任务**
   - [ ] 在 TASK_QUEUE.md 中添加1-2个测试任务
   - [ ] 确保任务格式正确

#### 验收标准
- 所有文件创建成功
- 脚本可以正常执行
- 环境配置正确

### 第二阶段：功能测试（1天）

#### 目标
- 测试所有脚本功能
- 验证任务执行流程
- 发现并修复问题

#### 任务清单

1. **测试 get-next-task.sh**
   ```bash
   ./scripts/auto-dev/get-next-task.sh
   ```
   - [ ] 正确返回待执行任务
   - [ ] 优先级排序正确
   - [ ] 依赖关系检查正确

2. **测试 update-task-status.sh**
   ```bash
   ./scripts/auto-dev/update-task-status.sh T-xxx in_progress
   ./scripts/auto-dev/update-task-status.sh T-xxx completed
   ./scripts/auto-dev/update-task-status.sh T-xxx blocked "" "REQUIREMENT" "I-20260215-001"
   ```
   - [ ] 状态更新正确
   - [ ] 时间戳更新正确
   - [ ] 统计信息更新正确
   - [ ] 阻塞信息更新正确

3. **测试 get-module-docs.sh**
   ```bash
   ./scripts/auto-dev/get-module-docs.sh backend
   ```
   - [ ] 正确返回文档路径
   - [ ] 文档大小计算正确
   - [ ] Token 估算合理

4. **测试 import-tasks-from-modules.sh**
   ```bash
   ./scripts/auto-dev/import-tasks-from-modules.sh backend
   ```
   - [ ] 正确解析TODO.md
   - [ ] 任务格式生成正确
   - [ ] 任务添加到TASK_QUEUE.md

5. **测试 record-blocked-task.sh**
   ```bash
   ./scripts/auto-dev/record-blocked-task.sh T-backend-001 REQUIREMENT "需求不明确" "查看 HAVE_DONE.md 确认具体功能"
   ```
   - [ ] 正确记录到人工干预清单
   - [ ] 干预ID生成正确
   - [ ] 统计信息更新正确

6. **测试 resolve-intervention.sh**
   ```bash
   ./scripts/auto-dev/resolve-intervention.sh I-20260215-001 "确认了具体功能" "查看了文档"
   ```
   - [ ] 正确更新干预状态
   - [ ] 解决方案记录正确
   - [ ] 统计信息更新正确

7. **测试 auto-dev-loop.sh（单次迭代）**
   ```bash
   ./scripts/auto-dev/auto-dev-loop.sh 1 0
   ```
   - [ ] 正确获取任务
   - [ ] 正确加载模块文档
   - [ ] 正确调用 Claude Code
   - [ ] 正确更新任务状态
   - [ ] 正确处理阻塞任务
   - [ ] 日志记录完整

#### 验收标准
- 所有脚本功能正常
- 任务执行流程完整
- 阻塞任务处理正确
- 日志记录准确

### 第三阶段：批量导入任务（1天）

#### 目标
- 从现有模块TODO.md导入任务
- 整理任务优先级和依赖关系
- 准备完整的任务队列

#### 任务清单

1. **导入所有模块任务**
   ```bash
   ./scripts/auto-dev/import-tasks-from-modules.sh
   ```

2. **整理任务优先级**
   - [ ] 标记紧急任务为 P0
   - [ ] 标记高优先级任务为 P1
   - [ ] 标记中优先级任务为 P2
   - [ ] 标记低优先级任务为 P3

3. **配置任务依赖关系**
   - [ ] 识别任务间的依赖关系
   - [ ] 在 dependencies 字段中配置
   - [ ] 验证依赖关系正确

4. **更新统计信息**
   - [ ] 更新总任务数
   - [ ] 更新各状态任务数
   - [ ] 更新模块分布统计

#### 验收标准
- 所有任务已导入
- 优先级配置合理
- 依赖关系正确
- 统计信息准确

### 第四阶段：试运行（1天）

#### 目标
- 小规模试运行自动化开发
- 验证系统稳定性
- 发现并修复问题

#### 任务清单

1. **小规模试运行（5个任务）**
   ```bash
   ./scripts/auto-dev/auto-dev-loop.sh 5 120
   ```
   - [ ] 任务执行正常
   - [ ] 日志记录完整
   - [ ] 任务状态更新正确
   - [ ] 阻塞任务处理正确

2. **监控执行过程**
   ```bash
   tail -f logs/auto-dev-*.log
   ```
   - [ ] 日志输出清晰
   - [ ] 错误信息准确
   - [ ] 执行时间合理

3. **检查执行结果**
   - [ ] 查看任务队列状态
   - [ ] 检查模块文档更新
   - [ ] 验证代码修改
   - [ ] 查看人工干预清单

4. **处理失败任务**
   - [ ] 分析失败原因
   - [ ] 修复问题
   - [ ] 重新执行

5. **处理阻塞任务**
   - [ ] 查看人工干预清单
   - [ ] 按优先级处理
   - [ ] 解决干预任务
   - [ ] 恢复任务执行

#### 验收标准
- 系统运行稳定
- 任务执行成功率高（>80%）
- 阻塞任务处理正确
- 日志记录完整

### 第五阶段：正式运行（持续）

#### 目标
- 启动正式的自动化开发
- 监控执行进度
- 优化系统性能

#### 任务清单

1. **启动后台运行**
   ```bash
   nohup ./scripts/auto-dev/auto-dev-loop.sh 100 60 > /dev/null 2>&1 &
   ```

2. **监控执行进度**
   ```bash
   tail -f logs/auto-dev-*.log
   ```

3. **定期检查**
   - [ ] 每天检查执行日志
   - [ ] 每天检查任务队列状态
   - [ ] 每天检查人工干预清单
   - [ ] 每周检查系统性能

4. **处理阻塞任务**
   - [ ] 第二天早上查看人工干预清单
   - [ ] 按优先级处理阻塞任务
   - [ ] 解决干预任务
   - [ ] 恢复任务执行

5. **优化调整**
   - [ ] 根据执行时间调整任务间隔
   - [ ] 根据失败率优化任务描述
   - [ ] 根据Token消耗优化模块文档
   - [ ] 根据阻塞情况优化任务描述

#### 验收标准
- 系统持续稳定运行
- 任务完成率 > 90%
- 阻塞任务处理及时
- Token消耗在预算内

### 第六阶段：持续优化（持续）

#### 目标
- 根据实际使用情况优化系统
- 提高开发效率
- 降低成本

#### 优化方向

1. **性能优化**
   - 优化脚本执行速度
   - 减少不必要的文件读取
   - 优化日志记录

2. **成本优化**
   - 优化模块文档大小
   - 减少重复上下文加载
   - 优化任务提示词

3. **稳定性优化**
   - 增强错误处理
   - 改进失败恢复机制
   - 优化依赖关系检查

4. **易用性优化**
   - 改进日志输出格式
   - 增加进度可视化
   - 简化配置流程

---

## 总结

### 方案核心价值

本方案完美结合了**任务派发模式**、**线性流程模式**和**人工干预机制**的优势：

✅ **保留模块化优势**
- 6个模块独立维护
- 每个模块3个文档
- 模块职责边界清晰

✅ **上下文限制优化**
- 每次只加载当前模块的3个文档
- 避免上下文超限
- 降低Token消耗

✅ **全自动化执行**
- 脚本循环执行任务队列
- 无需人工干预
- 适合夜间/无人值守开发

✅ **线性流程简化**
- 无需复杂的并行协调
- 无需处理代码冲突
- 降低个人开发复杂度

✅ **人工干预机制**
- 自动记录阻塞任务
- 集中处理阻塞任务
- 不中断自动化流程
- 提供合理的人工干预途径

### 适用场景

本方案特别适合：

✅ **个人开发团队**
- 只有一个开发者
- 无法管理多智能体协调
- 需要降低开发复杂度

✅ **夜间自动化开发**
- 开发者不在计算机旁
- 需要持续10小时开发
- 充分利用时间

✅ **中小型项目**
- 模块数量适中（6个）
- 依赖关系相对简单
- 可以线性开发

✅ **需要人工干预**
- 任务可能需要人工决策
- 需要灵活的人工干预机制
- 不希望阻塞任务中断自动化

### 预期效果

实施本方案后，预期达到以下效果：

1. **开发效率提升**
   - 夜间10小时可以充分利用
   - 无需人工干预
   - 任务自动执行

2. **开发复杂度降低**
   - 无需管理多智能体协调
   - 无需处理代码冲突
   - 流程简单易懂

3. **Token消耗优化**
   - 每次只加载当前模块
   - 避免全局上下文
   - 降低API成本

4. **任务管理简化**
   - 统一任务队列
   - 自动优先级排序
   - 实时状态跟踪

5. **人工干预灵活**
   - 阻塞任务自动记录
   - 集中处理阻塞任务
   - 不中断自动化流程

### 下一步行动

1. **审阅本报告**
   - 理解方案设计
   - 确认技术细节
   - 评估实施可行性

2. **准备虚拟机环境**
   - 安装 Claude Code CLI
   - 配置 API 密钥
   - 验证环境

3. **开始实施**
   - 按照实施建议分阶段实施
   - 每个阶段完成后进行验收
   - 发现问题及时调整

---

**维护说明**:
- 本文档由首席架构师维护
- 根据实际使用情况持续更新
- 欢迎提出改进建议

**最后更新**: 2026-02-15
**版本**: 2.0.0（包含人工干预机制）