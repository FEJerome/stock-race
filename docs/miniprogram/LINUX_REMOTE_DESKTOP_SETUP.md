# Linux 远程桌面配置指南

## 方案：xrdp + XFCE（推荐）

### 优势
- 使用 Windows 自带远程桌面客户端（mstsc.exe）
- XFCE 轻量流畅，适合远程操作
- 完整 Linux 桌面体验
- 微信开发者工具、代码编辑器、浏览器一站式

---

## 安装步骤

### 第 1 步：安装 XFCE 桌面

```bash
# 更新软件源
sudo apt-get update

# 安装 XFCE（轻量桌面）
sudo apt-get install -y xfce4 xfce4-goodies

# 安装中文字体
sudo apt-get install -y fonts-wqy-microhei fonts-wqy-zenhei
```

### 第 2 步：安装 xrdp

```bash
# 安装 xrdp
sudo apt-get install -y xrdp

# 配置 xrdp 使用 XFCE
echo "xfce4-session" > ~/.xsession

# 重启 xrdp 服务
sudo systemctl restart xrdp
sudo systemctl enable xrdp
```

### 第 3 步：配置防火墙

```bash
# 允许 RDP 端口（3389）
sudo ufw allow 3389/tcp

# 检查状态
sudo ufw status
```

---

## Windows 连接

### 步骤 1：启动远程桌面客户端

**方式 A：运行命令**
```
Win + R → 输入 mstsc → 回车
```

**方式 B：开始菜单**
```
开始菜单 → Windows 附件 → 远程桌面连接
```

### 步骤 2：连接配置

1. **计算机**：输入 Linux VM IP
   ```
   192.168.110.147
   ```

2. **显示选项**（建议设置）：
   - 显示配置：1920 × 1080（全高清）
   - 颜色：真彩色（24 位）
   - 本地资源 → 剪贴板：勾选
   - 体验 → 选择 "LAN (10 Mbps 或更高)"

3. **点击连接**

### 步骤 3：登录

在 xrdp 登录界面：
- **Session**：Xorg
- **username**：`fe-jerome`
- **password**：`KlXsX4869`

点击 **OK** 登录。

---

## 微信开发者工具配置

### 第 1 步：启动微信开发者工具

在远程桌面中打开终端：

```bash
# 方法 1：图形界面启动
点击左上角菜单 → 开发 → 微信开发者工具

# 方法 2：命令行启动
/snap/bin/wechat-devtools
```

### 第 2 步：微信扫码登录

1. 微信开发者工具会显示二维码
2. 用手机微信扫码登录
3. 登录成功后即可使用

### 第 3 步：导入项目

1. 点击 **+** 号或菜单 → 项目 → 导入项目
2. 选择路径：`/home/fe-jerome/projects/stock-race/miniprogram`
3. 点击 **导入**

### 第 4 步：启用自动化

```bash
# 在远程桌面终端中执行
/snap/bin/wechat-devtools auto --project /home/fe-jerome/projects/stock-race/miniprogram --port 9420
```

---

## MCP 配置

### 配置 Claude Code

编辑 `~/.config/Claude/settings.json`：

```json
{
  "mcpServers": {
    "weixin-devtools": {
      "command": "/snap/bin/wechat-devtools-mcp"
    }
  }
}
```

### 创建 MCP 脚本（如需要）

```bash
sudo tee /snap/bin/wechat-devtools-mcp << 'EOF'
#!/bin/bash
# WeChat DevTools MCP Server for Linux
PROJECT_PATH="/home/fe-jerome/projects/stock-race/miniprogram"
CLI_PATH="/snap/bin/wechat-devtools"

# 使用 miniprogram-automator 实现 MCP 协议
node /home/fe-jerome/projects/stock-race/tools/mcp-server.js
EOF

sudo chmod +x /snap/bin/wechat-devtools-mcp
```

---

## 日常使用流程

```
1. Windows 启动远程桌面连接
   └─ 连接到 192.168.110.147

2. 在远程桌面中
   ├─ 启动微信开发者工具
   ├─ 微信扫码登录（如需要）
   ├─ 打开项目
   └─ 启动自动化端口（9420）

3. Linux 终端（Claude Code）
   └─ MCP 自动连接到 localhost:9420

4. 开发工作
   ├─ 代码编辑：在 Linux 终端使用 Cursor/Vim
   ├─ 调试预览：在远程桌面查看 DevTools
   └─ 自动化测试：通过 MCP 控制
```

---

## 优化设置

### 1. 远程桌面性能优化

```bash
# 禁用 XFCE 特效（更流畅）
xfce4-settings-manager → 窗口管理器微调 → 合成 → 取消勾选"启用显示合成"

# 禁用桌面背景
xfce4-settings-manager → 桌面 → 背景 → 样式：无
```

### 2. 分辨率自适应

```bash
# 在 xrdp 登录界面选择不同分辨率
# 或使用 xrandr 动态调整
xrandr --output VNC-0 --mode 1920x1080
```

### 3. 剪贴板共享

Windows 远程桌面默认启用剪贴板共享，可直接复制粘贴。

### 4. 文件传输

通过 Samba 共享（已配置）：
- Linux 路径：`/home/fe-jerome/projects/stock-race`
- Windows 路径：`\\192.168.110.147\stock-race`

---

## 常见问题

### Q1: 远程桌面连接黑屏

```bash
# 检查 xrdp 状态
sudo systemctl status xrdp

# 重启 xrdp
sudo systemctl restart xrdp

# 检查日志
sudo tail -f /var/log/xrdp.log
```

### Q2: 微信开发者工具字体乱码

```bash
# 安装中文字体
sudo apt-get install -y fonts-wqy-microhei fonts-wqy-zenhei

# 重启 DevTools
```

### Q3: 远程桌面断开连接

```bash
# 使用 tmux/screen 保持会话运行
tmux new -s dev
# 在 tmux 中运行 DevTools

# 重新连接后恢复
tmux attach -t dev
```

### Q4: 性能卡顿

1. 降低远程桌面分辨率（1280×720）
2. 减少颜色深度（16 位）
3. 关闭 XFCE 桌面特效
4. 确保网络稳定（建议使用有线连接）

---

## 备选方案：VNC

如 xrdp 有问题，可用 VNC：

```bash
# 安装 VNC 服务器
sudo apt-get install -y tightvncserver

# 设置密码
vncpasswd

# 启动 VNC
vncserver :1 -geometry 1920x1080 -depth 24

# Windows 使用 VNC Viewer 连接
# 地址：192.168.110.147:5901
```

---

## 检查清单

- [ ] XFCE 桌面安装完成
- [ ] xrdp 安装并启动
- [ ] 防火墙 3389 端口开放
- [ ] Windows 可以远程连接
- [ ] 微信开发者工具安装完成
- [ ] 微信扫码登录成功
- [ ] 项目导入成功
- [ ] 自动化端口（9420）启动成功
- [ ] MCP 配置完成

---

**下一步**：执行安装步骤，然后告诉我连接结果。
