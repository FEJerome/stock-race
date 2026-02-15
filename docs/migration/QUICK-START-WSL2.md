# WSL2 快速启动指南

> 针对高性能电脑的完整环境搭建指南
> 从 VM 迁移到 WSL2 + Windows 微信开发者工具

## 前置要求

- Windows 11 或 Windows 10 (2004+)
- 16GB 内存
- 50GB 可用磁盘空间
- 已导出 VM 配置包: `vm-config-export-*.tar.gz`

## 第一步：安装 WSL2（Windows 上执行）

```powershell
# 以管理员身份打开 PowerShell

# 1. 启用 WSL
wsl --install

# 2. 重启电脑

# 3. 设置默认版本为 WSL2
wsl --set-default-version 2

# 4. 安装 Ubuntu 22.04
wsl --install -d Ubuntu-22.04

# 5. 按提示设置用户名密码
```

## 第二步：优化 WSL2 配置

创建 `C:\Users\<你的用户名>\.wslconfig`：

```ini
[wsl2]
memory=4GB
processors=4
swap=2GB
localhostForwarding=true
```

然后执行：
```powershell
wsl --shutdown
wsl
```

## 第三步：复制配置文件到 WSL2

```powershell
# 在 Windows PowerShell 中，将导出的配置复制到 WSL2
Copy-Item C:\Users\<用户名>\Downloads\vm-config-export-*.tar.gz \\wsl$\Ubuntu\home\<用户名>\
```

## 第四步：恢复配置（在 WSL2 中执行）

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

## 第五步：安装开发环境

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装基础工具
sudo apt install -y git curl wget vim nano tmux build-essential

# 安装 NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# 安装 Node.js
nvm install 20
nvm use 20
nvm alias default 20

# 安装 Python
sudo apt install -y python3 python3-pip

# 验证安装
which michelle
node --version
npm --version
```

## 第六步：安装 Windows 软件

### 微信开发者工具
1. 访问 https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
2. 下载 Windows 64位版本
3. 安装并启动
4. 微信扫码登录
5. 导入项目：`\\wsl$\Ubuntu\home\<用户名>\projects\stock-race\miniprogram`
6. 设置 → 安全设置 → 开启服务端口

### Claude Code
```powershell
# 在 Windows PowerShell 中执行
powershell -ExecutionPolicy Bypass -Command "Invoke-Expression ((Invoke-WebRequest -Uri 'https://claude.ai/install.ps1').Content)"
```

## 第七步：配置 MCP

创建 `%APPDATA%\Claude\settings.json`：

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

## 第八步：验证安装

```bash
# 在 WSL2 中验证配置
echo "测试 michelle 脚本:"
which michelle

echo "测试 SSH:"
ssh -T git@github.com

echo "测试环境变量:"
env | grep -E "ANTHROPIC|DEEP"
```

在 Claude Code 中测试：
```
/tools  # 应该显示微信开发者工具
```

## 完成！

现在你可以开始 100 任务循环的自动化开发了。

## 注意事项

1. **微信开发者工具**必须保持运行，MCP 才能连接
2. **服务端口**每次重启 DevTools 可能会变化，需要重新连接
3. **WSL2 内存**限制为 4GB，避免占用过多 Windows 内存
4. 定期在 WSL2 中执行 `git push` 备份代码

## 故障排除

### Q: michelle 脚本找不到
```bash
# 确保 ~/bin 在 PATH 中
export PATH="$HOME/bin:$PATH"
source ~/.bashrc
```

### Q: SSH 连接失败
```bash
# 检查 SSH 密钥权限
chmod 700 ~/.ssh
chmod 600 ~/.ssh/*
```

### Q: 微信开发者工具连接失败
1. 检查 DevTools 是否已开启服务端口
2. 检查 Windows 防火墙设置
3. 在 WSL2 中测试：`curl http://localhost:<端口>/json/list`
