#!/bin/bash
# 在 WSL2 中导入 VM 配置的脚本
# 在高性能电脑的 WSL2 中运行

EXPORT_FILE="$HOME/vm-config-export.tar.gz"

if [ ! -f "$EXPORT_FILE" ]; then
    echo "❌ 找不到配置文件: $EXPORT_FILE"
    echo "请先将 vm-config-export.tar.gz 复制到 WSL2 的 ~/ 目录"
    echo ""
    echo "复制方法:"
    echo "1. Windows 文件管理器访问 \\\\wsl$\\Ubuntu\\home\\$USER"
    echo "2. 将 vm-config-export.tar.gz 拖入该目录"
    exit 1
fi

echo "=== 导入 VM 配置到 WSL2 ==="
echo ""

# 解压
BACKUP_DIR="$HOME/vm-config-backup-temp"
mkdir -p "$BACKUP_DIR"
echo "📦 解压配置..."
tar xzvf "$EXPORT_FILE" -C "$BACKUP_DIR" --strip-components=1

# 1. 恢复 Shell 配置
echo ""
echo "🔧 恢复 Shell 配置..."
if [ -f "$BACKUP_DIR/.bashrc" ]; then
    echo "合并 .bashrc..."
    cat "$BACKUP_DIR/.bashrc" >> ~/.bashrc
fi

if [ -f "$BACKUP_DIR/.zshrc" ] && [ -f ~/.zshrc ]; then
    echo "合并 .zshrc..."
    cat "$BACKUP_DIR/.zshrc" >> ~/.zshrc
fi

# 2. 恢复 SSH
echo ""
echo "🔑 恢复 SSH 密钥..."
if [ -d "$BACKUP_DIR/.ssh" ]; then
    cp -r "$BACKUP_DIR/.ssh"/* ~/.ssh/ 2>/dev/null
    chmod 600 ~/.ssh/* 2>/dev/null
    chmod 700 ~/.ssh
    echo "✅ SSH 密钥已恢复"
fi

# 3. 恢复 Git 配置
echo ""
echo "📚 恢复 Git 配置..."
if [ -f "$BACKUP_DIR/.gitconfig" ]; then
    cp "$BACKUP_DIR/.gitconfig" ~/ 2>/dev/null
    echo "✅ Git 配置已恢复"
fi

# 4. 恢复自定义脚本
echo ""
echo "📝 恢复自定义脚本..."
if [ -d "$BACKUP_DIR/bin" ]; then
    mkdir -p ~/bin
    cp -r "$BACKUP_DIR/bin"/* ~/bin/ 2>/dev/null
    chmod +x ~/bin/* 2>/dev/null
    echo "✅ 脚本已恢复到 ~/bin"
fi

# 5. 恢复 Claude Code 配置
echo ""
echo "🤖 恢复 Claude Code 配置..."
if [ -d "$BACKUP_DIR/claude" ]; then
    mkdir -p ~/.config
    cp -r "$BACKUP_DIR/claude" ~/.config/ 2>/dev/null
    echo "✅ Claude Code 配置已恢复"
fi

# 6. 添加到 PATH
if ! grep -q "export PATH=\$HOME/bin:\$PATH" ~/.bashrc; then
    echo "" >> ~/.bashrc
    echo "# Custom scripts" >> ~/.bashrc
    echo "export PATH=\$HOME/bin:\$PATH" >> ~/.bashrc
    echo "✅ 已添加 ~/bin 到 PATH"
fi

# 7. 显示软件清单
echo ""
echo "📋 原 VM 安装的软件清单（参考）:"
if [ -f "$BACKUP_DIR/packages-dpkg.txt" ]; then
    echo "系统包: $BACKUP_DIR/packages-dpkg.txt"
fi
if [ -f "$BACKUP_DIR/packages-npm.txt" ]; then
    echo "NPM 包: $BACKUP_DIR/packages-npm.txt"
fi
if [ -f "$BACKUP_DIR/packages-pip.txt" ]; then
    echo "Python 包: $BACKUP_DIR/packages-pip.txt"
fi

# 清理
rm -rf "$BACKUP_DIR"

echo ""
echo "✅ 配置导入完成!"
echo ""
echo "下一步:"
echo "1. source ~/.bashrc (或重新打开终端)"
echo "2. 检查 michelle 等脚本是否可用: which michelle"
echo "3. 检查 SSH: ssh -T git@github.com"
echo ""
echo "可选: 根据 packages-*.txt 重新安装需要的软件"
