#!/bin/bash
# 全自动化开发主循环
# 支持模式:
#   默认       - 守护进程模式，无限循环
#   --once     - 单次模式，执行一个任务后退出
#   --night    - 夜间模式，处理完所有pending任务后退出
#
# Windows Git Bash 优化版本

set -o pipefail

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

# ============================================
# 配置与常量
# ============================================
QUEUE_FILE="tasks/queue.json"
LOG_FILE="logs/auto-dev/loop.log"
LOCK_FILE=".dev-loop.lock"
MODE="daemon"  # daemon | once | night

# ============================================
# 文件锁函数 (Git Bash 兼容)
# ============================================
acquire_lock() {
    if [ -f "$LOCK_FILE" ]; then
        OLD_PID=$(cat "$LOCK_FILE" 2>/dev/null)
        if [ -n "$OLD_PID" ] && ps | grep -v grep | grep -q "^\s*$OLD_PID\s"; then
            echo "❌ 错误：已有 dev-loop 实例在运行 (PID: $OLD_PID)" >&2
            exit 1
        fi
        # 进程不存在，锁文件过期
        echo "⚠️ 发现过期锁文件，覆盖之" | tee -a "$LOG_FILE"
    fi
    echo $$ > "$LOCK_FILE"
}

release_lock() {
    if [ -f "$LOCK_FILE" ]; then
        rm -f "$LOCK_FILE"
    fi
}

# 注册退出时释放锁
trap release_lock EXIT

# ============================================
# 日志函数
# ============================================
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1" | tee -a "$LOG_FILE" >&2
}

log_success() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1" | tee -a "$LOG_FILE"
}

# ============================================
# 更新任务状态函数
# ============================================
update_task_status() {
    local task_id="$1"
    local new_status="$2"
    local extra_field="${3:-}"
    local extra_value="${4:-}"

    local tmp_file="$QUEUE_FILE.tmp"

    if [ -n "$extra_field" ]; then
        jq --arg id "$task_id" \
           --arg status "$new_status" \
           --arg field "$extra_field" \
           --arg value "$extra_value" \
           '(.tasks[] | select(.id==$id)) |= . + {status: $status, ($field): $value}' \
           "$QUEUE_FILE" > "$tmp_file"
    else
        jq --arg id "$task_id" \
           --arg status "$new_status" \
           '(.tasks[] | select(.id==$id)).status = $status' \
           "$QUEUE_FILE" > "$tmp_file"
    fi

    mv "$tmp_file" "$QUEUE_FILE"
}

# ============================================
# 更新统计信息
# ============================================
update_stats() {
    local tmp_file="$QUEUE_FILE.tmp"

    jq '
    {
        total: (.tasks | length),
        pending: ([.tasks[].status] | map(select(. == "pending")) | length),
        in_progress: ([.tasks[].status] | map(select(. == "in_progress")) | length),
        completed: ([.tasks[].status] | map(select(. == "completed")) | length),
        blocked: ([.tasks[].status] | map(select(. == "blocked")) | length),
        failed: ([.tasks[].status] | map(select(. == "failed")) | length),
        skipped: ([.tasks[].status] | map(select(. == "skipped")) | length)
    } as $new_stats | .stats = $new_stats | .last_updated = now | tostring[:-1] + "Z"' \
    "$QUEUE_FILE" > "$tmp_file"

    # 修复时间格式
    jq '.last_updated = (now | todate)' "$tmp_file" > "$QUEUE_FILE"
    rm -f "$tmp_file"
}

