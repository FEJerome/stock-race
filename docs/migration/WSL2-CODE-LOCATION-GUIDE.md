# WSL2 代码存放位置与核心价值详解

## 代码应该放在哪里？

### ❌ 不推荐：Windows 共享文件夹（/mnt/c/）

```bash
# 这种位置性能很差
cd /mnt/c/Users/fe-jerome/projects/stock-race
npm install  # 慢 10-20 倍！
```

**问题**：
- WSL2 通过 9P 协议访问 Windows 文件系统
- 每次文件操作都要跨系统转换
- Node_modules 安装慢得无法忍受
- Git 操作卡顿
- 热重载延迟高

### ✅ 推荐：WSL2 原生文件系统（~/projects/）

```bash
# 正确做法：放在 WSL2 的 ext4 文件系统中
cd ~/projects/stock-race
npm install  # 原生速度！
```

**优势**：
- 原生 ext4 性能
- Node.js/Python 运行速度接近原生 Linux
- Git 操作流畅
- 与生产环境完全一致

## 性能对比实测

| 操作 | Windows 挂载 (/mnt/c/) | WSL2 原生 (~/projects) | 速度差异 |
|------|------------------------|------------------------|----------|
| npm install | 3-5 分钟 | 20-30 秒 | **10x 慢** |
| git status | 2-3 秒 | 0.1 秒 | **20x 慢** |
| 文件热重载 | 1-2 秒延迟 | 实时 | **卡顿** |
| Docker 构建 | 很慢 | 正常 | **显著** |
| 启动 10 个服务 | 30+ 秒 | 5-8 秒 | **4x 慢** |

## 那怎么在 Windows 中编辑代码？

### 方案一：VS Code + WSL2 插件（推荐）

```bash
# 在 WSL2 中执行
 code .

# 这会启动 Windows 的 VS Code，但编辑的是 WSL2 中的文件
# 完全透明，性能无损
```

VS Code 会自动安装 WSL2 插件，提供：
- Windows 端的图形界面
- WSL2 端的文件系统性能
- 终端直接连接 WSL2
- 调试器在 WSL2 中运行

### 方案二：Claude Code（Windows 端）

Windows 的 Claude Code 可以直接操作 WSL2 文件：

```
# Claude Code 内部命令
/read /home/fe-jerome/projects/stock-race/backend/src/app.js

# 执行 WSL2 命令
!wsl npm run dev
```

### 方案三：JetBrains 系列（IntelliJ/WebStorm）

同样的原理 - Windows GUI + WSL2 文件系统 + WSL2 工具链

### 方案四：Windows 资源管理器直接访问

```powershell
# 在 Windows 资源管理器地址栏输入
\wsl$\Ubuntu\home\fe-jerome\projects

# 可以浏览、复制文件，但不建议直接编辑（权限问题）
```

## 使用 WSL2 到底有什么好处？

### 1. 生产环境一致性（最关键）

```
生产服务器 (Linux Docker)
    ↓ 几乎完全一致
WSL2 (Ubuntu-22.04 + Docker)
    ↓ 开发调试
Windows 11 (GUI 工具)
```

**实际例子**：

| 场景 | 纯 Windows 开发 | WSL2 开发 |
|------|----------------|-----------|
| Dockerfile 测试 | 需要推送到服务器测试 | 本地直接 `docker build` |
| 脚本兼容性 | 写两套（Win/Linux） | 一套 Linux 脚本通用 |
| 路径分隔符 | 处理 `\` vs `/` 头痛 | 统一 `/` |
| 权限问题 | NTFS 权限与 Linux 不同 | 真实的 Linux 权限 |
| Shell 脚本 | 用 Git Bash 勉强跑 | 原生 bash/zsh |

### 2. Docker 原生支持（无需 Docker Desktop）

```bash
# 在 WSL2 中，Docker 就是 Linux Docker
# 与生产环境的 Docker 100% 一致

docker-compose up -d
# 行为与服务器上完全一致

# 镜像、卷、网络都是 Linux 原生的
# 没有 Windows Docker Desktop 的那些坑
```

### 3. 开发工具链完整性

**WSL2 中有，Windows 没有或很难配置的工具**：

| 工具 | WSL2 | Windows 替代方案 | 对比 |
|------|------|-----------------|------|
| Tmux | ✅ 原生 | ❌ 无 | 会话管理神器 |
| Zsh + Oh My Zsh | ✅ 完美 | ⚠️ Git Bash | 插件生态差距大 |
| fzf | ✅ 原生 | ⚠️ 功能受限 | 模糊查找 |
| ripgrep (rg) | ✅ 原生 | ⚠️ 需安装 | 代码搜索 |
| fd | ✅ 原生 | ⚠️ 需安装 | 快速 find |
| bat | ✅ 原生 | ⚠️ 需安装 | 语法高亮 cat |
| exa/lsd | ✅ 原生 | ❌ 无 | 现代化 ls |
| htop | ✅ 原生 | ❌ 无 | 进程管理 |
| jq | ✅ 原生 | ⚠️ 需安装 | JSON 处理 |
| awk/sed | ✅ 原生 | ⚠️ 阉割版 | 文本处理 |
| ssh-agent | ✅ 原生 | ⚠️ Pageant | 密钥管理 |
| gpg | ✅ 原生 | ⚠️ Gpg4win | 签名加密 |

### 4. 脚本可移植性

**你的 michelle 脚本为例**：

```bash
#!/bin/bash
# michelle - 这个脚本在 WSL2 中完美运行
# 在 Windows 上需要 Git Bash 或 WSL

select_model() {
    # fzf 模糊选择 - WSL2 原生支持
    echo "$MODELS" | fzf --height 40% --reverse
}

