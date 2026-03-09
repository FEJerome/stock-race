# 高性能电脑 WSL2 + 微信开发者工具 完整设置指南

## 硬件要求确认

| 组件 | 你的配置 | 是否满足 |
|------|---------|---------|
| 内存 | 16GB | ✅ 充足 |
| 存储 | SSD 40-50GB 可用 | ✅ 刚好 |
| CPU | 高性能 | ✅ 优秀 |

## 第一步：启用 WSL2（在 Windows 上执行）

### 1.1 以管理员身份打开 PowerShell

```powershell
# 检查 Windows 版本（需要 Windows 10 版本 2004+ 或 Windows 11）
winver

# 启用 WSL
wsl --install

# 重启电脑
```

### 1.2 重启后设置 WSL2 为默认版本

```powershell
# 设置默认版本为 WSL2
wsl --set-default-version 2

# 安装 Ubuntu 22.04
wsl --install -d Ubuntu-22.04

# 设置用户名密码
```

### 1.3 优化 WSL2 内存配置（重要！）

在 Windows 上创建文件 `C:\Users\<你的用户名>\.wslconfig`：

```ini
[wsl2]
memory=4GB          # 限制 WSL2 使用 4GB 内存
processors=4        # 使用 4 个 CPU 核心
swap=2GB           # 2GB 交换空间
localhostForwarding=true
```

然后执行：
```powershell
wsl --shutdown
wsl  # 重新启动
```

## 第二步：在 WSL2 中恢复配置

### 2.1 从 VM 复制配置文件

在 VM 中执行导出脚本后，将文件复制到 Windows，然后：

```powershell
# 在 Windows PowerShell 中，复制到 WSL
Copy-Item C:\Users\<用户名>\Downloads\vm-config-export-*.tar.gz \\wsl$\Ubuntu\home\<用户名>\
```

### 2.2 在 WSL2 中解压并恢复

```bash
# 进入 WSL2
cd ~

# 解压配置
tar xzvf vm-config-export-*.tar.gz

# 进入解压目录
cd vm-config-export-*

# 执行自动恢复脚本
./restore-to-wsl.sh

# 恢复系统级配置（需要 sudo）
sudo cp system/etc/profile.d/claude_code_env.sh /etc/profile.d/

# 重新加载配置
source ~/.bashrc
```

### 2.3 安装必要软件

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装基础工具
sudo apt install -y git curl wget vim nano tmux

# 安装 NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# 安装 Node.js（根据 vm-config-export 中的版本列表）
nvm install 20
nvm use 20
nvm alias default 20

# 安装 Python 工具
sudo apt install -y python3 python3-pip python3-venv

# 安装其他常用工具
sudo apt install -y build-essential
```

## 第三步：安装微信开发者工具（Windows 端）

### 3.1 下载安装

1. 访问：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
2. 下载 **Windows 64位** 版本
3. 安装到默认路径

### 3.2 配置微信开发者工具

1. 启动微信开发者工具
2. 微信扫码登录
3. 导入项目：
   - 项目路径：`\\wsl$\Ubuntu\home\<用户名>\projects\stock-race\miniprogram`
   - 或先克隆代码到 WSL，然后通过 DrvFs 访问

4. **开启服务端口**：
   - 设置 → 安全设置 → 开启服务端口
   - 记录端口号（通常是 9420 或随机端口）

## 第四步：安装 Claude Code（Windows 端）

```powershell
# 在 Windows PowerShell 中执行
powershell -ExecutionPolicy Bypass -Command "Invoke-Expression ((Invoke-WebRequest -Uri 'https://claude.ai/install.ps1').Content)"
```

### 配置 MCP（Windows 版）

创建文件 `%APPDATA%\Claude\settings.json`：

```json
{
  "mcpServers": {
    "weixin-devtools": {
      "command": "npx",
      "args": ["-y", "weixin-devtools-mcp@latest"]
    }
  }
}
```

## 第五步：测试完整工作流

### 5.1 测试 WSL2 配置

```bash
# 在 WSL2 中
echo "测试 michelle 脚本:"
which michelle

# 测试 SSH
ssh -T git@github.com

# 测试 Git
git config --global user.name
git config --global user.email

# 测试 Node
node --version
npm --version
```

### 5.2 测试 MCP 连接

1. 确保微信开发者工具已启动并开启服务端口
2. 在 Claude Code 中执行：
   ```
   /tools
   ```
3. 应该显示微信开发者工具相关工具

### 5.3 测试自动化

在 Claude Code 中：
```
连接到微信开发者工具
截图当前页面
```

## 第六步：100 任务循环支持

### 6.1 持久化运行方案

为确保 100 个循环任务中 DevTools 始终可用：

```powershell
# 创建 Windows 任务计划程序，开机自动启动 DevTools
# 或使用 PM2 等工具管理
```

### 6.2 数据备份策略

```bash
# 在 WSL2 中定期备份
cd ~/projects/stock-race
git add .
git commit -m "Auto backup before AI loop"
git push
```

## 常见问题

### Q1: WSL2 占用空间太大

```bash
# 在 PowerShell 中压缩 WSL 磁盘
wsl --shutdown
diskpart
# 选择 vhdx 文件路径，执行 compact
```

### Q2: 微信开发者工具连接不上

1. 检查 Windows 防火墙设置
2. 确保 DevTools 服务端口已开启
3. 在 WSL2 中测试：`curl http://localhost:<端口>/json/list`

### Q3: 内存不足

编辑 `.wslconfig`，减少 `memory` 分配，或关闭不必要的 Windows 应用。

## 完成检查清单

- [ ] WSL2 已安装并运行
- [ ] VM 配置已导入（michelle 脚本可用）
- [ ] 微信开发者工具已安装并登录
- [ ] Claude Code 已安装
- [ ] MCP 配置完成
- [ ] 项目代码已克隆/导入
- [ ] 自动化测试通过（截图成功）

## 下一步

完成上述步骤后，你的高性能电脑就准备好了 100 任务循环的自动化开发环境！
