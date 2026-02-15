# WSL2 架构详解与工具链配置

## WSL2 本质是什么？

WSL2 (Windows Subsystem for Linux 2) 是一个**完整的 Linux 内核虚拟机**，但与传统虚拟机有显著区别：

### 与传统 VM 对比

| 特性 | VMware/VirtualBox (传统VM) | WSL2 |
|------|---------------------------|------|
| 内核 | 模拟硬件，启动完整系统 | 真正的 Linux 内核（微软定制版） |
| 启动速度 | 慢（30-60秒） | 快（2-3秒） |
| 内存占用 | 固定分配（如 4GB） | 动态分配（上限可配置） |
| 文件系统 | 虚拟磁盘镜像 | ext4 + 9P 协议桥接 Windows |
| 网络 | 独立虚拟网卡，完全隔离 | NAT + localhost 共享 |
| GUI 应用 | 需配置显示转发 | 原生支持（WSLg） |

### WSL2 的独立性

WSL2 **有独立的**：
- Linux 内核（与 Windows 共享底层 Hyper-V）
- 文件系统（`ext4`，位置：`\wsl$\Ubuntu\home\fe-jerome`）
- 进程空间（ps aux 看不到 Windows 进程）
- 网络栈（独立 IP，但 localhost 共享）
- 包管理（apt，与 Windows 完全隔离）

WSL2 **与 Windows 共享**：
- localhost 网络（Windows 的 localhost:3000 = WSL2 的 localhost:3000）
- CPU 资源
- 部分环境变量（可配置）
- 文件访问（通过 `/mnt/c/` 或 `\wsl$`）

## 推荐工具链架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Windows 11                                │
│                                                                  │
│  ┌──────────────────────┐      ┌─────────────────────────────┐  │
│  │   Claude Code        │◄────►│   微信开发者工具             │  │
│  │   (Windows 端)       │      │   MCP Server @ localhost    │  │
│  │                      │      │   端口: 9420 (示例)          │  │
│  └──────────┬───────────┘      └─────────────────────────────┘  │
│             │                                                    │
│             │  自动检测 WSL2 项目                                  │
│             │  执行: wsl <command>                                │
│             ▼                                                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              WSL2 (Ubuntu-22.04)                           │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  项目代码                                            │  │  │
│  │  │  ~/projects/stock-race/                             │  │  │
│  │  │  ├── miniprogram/                                   │  │  │
│  │  │  ├── backend/                                       │  │  │
│  │  │  └── ...                                            │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  开发工具                                            │  │  │
│  │  │  ├── michelle 脚本 (~/bin/michelle)                 │  │  │
│  │  │  ├── Tmux 会话管理                                   │  │  │
│  │  │  ├── Node.js 20 (nvm)                               │  │  │
│  │  │  ├── Python 3                                       │  │  │
│  │  │  └── Git + SSH 密钥                                  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 各组件安装位置建议

### ✅ 安装在 Windows 端

| 软件 | 原因 |
|------|------|
| **Claude Code** | 需要直接控制 Windows 软件（微信DevTools），WSL2 端配置 MCP 更麻烦 |
| **微信开发者工具** | 只有 Windows 版支持完整的自动化 API |
| **VS Code** | 官方 WSL2 插件支持，可无缝编辑 WSL2 中的代码 |

### ✅ 安装在 WSL2 端

| 软件 | 原因 |
|------|------|
| **Node.js/npm** | Linux 版本与生产环境一致 |
| **Python** | 避免 Windows 路径问题 |
| **Git** | SSH 密钥已在 WSL2 中配置 |
| **Tmux** | Linux 原生，Windows 无直接替代 |
| **michelle 脚本** | 依赖 bash，Linux 环境更稳定 |
| **项目代码** | 文件系统在 WSL2 中性能更好 |

## Claude Code 使用方式

### 方式一：Windows Claude Code 直接编辑 WSL2 项目

```powershell
# 在 Windows PowerShell 中
claude

# Claude Code 会自动检测当前目录
# 如果在 Windows 目录，它会建议进入 WSL2
# 或者手动指定 WSL2 路径
```

进入 Claude Code 后，你可以直接操作 WSL2 文件：