set_api_key() {
    # export 环境变量 - Linux 原生
    export ANTHROPIC_API_KEY="$key"
    # 写到 ~/.bashrc - Linux 路径
    echo "export ANTHROPIC_API_KEY=\"$key\"" >> ~/.bashrc
}
```

这个脚本在 WSL2 中一行不改就能跑，在 Windows 上需要：
- 安装 Git Bash
- 安装 fzf for Windows
- 处理路径差异
- 处理换行符差异

### 5. 与 Windows 的无缝集成（这才是 WSL2 的真正价值）

```
┌──────────────────────────────────────────────────────────┐
│  你可以同时使用两边的优势：                                │
│                                                          │
│  Windows 端：                                             │
│  - 微信开发者工具（GUI）                                   │
│  - Chrome 浏览器                                          │
│  - VS Code / Claude Code                                  │
│  - Office / 微信                                          │
│                                                          │
│  WSL2 端：                                                │
│  - Node.js/Python 后端服务                                 │
│  - Docker 容器                                            │
│  - Tmux 开发会话                                          │
│  - Git + SSH 密钥                                         │
│  - michelle 脚本                                          │
│  - 各种 Linux CLI 工具                                     │
│                                                          │
│  两者通过 localhost 和文件系统桥接通信                      │
└──────────────────────────────────────────────────────────┘
```

**实际工作流**：

```bash
# 1. 在 Windows 打开 Claude Code
#    编辑 WSL2 中的代码（自动桥接）

# 2. 在 WSL2 的 Tmux 会话中运行服务
tmux attach -t dev
# Window 0: npm run dev (backend)
# Window 1: python main.py (AI service)
# Window 2: docker-compose up

# 3. 在 Windows 浏览器测试
#    http://localhost:3001/api/health

# 4. 在 Windows 微信开发者工具调试小程序
#    项目路径: \\wsl$\Ubuntu\home\fe-jerome\projects\stock-race\miniprogram
```

## 你的项目具体应该怎么放？

### 推荐目录结构

```
WSL2 文件系统 (ext4，高性能)
~/
├── projects/
│   └── stock-race/           ← 代码放在这里！
│       ├── miniprogram/       ← 小程序源码
│       ├── backend/           ← 后端服务
│       ├── trading-ai-service/
│       ├── market-data-service/
│       ├── news-service/
│       ├── frontend/
│       └── docker-compose.yml
│
├── bin/
│   └── michelle               ← 你的脚本
│
└── .claude/                   ← Claude Code 配置

Windows 文件系统 (NTFS，GUI 工具)
C:\Users\fe-jerome\
├── Desktop\                   ← 快捷方式可以指向 WSL2
├── Documents\                 ← 文档、图片等
├── Downloads\                 ← 下载文件
└── AppData\Local\Programs\    ← Windows 软件安装
```

### 配置步骤

**1. 在 WSL2 中创建项目目录**

```bash
mkdir -p ~/projects
cd ~/projects
git clone git@github.com:FEJerome/stock-race.git
```

**2. 解压配置包（已在仓库中）**

```bash
cd ~/projects/stock-race
tar xzvf vm-config-export-20260215_182556.tar.gz
cd vm-config-export-*
./restore-to-wsl.sh
```

**3. 在 Windows 创建快捷方式（可选）**

```powershell
# PowerShell 中创建快捷方式
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\stock-race.lnk")
$Shortcut.TargetPath = "\\wsl$\Ubuntu\home\fe-jerome\projects\stock-race"
$Shortcut.Save()
```

**4. 用 VS Code 打开**

```bash
# 在 WSL2 中
cd ~/projects/stock-race
 code .

# VS Code 会自动连接到 WSL2
```

## 常见问题

### Q: 我需要把代码同步回 Windows 吗？

**不需要**。代码只需要存在于 WSL2 中。当你需要：
- 提交代码 → 在 WSL2 中 `git push`
- 备份 → GitHub 就是备份
- 与其他工具共享 → 用 `\wsl$\Ubuntu\...` 路径

### Q: 微信开发者工具怎么访问 WSL2 中的代码？

```
微信开发者工具导入项目时，路径填：
\\wsl$\Ubuntu\home\fe-jerome\projects\stock-race\miniprogram
```

### Q: 如果 WSL2 崩溃了，代码会丢吗？

**不会**。WSL2 的 ext4 文件系统是持久化的，和 Windows 一样可靠。而且你的代码应该已经 `git push` 到 GitHub 了。

### Q: 我可以直接从 Windows 访问 WSL2 中的文件吗？

**可以，但不推荐频繁写入**：
```powershell
# 读取没问题
notepad "\wsl$\Ubuntu\home\fe-jerome\projects\stock-race\README.md"

# 大量写入（如解压大文件）会很慢
```

### Q: 那为什么不直接用 Linux 物理机？

WSL2 提供了 Windows + Linux 的**混合优势**：
- 能用微信、企业微信、钉钉（Windows 版）
- 能用微信开发者工具（只有 Windows/Mac 版）
- 能用 Office、Photoshop
- 同时有完整的 Linux 开发环境

## 总结

| 问题 | 答案 |
|------|------|
| 代码放哪？ | **WSL2 文件系统** (`~/projects/`) |
| 为什么不用共享文件夹？ | **性能差 10-20 倍** |
| 怎么编辑？ | **VS Code / Claude Code (Windows)** 自动桥接 WSL2 |
| WSL2 有什么用？ | **生产环境一致性 + Docker + Linux 工具链** |
| Tmux 能用吗？ | **完全支持** |
| michelle 脚本？ | **在 WSL2 中运行，Windows 端通过 `wsl` 调用** |

---

**一句话**：代码放在 WSL2，工具用 Windows 的，两边通过桥接无缝协作。
