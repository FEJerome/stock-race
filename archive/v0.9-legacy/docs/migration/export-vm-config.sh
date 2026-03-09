#!/bin/bash
# 导出 VM 配置到 WSL2 的脚本
# 在高性能电脑的 Linux VM 中运行

EXPORT_DIR="$HOME/vm-config-backup-$(date +%Y%m%d)"
mkdir -p "$EXPORT_DIR"

echo "=== 导出 VM 配置 ==="
echo "导出目录: $EXPORT_DIR"
echo ""

# 1. Shell 配置
echo "📦 导出 Shell 配置..."
cp ~/.bashrc "$EXPORT_DIR/" 2>/dev/null
cp ~/.zshrc "$EXPORT_DIR/" 2>/dev/null
cp ~/.profile "$EXPORT_DIR/" 2>/dev/null
cp ~/.npmrc "$EXPORT_DIR/" 2>/dev/null

# 2. SSH 配置
echo "📦 导出 SSH 密钥和配置..."
cp -r ~/.ssh "$EXPORT_DIR/" 2>/dev/null
chmod 600 "$EXPORT_DIR/.ssh"/* 2>/dev/null

# 3. Git 配置
echo "📦 导出 Git 配置..."
cp ~/.gitconfig "$EXPORT_DIR/" 2>/dev/null

# 4. 自定义脚本
echo "📦 导出 ~/bin 脚本..."
if [ -d ~/bin ]; then
    cp -r ~/bin "$EXPORT_DIR/"
fi

# 5. Claude Code / Cloud Code 配置
echo "📦 导出 Cloud Code 配置..."
if [ -d ~/.config/claude ]; then
    cp -r ~/.config/claude "$EXPORT_DIR/" 2>/dev/null
fi

# 6. VSCode/Cursor 配置
echo "📦 导出编辑器配置..."
if [ -d ~/.config/Code ]; then
    cp -r ~/.config/Code "$EXPORT_DIR/vscode-config" 2>/dev/null
fi

# 7. 其他常用配置
echo "📦 导出其他配置..."
cp ~/.vimrc "$EXPORT_DIR/" 2>/dev/null
cp ~/.tmux.conf "$EXPORT_DIR/" 2>/dev/null

# 8. 环境变量
echo "📦 导出环境变量..."
env | grep -E "^(PATH|HOME|USER|EDITOR|LANG|JAVA|NODE|PYTHON)" > "$EXPORT_DIR/environment.txt"

# 9. 已安装软件清单
echo "📦 导出已安装软件清单..."
dpkg -l > "$EXPORT_DIR/packages-dpkg.txt" 2>/dev/null
npm list -g --depth=0 > "$EXPORT_DIR/packages-npm.txt" 2>/dev/null
pip3 list > "$EXPORT_DIR/packages-pip.txt" 2>/dev/null

# 打包
echo ""
echo "📦 打包配置..."
cd ~
tar czvf "$HOME/vm-config-export.tar.gz" -C "$(dirname $EXPORT_DIR)" "$(basename $EXPORT_DIR)"

echo ""
echo "✅ 配置导出完成!"
echo "文件位置: $HOME/vm-config-export.tar.gz"
echo ""
echo "导出内容:"
ls -lh "$EXPORT_DIR"
echo ""
echo "下一步:"
echo "1. 将此文件复制到高性能电脑的 Windows 系统"
echo "2. 在 WSL2 中解压并导入配置"
