#!/bin/bash
# 完整 VM 配置导出脚本
# 在你的 Linux VM 中运行

set -e

EXPORT_DATE=$(date +%Y%m%d_%H%M%S)
EXPORT_DIR="$HOME/vm-config-export-${EXPORT_DATE}"
EXPORT_FILE="$HOME/vm-config-export-${EXPORT_DATE}.tar.gz"

mkdir -p "$EXPORT_DIR"

echo "========================================"
echo "  VM 配置完整导出工具"
echo "========================================"
echo "导出时间: $EXPORT_DATE"
echo "导出目录: $EXPORT_DIR"
echo ""

# 1. 系统级配置
echo "📦 [1/12] 导出系统级环境配置..."
mkdir -p "$EXPORT_DIR/system/etc/profile.d"
sudo cp /etc/profile.d/claude_code_env.sh "$EXPORT_DIR/system/etc/profile.d/" 2>/dev/null || echo "  需要 sudo 权限复制 claude_code_env.sh"
if [ -f /etc/profile.d/claude_code_env.sh ]; then
    cp /etc/profile.d/claude_code_env.sh "$EXPORT_DIR/system/etc/profile.d/" 2>/dev/null || true
fi

# 2. Shell 配置
echo "📦 [2/12] 导出 Shell 配置..."
for file in ~/.bashrc ~/.bash_profile ~/.bash_login ~/.profile ~/.bash_aliases ~/.bash_logout; do
    if [ -f "$file" ]; then
        cp "$file" "$EXPORT_DIR/" 2>/dev/null && echo "  ✅ $(basename $file)"
    fi
done

# Zsh 配置
for file in ~/.zshrc ~/.zprofile ~/.zlogin ~/.zlogout ~/.p10k.zsh ~/.oh-my-zsh; do
    if [ -e "$file" ]; then
        cp -r "$file" "$EXPORT_DIR/" 2>/dev/null && echo "  ✅ $(basename $file)"
    fi
done

# 3. Claude Code 完整配置
echo "📦 [3/12] 导出 Claude Code 配置..."
if [ -d ~/.claude ]; then
    cp -r ~/.claude "$EXPORT_DIR/" && echo "  ✅ ~/.claude (完整配置)"
fi
if [ -d ~/.config/claude ]; then
    mkdir -p "$EXPORT_DIR/.config"
    cp -r ~/.config/claude "$EXPORT_DIR/.config/" && echo "  ✅ ~/.config/claude"
fi

# 4. 自定义脚本
echo "📦 [4/12] 导出自定义脚本..."
if [ -d ~/bin ]; then
    cp -r ~/bin "$EXPORT_DIR/" && echo "  ✅ ~/bin ($(ls ~/bin | wc -l) 个脚本)"
fi

