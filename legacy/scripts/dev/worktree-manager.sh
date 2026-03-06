#!/bin/bash

# Git Worktree 管理脚本
# 用于创建和管理不同模块的独立工作目录

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 工作树根目录
WORKTREE_ROOT="./worktrees"

# 创建微信小程序工作树
create_miniprogram_worktree() {
    echo -e "${BLUE}正在创建微信小程序工作树...${NC}"

    # 检查是否已存在
    if [ -d "$WORKTREE_ROOT/worktree-miniprogram" ]; then
        echo -e "${YELLOW}微信小程序工作树已存在${NC}"
        return 0
    fi

    # 确保分支存在
    if ! git show-ref --verify --quiet refs/heads/miniprogram-development; then
        git checkout -b miniprogram-development
        git checkout develop
    fi

    # 创建工作树
    git worktree add "$WORKTREE_ROOT/worktree-miniprogram" miniprogram-development

    # 创建微信小程序目录结构
    mkdir -p "$WORKTREE_ROOT/worktree-miniprogram/src"
    mkdir -p "$WORKTREE_ROOT/worktree-miniprogram/docs"
    mkdir -p "$WORKTREE_ROOT/worktree-miniprogram/scripts"

    echo -e "${GREEN}微信小程序工作树创建完成！${NC}"
    echo "工作树路径: $WORKTREE_ROOT/worktree-miniprogram"
}

# 切换到指定工作树
switch_to_worktree() {
    local worktree_name=$1

    if [ -z "$worktree_name" ]; then
        echo -e "${RED}请指定工作树名称${NC}"
        echo "可用工作树: ai-service, backend, data-service, frontend, miniprogram"
        return 1
    fi

    local worktree_path="$WORKTREE_ROOT/worktree-$worktree_name"

    if [ ! -d "$worktree_path" ]; then
        echo -e "${RED}工作树 '$worktree_name' 不存在${NC}"
        return 1
    fi

    cd "$worktree_path"
    echo -e "${GREEN}已切换到 $worktree_name 工作树${NC}"
    echo "当前分支: $(git branch --show-current)"
    echo "当前路径: $(pwd)"
}

# 列出所有工作树
list_worktrees() {
    echo -e "${BLUE}当前工作树列表:${NC}"
    git worktree list
    echo ""
    echo -e "${BLUE}工作树详细信息:${NC}"
    for worktree in worktree-ai-service worktree-backend worktree-data-service worktree-frontend worktree-miniprogram; do
        local path="$WORKTREE_ROOT/$worktree"
        if [ -d "$path" ]; then
            echo -e "${YELLOW}$worktree${NC}: $path"
            cd "$path" 2>/dev/null
            if [ $? -eq 0 ]; then
                echo "  分支: $(git branch --show-current)"
                echo "  最后提交: $(git log -1 --oneline --format=%h -n 1)"
                echo "  未提交文件: $(git status --porcelain | wc -l) 个"
            fi
        fi
    done
}

# 清理工作树
cleanup_worktrees() {
    echo -e "${YELLOW}清理工作树...${NC}"

    # 删除没有未提交更改的工作树
    for worktree in worktree-ai-service worktree-backend worktree-data-service worktree-frontend worktree-miniprogram; do
        local path="$WORKTREE_ROOT/$worktree"
        if [ -d "$path" ]; then
            cd "$path" 2>/dev/null
            if [ $? -eq 0 ]; then
                if [ -z "$(git status --porcelain)" ]; then
                    echo -e "${BLUE}清理 $worktree${NC}"
                    cd ../..
                    git worktree remove "$path"
                else
                    echo -e "${YELLOW}$worktree 有未提交的更改，跳过${NC}"
                    cd ../..
                fi
            fi
        fi
    done
}

# 显示帮助信息
show_help() {
    echo "Git Worktree 管理脚本"
    echo ""
    echo "使用方法:"
    echo "  $0 create-miniprogram    # 创建微信小程序工作树"
    echo "  $0 switch <name>         # 切换到指定工作树"
    echo "  $0 list                  # 列出所有工作树"
    echo "  $0 cleanup               # 清理工作树"
    echo ""
    echo "可用工作树:"
    echo "  ai-service    # AI服务开发"
    echo "  backend       # 后端API开发"
    echo "  data-service  # 数据服务开发"
    echo "  frontend      # 前端Web应用开发"
    echo "  miniprogram   # 微信小程序开发"
}

# 主函数
main() {
    case "$1" in
        "create-miniprogram")
            create_miniprogram_worktree
            ;;
        "switch")
            switch_to_worktree "$2"
            ;;
        "list")
            list_worktrees
            ;;
        "cleanup")
            cleanup_worktrees
            ;;
        "help"|"*"|"")
            show_help
            ;;
    esac
}

# 执行主函数
main "$@"