# ============================================
# 执行 Claude 任务
# ============================================
execute_claude_task() {
    local task_id="$1"
    local module="$2"
    local todo_ref="$3"
    local mcp_required="$4"

    local timestamp=$(date +%Y%m%d_%H%M%S)
    local output_file="logs/auto-dev/output_${task_id}_${timestamp}.json"
    local prompt_file="logs/auto-dev/prompt_${task_id}_${timestamp}.txt"
    local exec_log="logs/auto-dev/execution_${timestamp}.log"

    log_info "📄 执行日志: $exec_log"
    log_info "📄 输出文件: $output_file"

    # 构建 Prompt
    cat > "$prompt_file" << EOF
你是stock-race项目的全自动化开发智能体。
当前工作目录: $(pwd)
项目根目录: $PROJECT_ROOT
任务ID: $task_id
模块: $module
TODO引用: $todo_ref

请执行以下流程：
1. 读取 tasks/queue.json 找到任务 $task_id 的详情
2. 更新 queue.json 状态为 in_progress
3. 根据 module 和 todo_ref 读取对应模块的 TODO.md
4. 按TDD流程开发：写测试 → 写功能 → 跑测试
5. 如需MCP（mcp_required=$mcp_required），使用 weixin-devtools 验证
6. 更新 TODO.md（状态改为 ✅ 已完成）、HAVE_DONE.md、TEST_SCRIPTS.md
7. git commit -m "feat($module): $task_id [automated]"
8. 更新 queue.json 状态为 completed

如果失败，更新状态为 blocked 并记录原因。
EOF

    local prompt=$(cat "$prompt_file")

    # 构建 Claude 参数数组 (避免 Windows 引号问题)
    local CLAUDE_ARGS=(-p)

    # 基础参数
    CLAUDE_ARGS+=(--dangerously-skip-permissions)
    CLAUDE_ARGS+=(--setting-sources project)
    CLAUDE_ARGS+=(--output-format json)

    # 限制可用工具
    if [ -f ".claude/skills/auto-dev.md" ]; then
        log_info "🎯 使用项目级 Skill: auto-dev"
        CLAUDE_ARGS+=(--allowed-tools "Read,Edit,Write,Bash,Skill,Glob,Grep")
    else
        log_info "⚠️ 项目级 Skill 不存在，使用默认工具"
        CLAUDE_ARGS+=(--allowed-tools "Read,Edit,Write,Bash")
    fi

    # MCP 配置
    if [ "$mcp_required" == "true" ] && [ -f ".claude/mcp.json" ]; then
        log_info "🔌 加载 MCP 配置: .claude/mcp.json"
        CLAUDE_ARGS+=(--mcp-config ".claude/mcp.json")
    fi

    # 添加 Prompt
    CLAUDE_ARGS+=("$prompt")

    # 执行并捕获输出
    log_info "🚀 启动 Claude Code..."
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Claude 参数: ${CLAUDE_ARGS[*]}" >> "$exec_log"

    claude "${CLAUDE_ARGS[@]}" > "$output_file" 2>&1
    local exit_code=$?

    # 解析结果
    if [ $exit_code -eq 0 ] && [ -f "$output_file" ]; then
        # 检查 JSON 是否有效
        if jq -e . "$output_file" > /dev/null 2>&1; then
            local result=$(jq -r '.result // "(无输出)"' "$output_file" 2>/dev/null | head -20)
            log_success "Claude 执行完成"
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] Claude 输出摘要:" >> "$exec_log"
            echo "$result" >> "$exec_log"
        else
            log_error "Claude 输出不是有效 JSON"
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] 原始输出:" >> "$exec_log"
            cat "$output_file" >> "$exec_log"
            exit_code=1
        fi
    else
        log_error "Claude 执行失败 (exit: $exit_code)"
        if [ -f "$output_file" ]; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] 错误输出:" >> "$exec_log"
            cat "$output_file" >> "$exec_log"
        fi
    fi

    # 记录执行信息
    cat > "logs/auto-dev/execution_${timestamp}_meta.json" << EOF
{
  "task_id": "$task_id",
  "module": "$module",
  "todo_ref": "$todo_ref",
  "timestamp": "$timestamp",
  "exit_code": $exit_code,
  "output_file": "$output_file",
  "prompt_file": "$prompt_file",
  "exec_log": "$exec_log",
  "claude_args": "${CLAUDE_ARGS[*]}",
  "project_root": "$PROJECT_ROOT"
}
EOF

    return $exit_code
}

# ============================================
# 主程序开始
# ============================================
log_info "=========================================="
log_info "工作目录: $PROJECT_ROOT"

# 解析参数
for arg in "$@"; do
    case $arg in
        --once)
            MODE="once"
            log_info "启动单次模式（执行一个任务后退出）"
            shift
            ;;
        --night)
            MODE="night"
            log_info "启动夜间模式（处理完所有任务后退出）"
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

# 获取锁
acquire_lock

# 确保日志目录存在
mkdir -p logs/auto-dev/errors
mkdir -p logs/auto-dev/reports
mkdir -p logs/auto-dev/daily

