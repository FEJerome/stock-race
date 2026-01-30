# 通用Git-Worktree 配置指南

## 🎯 概述

本文档提供多智能体并行开发的通用git-worktree配置指南。通过为每个智能体创建独立的工作树（worktree），实现代码隔离、并行开发和版本协调。本指南不与具体业务耦合，适用于各种类型的软件开发项目。

## 📁 通用Worktree 配置方案

### 基础worktree配置（6个通用智能体）

```bash
# 在项目根目录执行以下命令
cd /path/to/your/project

# 为每个通用智能体创建独立worktree
git worktree add worktrees/worktree-architecture
git worktree add worktrees/worktree-core-logic
git worktree add worktrees/worktree-interface-service
git worktree add worktrees/worktree-user-interface
git worktree add worktrees/worktree-infrastructure
git worktree add worktrees/worktree-coordination

# 查看所有worktree
git worktree list
```

### 通用Worktree 路径映射

| 智能体 | Worktree路径 | 对应分支策略 |
|--------|--------------|--------------|
| 架构设计智能体 | `worktrees/worktree-architecture` | `feature/architecture-*` |
| 核心逻辑智能体 | `worktrees/worktree-core-logic` | `feature/core-logic-*` |
| 接口服务智能体 | `worktrees/worktree-interface-service` | `feature/interface-service-*` |
| 用户界面智能体 | `worktrees/worktree-user-interface` | `feature/user-interface-*` |
| 基础设施智能体 | `worktrees/worktree-infrastructure` | `feature/infrastructure-*` |
| 协调管理智能体 | `worktrees/worktree-coordination` | `feature/coordination-*` |

## 🚀 初始化设置

### 第一步：克隆主仓库（如果尚未克隆）

```bash
# 克隆项目到本地
git clone <repository-url> your-project-name
cd your-project-name
```

### 第二步：创建所有worktree（一键脚本）

将以下脚本保存为 `setup-worktrees.sh`：

```bash
#!/bin/bash

# 设置工作目录
PROJECT_ROOT="/path/to/your/project"
cd "$PROJECT_ROOT"

echo "正在设置多智能体worktree..."

# 创建worktree目录
WORKTREES=(
    "architecture"
    "core-logic"
    "interface-service"
    "user-interface"
    "infrastructure"
    "coordination"
)

for wt in "${WORKTREES[@]}"; do
    WT_PATH="worktrees/worktree-$wt"
    if [ ! -d "$WT_PATH" ]; then
        echo "创建worktree: $WT_PATH"
        git worktree add "$WT_PATH"
    else
        echo "worktree已存在: $WT_PATH"
    fi
done

echo "worktree设置完成！"
echo ""
echo "可用worktree列表："
git worktree list
```

### 第三步：配置智能体工作环境

每个智能体在自己的worktree中工作：

```bash
# 架构设计智能体
cd worktrees/worktree-architecture
git checkout main
git pull origin main

# 创建开发分支
git checkout -b feature/architecture-系统设计
```

## 🔧 日常开发流程

### 1. 开始新功能开发

```bash
# 进入自己的worktree
cd worktrees/worktree-architecture

# 确保main分支最新
git checkout main
git pull origin main

# 创建功能分支（按智能体角色命名）
git checkout -b feature/architecture-功能描述

# 开始开发...
```

### 2. 提交更改

```bash
# 添加更改
git add .

# 提交（遵循Conventional Commits规范）
git commit -m "feat(architecture): 添加系统架构设计"

# 推送到远程
git push -u origin feature/architecture-功能描述
```

### 3. 更新任务状态

开发过程中更新对应的工作文档：
- 将任务状态从 `pending` 改为 `in_progress`
- 完成开发后改为 `completed`
- 遇到问题标记为 `blocked`

## 🌳 通用分支策略

### 分支命名规范

```
feature/{智能体类型}-{功能描述}
```

**智能体类型**：
- `architecture` - 架构设计
- `core-logic` - 核心逻辑
- `interface-service` - 接口服务
- `user-interface` - 用户界面
- `infrastructure` - 基础设施
- `coordination` - 协调管理

**示例**：
- `feature/architecture-系统设计`
- `feature/core-logic-业务算法`
- `feature/user-interface-登录组件`
- `feature/coordination-进度跟踪`

### 分支生命周期

```
创建分支 → 开发 → 测试 → 代码审查 → 合并到main → 删除分支
```