# 5. SSH 和 GPG
echo "📦 [5/12] 导出 SSH 和 GPG 密钥..."
if [ -d ~/.ssh ]; then
    cp -r ~/.ssh "$EXPORT_DIR/" && chmod 600 "$EXPORT_DIR/.ssh"/* 2>/dev/null
    echo "  ✅ ~/.ssh"
fi
if [ -d ~/.gnupg ]; then
    cp -r ~/.gnupg "$EXPORT_DIR/" && chmod 700 "$EXPORT_DIR/.gnupg" && chmod 600 "$EXPORT_DIR/.gnupg"/* 2>/dev/null
    echo "  ✅ ~/.gnupg"
fi

# 6. Git 配置
echo "📦 [6/12] 导出 Git 配置..."
for file in ~/.gitconfig ~/.gitignore_global ~/.gitattributes; do
    if [ -f "$file" ]; then
        cp "$file" "$EXPORT_DIR/" && echo "  ✅ $(basename $file)"
    fi
done

# 7. NPM/Yarn/PNPM 配置
echo "📦 [7/12] 导出包管理器配置..."
for file in ~/.npmrc ~/.yarnrc ~/.yarnrc.yml ~/.pnpmrc ~/.nvmrc; do
    if [ -f "$file" ]; then
        cp "$file" "$EXPORT_DIR/" && echo "  ✅ $(basename $file)"
    fi
done

# 导出 nvm 配置（不包含 node_modules，只保留版本列表）
if [ -d ~/.nvm ]; then
    mkdir -p "$EXPORT_DIR/.nvm"
    ls ~/.nvm/versions/node/ > "$EXPORT_DIR/.nvm/installed_versions.txt" 2>/dev/null || true
    echo "  ✅ NVM 版本清单"
fi

# 8. Python 配置
echo "📦 [8/12] 导出 Python 配置..."
if [ -d ~/.config/pip ]; then
    mkdir -p "$EXPORT_DIR/.config"
    cp -r ~/.config/pip "$EXPORT_DIR/.config/" && echo "  ✅ pip 配置"
fi
for file in ~/.pythonrc ~/.python_history ~/.pylintrc ~/.flake8; do
    if [ -f "$file" ]; then
        cp "$file" "$EXPORT_DIR/" && echo "  ✅ $(basename $file)"
    fi
done

# 导出 pip 包清单
pip3 list --format=freeze > "$EXPORT_DIR/pip-packages.txt" 2>/dev/null || true

# 9. 开发工具配置
echo "📦 [9/12] 导出开发工具配置..."
for tool in code cursor vim nvim tmux docker kubectl helm; do
    if [ -d ~/.config/$tool ]; then
        mkdir -p "$EXPORT_DIR/.config"
        cp -r ~/.config/$tool "$EXPORT_DIR/.config/" && echo "  ✅ $tool"
    fi
done

# Vim/Neovim
for file in ~/.vimrc ~/.vim ~/.config/nvim; do
    if [ -e "$file" ]; then
        cp -r "$file" "$EXPORT_DIR/" 2>/dev/null && echo "  ✅ $(basename $file)"
    fi
done

# 10. 云服务/CLI 工具配置
echo "📦 [10/12] 导出云服务 CLI 配置..."
for cloud in aws azure gcloud aliyun tencentcloud; do
    if [ -d ~/.$cloud ]; then
        cp -r ~/.$cloud "$EXPORT_DIR/" && echo "  ✅ $cloud"
    fi
done

# 11. 数据库工具配置
echo "📦 [11/12] 导出数据库工具配置..."
for file in ~/.psqlrc ~/.my.cnf ~/.mongorc.js ~/.rediscli_history; do
    if [ -f "$file" ]; then
        cp "$file" "$EXPORT_DIR/" && echo "  ✅ $(basename $file)"
    fi
done

# 12. 其他重要配置
echo "📦 [12/12] 导出其他配置..."

# Docker 配置
if [ -f ~/.docker-env ]; then
    cp ~/.docker-env "$EXPORT_DIR/" && echo "  ✅ .docker-env"
fi

# 环境变量导出
env | grep -E "^(PATH|HOME|USER|EDITOR|LANG|TERM|DISPLAY|XDG|CLAU|ANTHROPIC|DEEP|GLM|KIMI|API|NVM)" | sort > "$EXPORT_DIR/environment-variables.txt" && echo "  ✅ 环境变量"

# 系统包清单
dpkg -l > "$EXPORT_DIR/system-packages.txt" 2>/dev/null || true
npm list -g --depth=0 > "$EXPORT_DIR/npm-global-packages.txt" 2>/dev/null || true

# 创建恢复说明
cat > "$EXPORT_DIR/README-RESTORE.md" << 'EOF'
# VM 配置恢复说明

## 快速恢复步骤

### 1. 在 WSL2 中解压
```bash
cd ~
tar xzvf vm-config-export-XXXX.tar.gz
cd vm-config-export-XXXX
```

### 2. 运行自动导入脚本
```bash
./restore-to-wsl.sh
```

### 3. 手动处理系统级配置（需要 sudo）
```bash
sudo cp system/etc/profile.d/claude_code_env.sh /etc/profile.d/
```

### 4. 重新加载配置
```bash
source ~/.bashrc
# 或
exec bash
```

## 包含的配置
- ✅ Shell 配置 (.bashrc, .zshrc 等)
- ✅ Claude Code 完整配置 (~/.claude)
- ✅ 自定义脚本 (~/bin)
- ✅ SSH/GPG 密钥
- ✅ Git 配置
- ✅ NPM/Python 配置
- ✅ 开发工具配置
- ✅ 云服务 CLI 配置

## 注意事项
1. 检查并更新 API 密钥（如果已更换）
2. 重新安装 NVM 和 Node.js 版本
3. 根据需要安装系统包（参考 system-packages.txt）
4. WSL2 中 DISPLAY 变量可能需要调整

EOF

# 创建自动恢复脚本
cat > "$EXPORT_DIR/restore-to-wsl.sh" << 'EOF'
#!/bin/bash
# 自动恢复脚本 - 在 WSL2 中运行

echo "========================================"
echo "  VM 配置自动恢复"
echo "========================================"
echo ""

BACKUP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd ~

# 1. 恢复 Shell 配置
echo "🔧 [1/8] 恢复 Shell 配置..."
for file in .bashrc .bash_profile .profile .zshrc .zprofile .p10k.zsh; do
    if [ -f "$BACKUP_DIR/$file" ]; then
        if [ -f "$HOME/$file" ]; then
            cp "$HOME/$file" "$HOME/${file}.backup.$(date +%Y%m%d)"
            echo "  已备份现有 $file"
        fi
        cp "$BACKUP_DIR/$file" "$HOME/"
        echo "  ✅ $file"
    fi
done

# 2. 恢复 Claude Code 配置
echo "🔧 [2/8] 恢复 Claude Code 配置..."
if [ -d "$BACKUP_DIR/.claude" ]; then
    mkdir -p ~/.claude
    cp -r "$BACKUP_DIR/.claude"/* ~/.claude/ 2>/dev/null || true
    echo "  ✅ ~/.claude"
fi
if [ -d "$BACKUP_DIR/.config/claude" ]; then
    mkdir -p ~/.config/claude
    cp -r "$BACKUP_DIR/.config/claude"/* ~/.config/claude/ 2>/dev/null || true
    echo "  ✅ ~/.config/claude"
fi

# 3. 恢复自定义脚本
echo "🔧 [3/8] 恢复自定义脚本..."
if [ -d "$BACKUP_DIR/bin" ]; then
    mkdir -p ~/bin
    cp -r "$BACKUP_DIR/bin"/* ~/bin/ 2>/dev/null || true
    chmod +x ~/bin/* 2>/dev/null || true
    echo "  ✅ ~/bin ($(ls ~/bin 2>/dev/null | wc -l) 个脚本)"
fi

# 4. 恢复 SSH 和 GPG
echo "🔧 [4/8] 恢复 SSH 和 GPG..."
if [ -d "$BACKUP_DIR/.ssh" ]; then
    mkdir -p ~/.ssh
    cp -r "$BACKUP_DIR/.ssh"/* ~/.ssh/ 2>/dev/null || true
    chmod 700 ~/.ssh
    chmod 600 ~/.ssh/* 2>/dev/null || true
    chmod 644 ~/.ssh/*.pub 2>/dev/null || true
    echo "  ✅ ~/.ssh"
fi
if [ -d "$BACKUP_DIR/.gnupg" ]; then
    cp -r "$BACKUP_DIR/.gnupg" ~/ && chmod 700 ~/.gnupg
    echo "  ✅ ~/.gnupg"
fi

# 5. 恢复 Git 配置
echo "🔧 [5/8] 恢复 Git 配置..."
for file in .gitconfig .gitignore_global .gitattributes; do
    if [ -f "$BACKUP_DIR/$file" ]; then
        cp "$BACKUP_DIR/$file" "$HOME/"
        echo "  ✅ $file"
    fi
done

# 6. 恢复包管理器配置
echo "🔧 [6/8] 恢复包管理器配置..."
for file in .npmrc .yarnrc .yarnrc.yml .pnpmrc; do
    if [ -f "$BACKUP_DIR/$file" ]; then
        cp "$BACKUP_DIR/$file" "$HOME/"
        echo "  ✅ $file"
    fi
done

# 7. 恢复开发工具配置
echo "🔧 [7/8] 恢复开发工具配置..."
if [ -d "$BACKUP_DIR/.config" ]; then
    mkdir -p ~/.config
    for tool in code cursor vim nvim tmux docker kubectl; do
        if [ -d "$BACKUP_DIR/.config/$tool" ]; then
            cp -r "$BACKUP_DIR/.config/$tool" ~/.config/
            echo "  ✅ $tool"
        fi
    done
fi

# 恢复 Vim/Neovim
for item in .vimrc .vim; do
    if [ -e "$BACKUP_DIR/$item" ]; then
        cp -r "$BACKUP_DIR/$item" "$HOME/"
        echo "  ✅ $item"
    fi
done

# 8. 恢复其他配置
echo "🔧 [8/8] 恢复其他配置..."
for cloud in .aws .azure .gcloud .aliyun .tencentcloud; do
    if [ -d "$BACKUP_DIR/$cloud" ]; then
        cp -r "$BACKUP_DIR/$cloud" "$HOME/"
        echo "  ✅ $cloud"
    fi
done

# 确保 PATH 包含 ~/bin
if ! grep -q 'export PATH="$HOME/bin:$PATH"' ~/.bashrc 2>/dev/null; then
    echo '' >> ~/.bashrc
    echo '# User custom scripts' >> ~/.bashrc
    echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
    echo "  ✅ 已添加 ~/bin 到 PATH"
fi

echo ""
echo "========================================"
echo "  ✅ 配置恢复完成！"
echo "========================================"
echo ""
echo "下一步:"
echo "1. 重启终端或执行: source ~/.bashrc"
echo "2. 检查 michelle 脚本: which michelle"
echo "3. 验证 SSH: ssh -T git@github.com"
echo "4. 安装 NVM: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
echo "5. 根据 $BACKUP_DIR/system-packages.txt 安装需要的系统包"
echo ""
echo "⚠️  重要提醒:"
echo "   系统级配置需要手动复制:"
echo "   sudo cp $BACKUP_DIR/system/etc/profile.d/claude_code_env.sh /etc/profile.d/"
echo ""
EOF

chmod +x "$EXPORT_DIR/restore-to-wsl.sh"

# 打包
echo ""
echo "📦 正在打包..."
cd ~
tar czvf "$EXPORT_FILE" -C "$(dirname $EXPORT_DIR)" "$(basename $EXPORT_DIR)"

# 生成摘要
echo ""
echo "========================================"
echo "  ✅ 配置导出完成！"
echo "========================================"
echo ""
echo "📁 导出文件: $EXPORT_FILE"
echo "📊 文件大小: $(du -h $EXPORT_FILE | cut -f1)"
echo ""
echo "📋 导出内容摘要:"
echo "  - 系统配置: $(ls $EXPORT_DIR/system/etc/profile.d/ 2>/dev/null | wc -l) 个"
echo "  - Shell 配置: $(ls $EXPORT_DIR/.bashrc $EXPORT_DIR/.zshrc 2>/dev/null | wc -l) 个"
echo "  - 自定义脚本: $(ls $EXPORT_DIR/bin/ 2>/dev/null | wc -l) 个"
echo "  - Claude 配置: $([ -d $EXPORT_DIR/.claude ] && echo "✅" || echo "❌")"
echo "  - SSH 密钥: $([ -d $EXPORT_DIR/.ssh ] && echo "✅" || echo "❌")"
echo ""
echo "📝 恢复说明: $EXPORT_DIR/README-RESTORE.md"
echo "🚀 自动恢复脚本: $EXPORT_DIR/restore-to-wsl.sh"
echo ""
echo "下一步操作:"
echo "1. 复制此文件到高性能电脑的 Windows 桌面"
echo "2. 在 WSL2 中解压: tar xzvf vm-config-export-*.tar.gz"
echo "3. 进入目录运行: ./restore-to-wsl.sh"
echo "4. 手动复制系统配置: sudo cp system/etc/profile.d/claude_code_env.sh /etc/profile.d/"
echo ""
