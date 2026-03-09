# VM → WSL2 迁移操作清单

## 阶段一：在 Linux VM 中执行（当前电脑）

### Step 1: 导出配置
```bash
# 执行完整导出脚本
~/projects/stock-race/docs/migration/export-vm-config-complete.sh

# 等待完成，确认文件生成
ls -lh ~/vm-config-export-*.tar.gz
```

### Step 2: 复制到高性能电脑
```bash
# 方法 1: 通过 scp（如果网络互通）
scp ~/vm-config-export-*.tar.gz fe-jerome@高性能电脑IP:~/Downloads/

# 方法 2: 通过共享文件夹/云盘
# 复制 vm-config-export-*.tar.gz 到移动硬盘或云盘

# 方法 3: 通过 Samba（当前方式）
# 复制到 /home/fe-jerome/projects/stock-race/
# 在 Windows 中访问 \\192.168.110.147\stock-race 获取
```

---

## 阶段二：在高性能电脑上执行

### Step 3: 安装 WSL2
```powershell
# 以管理员身份打开 PowerShell
wsl --install
# 重启电脑

# 重启后设置默认版本
wsl --set-default-version 2
wsl --install -d Ubuntu-22.04

# 创建 .wslconfig 优化内存
notepad "$env:USERPROFILE\.wslconfig"
# 写入:
# [wsl2]
# memory=4GB
# processors=4
```

### Step 4: 复制配置文件到 WSL2
```powershell
# 在 Windows PowerShell 中
Copy-Item C:\Users\fe-jerome\Downloads\vm-config-export-*.tar.gz \\wsl$\Ubuntu\home\fe-jerome\
```

### Step 5: 在 WSL2 中恢复配置
```bash
# 进入 WSL2
cd ~
tar xzvf vm-config-export-*.tar.gz
cd vm-config-export-*
./restore-to-wsl.sh
sudo cp system/etc/profile.d/claude_code_env.sh /etc/profile.d/
source ~/.bashrc
```

### Step 6: 安装开发环境
```bash
# 基础工具
sudo apt update
sudo apt install -y git curl wget vim nano tmux build-essential

# NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
if ! command -v nvm &> /dev/null; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    source ~/.bashrc
fi

# Node.js
nvm install 20
nvm use 20
nvm alias default 20

# Python
sudo apt install -y python3 python3-pip

# 验证
which michelle
which claude
node --version
```

### Step 7: 安装 Windows 软件
```powershell
# 微信开发者工具
# 从官网下载并安装

# Claude Code
powershell -ExecutionPolicy Bypass -Command "Invoke-Expression ((Invoke-WebRequest -Uri 'https://claude.ai/install.ps1').Content)"
```

### Step 8: 配置微信开发者工具
1. 启动微信开发者工具
2. 扫码登录
3. 导入项目（路径：`\\wsl$\Ubuntu\home\fe-jerome\projects\stock-race\miniprogram`）
4. 设置 → 安全设置 → 开启服务端口

### Step 9: 配置 Claude Code MCP
```powershell
# 创建配置文件
$settingsDir = "$env:APPDATA\Claude"
if (!(Test-Path $settingsDir)) {
    New-Item -ItemType Directory -Path $settingsDir
}

$settings = @'
{
  "mcpServers": {
    "weixin-devtools": {
      "command": "npx",
      "args": ["-y", "weixin-devtools-mcp@latest"]
    }
  }
}
'@

$settings | Out-File -FilePath "$settingsDir\settings.json" -Encoding utf8
```

### Step 10: 测试
```bash
# 在 WSL2 中测试配置
echo "测试 michelle 脚本:"
which michelle
cat ~/bin/michelle

echo "测试环境变量:"
env | grep -E "ANTHROPIC|CLAU|DEEP"

echo "测试 SSH:"
ssh -T git@github.com
```

在 Claude Code 中测试：
```
/tools  # 应该显示微信开发者工具
```

---

## 验证清单

- [ ] VM 配置已导出
- [ ] 文件已复制到高性能电脑
- [ ] WSL2 已安装
- [ ] 配置已导入 WSL2
- [ ] michelle 脚本可用
- [ ] SSH 密钥可用
- [ ] 微信开发者工具已安装
- [ ] 微信开发者工具已登录
- [ ] 服务端口已开启
- [ ] Claude Code 已安装
- [ ] MCP 配置完成
- [ ] 自动化测试通过

---

## 预计时间

| 阶段 | 预计时间 |
|------|---------|
| VM 导出配置 | 5 分钟 |
| 复制文件 | 5-10 分钟 |
| 安装 WSL2 | 10 分钟（含重启） |
| 恢复配置 | 5 分钟 |
| 安装软件 | 10 分钟 |
| 配置 DevTools | 5 分钟 |
| 测试验证 | 5 分钟 |
| **总计** | **40-50 分钟** |

---

## 回滚方案

如果迁移失败，可以：
1. 继续在 VM 中使用 Linux 开发
2. 或者使用 Windows + WSL2 但不使用 MCP，手动操作 DevTools

---

## 下一步

完成迁移后，即可开始 100 任务循环的自动化开发！
