#!/bin/bash
# 全自动化开发主循环
# 支持模式:
#   默认       - 守护进程模式，无限循环
#   --once     - 单次模式，执行一个任务后退出
#   --night    - 夜间模式，处理完所有pending任务后退出

# ============================================
# 关键：确保在项目根目录运行，加载项目级配置
# ============================================

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 切换到项目根目录（scripts/auto/ 的上两级）
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT" || exit 1

# 验证在项目根目录
if [ ! -f "CLAUDE.md" ] || [ ! -d ".claude" ]; then
    echo "❌ 错误：无法找到项目根目录配置" >&2
    echo "当前目录: $(pwd)" >&2
    exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ 工作目录: $PROJECT_ROOT"

QUEUE_FILE="tasks/queue.json"
LOG_FILE="logs/auto-dev/loop.log"
MODE="daemon"  # daemon | once | night

# 解析参数
for arg in "$@"; do
    case $arg in
        --once)
            MODE="once"
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] 启动单次模式（执行一个任务后退出）" | tee -a "$LOG_FILE"
            shift
            ;;
        --night)
            MODE="night"
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] 启动夜间模式（处理完所有任务后退出）" | tee -a "$LOG_FILE"
            shift
            ;;
        --help|-h)
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --once     单次模式：执行一个任务后退出"
            echo "  --night    夜间模式：处理完所有pending任务后退出"
            echo "  --help     显示帮助信息"
            echo ""
            echo "默认（无参数）：守护进程模式，无限循环等待新任务"
            echo ""
            echo "项目级配置加载:"
            echo "  - Skill: .claude/skills/auto-dev.md"
            echo "  - MCP: .claude/mcp.json"
            echo "  - 工作目录: $PROJECT_ROOT"
            exit 0
            ;;
    esac
done

# 确保日志目录存在
mkdir -p logs/auto-dev/errors
mkdir -p logs/auto-dev/reports
mkdir -p logs/auto-dev/daily

