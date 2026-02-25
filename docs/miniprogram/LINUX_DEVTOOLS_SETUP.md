# Linux 微信开发者工具安装指南

## 方案一：手动下载安装（推荐）

由于网络限制，请手动下载安装包：

### 步骤 1：下载安装包

**在 Windows 宿主机下载**：

1. 访问官方下载页面：
   ```
   https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
   ```

2. 选择 **Linux 版** → **x64** → **deb 包** 或 **AppImage**

3. 下载文件（约 150-200MB）：
   - `wechat_devtools_1.06.x_amd64.deb` （推荐 Ubuntu）
   - 或 `wechat_devtools_1.06.x_amd64.AppImage` （通用）

4. 通过 Samba 复制到 Linux VM：
   ```
   复制到 \\192.168.110.147\stock-race\tools\
   ```

### 步骤 2：安装依赖

在 Linux VM 执行：

```bash
# 安装必要依赖
sudo apt-get update
sudo apt-get install -y libgtk-3-0 libgconf-2-4 libnss3 libxss1 libasound2 \
    libxtst6 libxrandr2 libappindicator3-1 libsecret-1-0

# 安装中文字体（避免乱码）
sudo apt-get install -y fonts-wqy-microhei fonts-wqy-zenhei
```

### 步骤 3：安装微信开发者工具

**方式 A：deb 包安装**

```bash
cd /home/fe-jerome/projects/stock-race/tools/
sudo dpkg -i wechat_devtools_1.06.*_amd64.deb
sudo apt-get install -f  # 修复依赖
```

**方式 B：AppImage 安装**

```bash
cd /home/fe-jerome/projects/stock-race/tools/
chmod +x wechat_devtools_1.06.*_amd64.AppImage
sudo mv wechat_devtools_1.06.*_amd64.AppImage /opt/wechat-devtools.AppImage

# 创建启动脚本
sudo tee /usr/local/bin/wechat-devtools << 'EOF'
#!/bin/bash
/opt/wechat-devtools.AppImage --no-sandbox "$@"
EOF
sudo chmod +x /usr/local/bin/wechat-devtools
```

### 步骤 4：验证安装

```bash
# 检查版本
wechat-devtools --version

# 启动（带命令行输出，用于调试）
wechat-devtools --cli
```

---

## 方案二：使用 snap 安装（简单但可能版本旧）

```bash
# 安装 snap 版本（如有）
sudo snap install wechat-web-devtools

# 启动
wechat-web-devtools
```

---

## 方案三：Wine 运行 Windows 版（不推荐）

如 Linux 版有问题，可用 Wine 运行 Windows 版：

```bash
# 安装 Wine
sudo apt-get install -y wine64

# 下载 Windows 版安装程序
# 在 Wine 中运行安装
wine ~/Downloads/微信开发者工具安装程序.exe
```

---

## 安装后配置

### 1. 配置命令行工具

```bash
# 创建 CLI 软链接
sudo ln -sf /opt/wechat-devtools/resources/app/bin/cli /usr/local/bin/wechat-cli

# 验证
wechat-cli --version
```

### 2. 配置项目路径

```bash
# 创建项目目录链接
mkdir -p ~/.config/wechat-devtools/projects
ln -sf /home/fe-jerome/projects/stock-race/miniprogram \
    ~/.config/wechat-devtools/projects/stock-race
```

### 3. 启用自动化端口

```bash
# 启动自动化模式（端口 9420）
wechat-cli auto --project /home/fe-jerome/projects/stock-race/miniprogram --port 9420
```

---

## 常见问题

### Q1: 启动报错 "Sandbox" 相关错误

```bash
# 添加 --no-sandbox 参数启动
wechat-devtools --no-sandbox
```

### Q2: 界面显示乱码

```bash
# 安装中文字体
sudo apt-get install -y fonts-wqy-microhei fonts-wqy-zenhei
```

### Q3: 无法连接真机调试

确保手机和 Linux VM 在同一网络，且防火墙未阻断。

### Q4: 登录二维码不显示

```bash
# 检查 GTK 主题
echo $GTK_THEME

# 临时切换主题
GTK_THEME=Adwaita wechat-devtools
```

---

## MCP 配置

安装完成后，配置本地 MCP：

```bash
# 编辑 Claude Code 配置
~/.config/Claude/settings.json
```

内容：
```json
{
  "mcpServers": {
    "weixin-devtools": {
      "command": "/usr/local/bin/wechat-devtools-mcp"
    }
  }
}
```

---

## 下一步

安装完成后：
1. 启动微信开发者工具
2. 使用微信扫码登录
3. 导入项目 `/home/fe-jerome/projects/stock-race/miniprogram`
4. 运行 MCP 连接测试