```
# Claude Code 内部命令
/read /home/fe-jerome/projects/stock-race/CLAUDE.md

# 执行 WSL2 命令
!wsl ls -la ~/bin/

# 使用 michelle
!wsl michelle current
!wsl michelle use deepseek-chat
```

### 方式二：在 WSL2 中启动 Claude Code（不推荐）

```bash
# 在 WSL2 中
claude

# 缺点：配置 MCP 连接 Windows 微信DevTools 需要额外网络配置
```

## Tmux 在 WSL2 中的使用

**完全支持**，使用方式与 Linux 完全一致。

### 常用会话管理

```bash
# 创建新会话
tmux new -s stock-race

# 创建分窗
Ctrl+B "  # 水平分窗
Ctrl+B %  # 垂直分窗

# 创建新窗口
tmux new-window -n backend

# 分离会话（后台运行）
Ctrl+B D

# 重新连接
tmux attach -t stock-race

# 列出所有会话
tmux ls
```

### 实际开发工作流

```bash
# 1. 启动 Tmux 主会话
tmux new -s dev

# 2. 创建多个窗口
tmux new-window -n backend    # 后端开发
tmux new-window -n frontend   # 前端开发
tmux new-window -n ai         # AI服务开发
tmux new-window -n docker     # Docker 管理

# 3. 每个窗口中再分窗
# Window 0: vim CLAUDE.md
# Window 1: 后端 - 分窗 1: npm run dev, 分窗 2: 日志查看
# Window 2: 前端 - 分窗 1: npm run dev, 分窗 2: 构建
# Window 3: AI - python main.py
# Window 4: docker-compose logs -f

# 4. 随时分离，第二天继续
tmux attach -t dev
```

## Michelle 脚本跨系统使用

### 方案一：Windows 端调用 WSL2 的 michelle（推荐）

在 Windows PowerShell 配置别名：

```powershell
# 添加到 $PROFILE
function michelle { wsl michelle @args }
function m { wsl michelle @args }

# 然后使用
michelle current
michelle use claude-opus-4-5-20251101
michelle list
```

### 方案二：直接在 Claude Code 中调用

```
# Claude Code 内使用 ! 执行命令
!wsl michelle use deepseek-chat

# 或者进入 wsl 子 shell
!wsl
$ michelle current
$ exit
```

### 方案三：配置共享（高级）

让 Windows 和 WSL2 共享同一个 michelle 配置：

```bash
# 在 WSL2 中，配置指向 Windows 的 API 密钥
# 或者通过环境变量共享
export ANTHROPIC_API_KEY=$(cat /mnt/c/Users/fe-jerome/.config/claude/keys/anthropic)
```

## 文件路径注意事项

### Windows 访问 WSL2 文件

```powershell
# 通过 UNC 路径
notepad "\wsl$\Ubuntu\home\fe-jerome\projects\stock-race\CLAUDE.md"

# 通过资源管理器
explorer "\wsl$\Ubuntu\home\fe-jerome"
```

### WSL2 访问 Windows 文件

```bash
# Windows C 盘挂载在 /mnt/c/
cd /mnt/c/Users/fe-jerome/Desktop

# 项目建议放在 WSL2 家目录（性能更好）
cd ~/projects/stock-race
```

## 性能优化建议

1. **项目文件放在 WSL2 文件系统中**（`~/projects/`）
   - 访问速度比 `/mnt/c/` 快 10-20 倍

2. **内存配置**（前面已配置 `.wslconfig`）
   ```ini
   [wsl2]
   memory=4GB
   processors=4
   ```

3. **使用 Tmux 而不是多个终端窗口**
   - 减少 WSL2 启动开销
   - 会话持久化

## 验证清单

- [ ] Windows Claude Code 能读取 WSL2 中的项目文件
- [ ] `wsl michelle current` 在 PowerShell 中工作正常
- [ ] Tmux 会话可以创建、分离、重新连接
- [ ] 微信开发者工具 MCP 能被 Windows Claude Code 调用
- [ ] 项目代码放在 `~/projects/stock-race`（WSL2 文件系统）

---

**总结**：
- WSL2 = 完整 Linux 虚拟机，与 Windows 通过 localhost 和网络共享连接
- Claude Code 装 Windows 端，方便控制 Windows 软件
- 开发环境（Node/Python/Git/Tmux/michelle）装 WSL2 端
- Tmux 完全支持，用法和 Linux 一样