if [ "$MODE" == "daemon" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 自动化开发循环启动 [守护进程模式]" | tee -a "$LOG_FILE"
    echo "PID: $$" | tee -a "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 自动化开发循环启动 [$MODE模式]" | tee -a "$LOG_FILE"
fi

# 检查 jq 是否可用
if ! command -v jq &> /dev/null; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ 错误: 需要安装 jq" | tee -a "$LOG_FILE"
    echo "请安装 jq: https://jqlang.github.io/jq/download/" | tee -a "$LOG_FILE"
    exit 1
fi

# 检查项目级 Skill 是否存在
if [ ! -f ".claude/skills/auto-dev.md" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ 警告: 项目级 Skill 不存在: .claude/skills/auto-dev.md" | tee -a "$LOG_FILE"
fi

# 统计已处理任务数（夜间模式使用）
PROCESSED_COUNT=0

while true; do
    # 获取下一个待执行任务
    TASK_ID=$(jq -r '.tasks[] | select(.status=="pending") | .id' "$QUEUE_FILE" 2>/dev/null | head -1)

    if [ -z "$TASK_ID" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 无待执行任务" | tee -a "$LOG_FILE"

        # 检查是否所有任务都是blocked
        ALL_BLOCKED=$(jq '[.tasks[].status] | map(select(. != "blocked")) | length == 0 and (.tasks | length > 0)' "$QUEUE_FILE" 2>/dev/null)
        if [ "$ALL_BLOCKED" == "true" ]; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ 警告：所有任务均被阻塞！" | tee -a "$LOG_FILE"
        fi

        # 模式判断
        case $MODE in
            once)
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] 单次模式：无任务，退出" | tee -a "$LOG_FILE"
                exit 0
                ;;
            night)
                if [ $PROCESSED_COUNT -gt 0 ]; then
                    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 夜间模式：已处理 $PROCESSED_COUNT 个任务，退出" | tee -a "$LOG_FILE"
                else
                    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 夜间模式：无任务需要处理，退出" | tee -a "$LOG_FILE"
                fi
                exit 0
                ;;
            daemon)
                # 守护进程模式：等待后继续
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] 60秒后重试..." | tee -a "$LOG_FILE"
                sleep 60
                continue
                ;;
        esac
    fi

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 启动任务: $TASK_ID [$MODE模式]" | tee -a "$LOG_FILE"

    # 读取任务详情
    TASK_JSON=$(jq --arg id "$TASK_ID" '.tasks[] | select(.id==$id)' "$QUEUE_FILE")
    MODULE=$(echo "$TASK_JSON" | jq -r '.module')
    TODO_REF=$(echo "$TASK_JSON" | jq -r '.todo_ref')

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 📋 模块: $MODULE, TODO: $TODO_REF" | tee -a "$LOG_FILE"

    # ============================================
    # 启动Claude会话执行任务
    # ============================================
    # 关键：在项目根目录启动，确保加载项目级配置

    # 方式1: 使用项目级 Skill（推荐）
    # 先检查 skill 是否存在
    if [ -f ".claude/skills/auto-dev.md" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🎯 使用项目级 Skill: auto-dev" | tee -a "$LOG_FILE"
        # 使用 skill 启动，传入任务ID作为参数
        # 注意：Claude Code 可能需要特定方式加载 skill
        claude --new "
你是stock-race项目的全自动化开发智能体。
当前工作目录: $(pwd)
项目根目录: $PROJECT_ROOT
请执行任务: $TASK_ID

执行流程：
1. 读取 tasks/queue.json 找到任务 $TASK_ID 的详情
2. 根据 module 和 todo_ref 读取对应模块的 TODO.md
3. 更新 queue.json 状态为 in_progress
4. 更新 TODO.md 状态为 🔄 开发中
5. 按TDD流程开发：写测试 → 写功能 → 跑测试
6. 如需MCP（mcp_required=true），使用 weixin-devtools 验证
7. 更新 TODO.md（状态改为 ✅ 已完成）、HAVE_DONE.md、TEST_SCRIPTS.md
8. git commit -m \"feat($MODULE): $TASK_ID [automated]\"
9. 更新 queue.json 状态为 completed

项目级配置已加载：
- Skill: .claude/skills/auto-dev.md
- MCP: .claude/mcp.json (weixin-devtools)

如果失败，更新状态为 blocked 并记录原因到 logs/auto-dev/errors/${TASK_ID}_$(date +%Y%m%d_%H%M%S).log
"
    else
        # 方式2: 不使用 skill，直接传入完整 prompt
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ 项目级 Skill 不存在，使用默认方式" | tee -a "$LOG_FILE"
        claude --new "
你是stock-race项目的全自动化开发智能体。
请执行任务: $TASK_ID

执行流程：
1. 读取 tasks/queue.json 找到任务 $TASK_ID 的详情
2. 根据 module 和 todo_ref 读取对应模块的 $TODO.md
3. 更新 queue.json 状态为 in_progress
4. 更新 TODO.md 状态为 🔄 开发中
5. 按TDD流程开发：写测试 → 写功能 → 跑测试
6. 如需MCP（mcp_required=true），使用 weixin-devtools 验证
7. 更新 TODO.md（状态改为 ✅ 已完成）、HAVE_DONE.md、TEST_SCRIPTS.md
8. git commit -m \"feat($MODULE): $TASK_ID [automated]\"
9. 更新 queue.json 状态为 completed

如果失败，更新状态为 blocked 并记录原因到 logs/auto-dev/errors/${TASK_ID}_$(date +%Y%m%d_%H%M%S).log
"
    fi

    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ 任务 $TASK_ID 正常结束" | tee -a "$LOG_FILE"
        PROCESSED_COUNT=$((PROCESSED_COUNT + 1))
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ 任务 $TASK_ID 异常退出 (code: $EXIT_CODE)" | tee -a "$LOG_FILE"
    fi

    # 单次模式：执行一个任务后退出
    if [ "$MODE" == "once" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 单次模式：任务执行完毕，退出" | tee -a "$LOG_FILE"
        exit 0
    fi

    # 短暂休息，避免API限制
    sleep 10
done