## 🔄 合并流程

### 协调智能体审核流程

1. **提交合并请求**：
   ```bash
   # 在功能分支完成开发后
   git push origin feature/architecture-系统设计
   # 通知协调智能体审核
   ```

2. **协调智能体审核步骤**：
   ```bash
   # 切换到协调智能体worktree
   cd worktrees/worktree-coordination

   # 拉取最新代码
   git fetch origin

   # 检查分支
   git checkout feature/architecture-系统设计

   # 运行测试
   # 根据项目配置运行相应测试命令

   # 检查代码质量
   # ...

   # 合并到main（如果审核通过）
   git checkout main
   git merge --no-ff feature/architecture-系统设计
   git push origin main

   # 删除远程分支
   git push origin --delete feature/architecture-系统设计
   ```

3. **更新文档**：
   - 更新进度跟踪文档记录合并
   - 更新相关任务文档状态
   - 必要时更新项目主文档

### 合并冲突解决

如果出现合并冲突：

```bash
# 协调智能体处理冲突
git merge --abort  # 取消合并
git checkout main
git pull origin main

# 重新合并并手动解决冲突
git merge feature/architecture-系统设计
# 解决冲突...
git add .
git commit -m "merge: 解决合并冲突"
git push origin main
```

## 🗑️ Worktree 维护

### 清理旧的worktree

```bash
# 查看所有worktree
git worktree list

# 删除不再需要的worktree
git worktree remove worktrees/worktree-architecture-old
```

### 更新所有worktree的main分支

```bash
# 更新脚本：update-all-worktrees.sh
#!/bin/bash

PROJECT_ROOT="/path/to/your/project"
cd "$PROJECT_ROOT"

echo "更新所有worktree的main分支..."

WORKTREES=($(git worktree list | awk '{print $1}' | grep worktree))

for wt in "${WORKTREES[@]}"; do
    if [ -d "$wt" ]; then
        echo "更新: $wt"
        cd "$wt"
        git checkout main
        git pull origin main
        cd "$PROJECT_ROOT"
    fi
done

echo "更新完成！"
```

## ⚠️ 注意事项

### 1. 文件系统限制
- 确保有足够的磁盘空间（每个worktree约占用相同空间）
- Windows系统注意路径长度限制

### 2. Git配置
- 确保Git版本 >= 2.5（支持worktree）
- 配置正确的用户信息：
  ```bash
  git config --global user.name "智能体名称"
  git config --global user.email "agent@example.com"
  ```

### 3. 权限管理
- 每个智能体只操作自己的worktree
- 协调智能体负责跨worktree操作
- 避免在不同worktree间直接复制文件

### 4. 性能优化
- 定期清理不需要的分支
- 使用浅克隆（如果空间有限）
- 配置.gitignore避免不必要的文件

## 🧪 验证配置

### 验证脚本

```bash
#!/bin/bash
# verify-worktrees.sh

echo "验证worktree配置..."

# 检查必要目录
REQUIRED_DIRS=(
    "worktree-architecture"
    "worktree-core-logic"
    "worktree-interface-service"
    "worktree-user-interface"
    "worktree-infrastructure"
    "worktree-coordination"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "worktrees/$dir" ]; then
        echo "✓ $dir 存在"
    else
        echo "✗ $dir 缺失"
    fi
done

# 检查Git状态
echo ""
echo "Git worktree列表："
git worktree list
```

### 常见问题排查

1. **worktree创建失败**：
   ```bash
   # 清理锁定文件
   rm -f .git/worktrees/*/locked
   ```

2. **分支冲突**：
   ```bash
   # 查看冲突分支
   git branch -a
   # 删除本地冲突分支
   git branch -D feature/conflict-branch
   ```

3. **磁盘空间不足**：
   ```bash
   # 使用浅克隆
   git worktree add --depth=1 worktrees/worktree-shallow
   ```

## 📚 相关资源

- [Git Worktree官方文档](https://git-scm.com/docs/git-worktree)
- [通用智能体角色定义](./GENERIC_ROLES.md)
- [通用协作执行方案](./GENERIC_COLLABORATION_PLAN.md)
- [项目主文档](../../CLAUDE.md)

---

*最后更新：{更新日期}*
*维护者：协调智能体*
*版本：1.0.0*
*备注：此为通用配置指南，请根据具体项目需求调整路径和配置*