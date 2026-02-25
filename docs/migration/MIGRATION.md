# 开发环境迁移指南

本目录包含从 Linux VM 迁移到 Windows + WSL2 的完整方案。

## 适用场景

- 从 Linux VM（VMware/VirtualBox）迁移到 Windows 11 + WSL2
- 保留所有开发配置（Claude Code、SSH、自定义脚本）
- 支持微信开发者工具 MCP 自动化

## 迁移流程概览

```
Linux VM
    │
    ├─ 执行导出脚本 ──→ vm-config-export-*.tar.gz
    │
    └─ 提交到 Git ─────→ GitHub/GitLab
                              │
                              ▼
                    高性能电脑（Windows 11）
                              │
                              ├─ 安装 WSL2
                              ├─ git clone 项目
                              ├─ 解压配置包
                              ├─ 执行恢复脚本
                              ├─ 安装微信开发者工具
                              └─ 配置 MCP
```

## 文档索引

| 文档 | 用途 | 阅读顺序 |
|------|------|---------|
| [docs/migration/QUICK-START-WSL2.md](docs/migration/QUICK-START-WSL2.md) | 新环境快速启动 | ⭐ 第一步 |
| [docs/migration/MIGRATION-CHECKLIST.md](docs/migration/MIGRATION-CHECKLIST.md) | 完整操作清单 | 第二步 |
| [docs/migration/WSL2-SETUP-GUIDE.md](docs/migration/WSL2-SETUP-GUIDE.md) | 详细设置指南 | 第三步 |
| [docs/migration/export-vm-config-complete.sh](docs/migration/export-vm-config-complete.sh) | 配置导出脚本 | VM 中执行 |

## 快速开始

### 1. 在当前 VM 中导出配置

```bash
# 执行导出脚本
~/projects/stock-race/docs/migration/export-vm-config-complete.sh

# 确认文件生成
ls -lh ~/vm-config-export-*.tar.gz

# 复制到项目目录（便于提交到 Git）
cp ~/vm-config-export-*.tar.gz ~/projects/stock-race/
```

### 2. 提交到 Git

```bash
cd ~/projects/stock-race
git add docs/migration/ MIGRATION.md
git commit -m "docs: 添加 WSL2 迁移完整方案"
git push
```

### 3. 在高性能电脑上

1. 安装 Windows 11 + WSL2（见 QUICK-START-WSL2.md）
2. `git clone` 本项目
3. 按照 QUICK-START-WSL2.md 完成剩余步骤

## 导出内容说明

`vm-config-export-*.tar.gz` 包含：

- ✅ `/etc/profile.d/claude_code_env.sh` - 系统级环境配置
- ✅ `~/.bashrc`, `~/.zshrc` - Shell 配置
- ✅ `~/.claude/` - Claude Code 完整配置（历史、任务、技能）
- ✅ `~/bin/` - 自定义脚本（michelle 系列）
- ✅ `~/.ssh/` - SSH 密钥
- ✅ `~/.gitconfig` - Git 配置
- ✅ `~/.npmrc` - npm 镜像配置
- ✅ 软件包清单（便于重新安装）

## 注意事项

1. **API 密钥**：导出包中包含 API 密钥，请妥善保管
2. **文件大小**：导出包约 50-100MB，主要是 Claude Code 历史记录
3. **系统差异**：WSL2 和 VM 的网络配置不同，部分脚本可能需要微调
4. **微信登录**：在新环境需要重新扫码登录微信开发者工具

## 故障排除

见 [docs/migration/WSL2-SETUP-GUIDE.md](docs/migration/WSL2-SETUP-GUIDE.md) 的"常见问题"部分。

## 迁移后验证

```bash
# 1. 检查 michelle 脚本
which michelle
michelle --help

# 2. 检查 SSH
ssh -T git@github.com

# 3. 检查环境变量
env | grep ANTHROPIC

# 4. 测试 MCP 连接
# 在 Claude Code 中执行: /tools
```

---

**祝你迁移顺利！**