# 检查 jq 是否可用
if ! command -v jq &> /dev/null; then
    log_error "需要安装 jq"
    log_info "请安装 jq: https://jqlang.github.io/jq/download/"
    exit 1
fi

# 检查任务队列文件
if [ ! -f "$QUEUE_FILE" ]; then
    log_error "任务队列文件不存在: $QUEUE_FILE"
    exit 1
fi

if [ "$MODE" == "daemon" ]; then
    log_info "自动化开发循环启动 [守护进程模式] PID: $$"
else
    log_info "自动化开发循环启动 [$MODE模式]"
fi

# 统计已处理任务数（夜间模式使用）
PROCESSED_COUNT=0

# ============================================
# 主循环
# ============================================
while true; do
    # 获取下一个待执行任务
    TASK_ID=$(jq -r '.tasks[] | select(.status=="pending") | .id' "$QUEUE_FILE" 2>/dev/null | head -1)

    if [ -z "$TASK_ID" ]; then
        log_info "无待执行任务"
        update_stats

        # 检查是否所有任务都是blocked
        ALL_BLOCKED=$(jq '[.tasks[].status] | map(select(. != "blocked")) | length == 0 and (.tasks | length > 0)' "$QUEUE_FILE" 2>/dev/null)
        if [ "$ALL_BLOCKED" == "true" ]; then
            log_info "⚠️ 警告：所有任务均被阻塞！"
        fi

        # 模式判断
        case $MODE in
            once)
                log_info "单次模式：无任务，退出"
                exit 0
                ;;
            night)
                if [ $PROCESSED_COUNT -gt 0 ]; then
                    log_info "夜间模式：已处理 $PROCESSED_COUNT 个任务，退出"
                else
                    log_info "夜间模式：无任务需要处理，退出"
                fi
                exit 0
                ;;
            daemon)
                # 守护进程模式：等待后继续
                log_info "60秒后重试..."
                sleep 60
                continue
                ;;
        esac
    fi

    log_info "启动任务: $TASK_ID [$MODE模式]"

    # 读取任务详情
    TASK_JSON=$(jq --arg id "$TASK_ID" '.tasks[] | select(.id==$id)' "$QUEUE_FILE")
    MODULE=$(echo "$TASK_JSON" | jq -r '.module // "unknown"')
    TODO_REF=$(echo "$TASK_JSON" | jq -r '.todo_ref // ""')
    MCP_REQUIRED=$(echo "$TASK_JSON" | jq -r '.mcp_required // "false"')

    log_info "📋 模块: $MODULE, TODO: $TODO_REF, MCP: $MCP_REQUIRED"

    # 更新状态为 in_progress
    update_task_status "$TASK_ID" "in_progress" "started_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    update_stats

    # 执行任务
    execute_claude_task "$TASK_ID" "$MODULE" "$TODO_REF" "$MCP_REQUIRED"
    EXIT_CODE=$?

    # 根据结果更新状态
    if [ $EXIT_CODE -eq 0 ]; then
        log_success "任务 $TASK_ID 完成"
        update_task_status "$TASK_ID" "completed" "completed_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        PROCESSED_COUNT=$((PROCESSED_COUNT + 1))
    else
        log_error "任务 $TASK_ID 失败 (exit: $EXIT_CODE)"
        # 读取 retry_count，如果小于 max_retries 则标记为 pending，否则 blocked
        RETRY_COUNT=$(echo "$TASK_JSON" | jq -r '.retry_count // 0')
        MAX_RETRIES=$(echo "$TASK_JSON" | jq -r '.max_retries // 3')

        if [ "$RETRY_COUNT" -lt "$MAX_RETRIES" ]; then
            log_info "标记为失败，等待手动恢复 (retry: $RETRY_COUNT/$MAX_RETRIES)"
            update_task_status "$TASK_ID" "failed" "error_log" "Exit code: $EXIT_CODE"
        else
            log_info "超过最大重试次数，标记为 blocked"
            update_task_status "$TASK_ID" "blocked" "blocked_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        fi
    fi

    update_stats

    # 单次模式：执行一个任务后退出
    if [ "$MODE" == "once" ]; then
        log_info "单次模式：任务执行完毕，退出"
        exit 0
    fi

    # 短暂休息，避免API限制
    log_info "10秒后继续..."
    sleep 10
done
