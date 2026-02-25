#!/bin/bash
# 恢复阻塞的任务

if [ $# -lt 2 ]; then
    echo "用法: $0 <task-id> <恢复原因>"
    echo "示例: $0 MINI-001 '已修复表单验证逻辑'"
    exit 1
fi

TASK_ID=$1
REASON=$2
QUEUE_FILE="tasks/queue.json"

# 检查队列文件存在
if [ ! -f "$QUEUE_FILE" ]; then
    echo "❌ 错误: 队列文件 $QUEUE_FILE 不存在"
    exit 1
fi

# 检查任务是否存在
if ! jq -e --arg id "$TASK_ID" '.tasks[] | select(.id==$id)' "$QUEUE_FILE" > /dev/null 2>&1; then
    echo "❌ 错误: 任务 $TASK_ID 不存在"
    exit 1
fi

# 检查jq是否安装
if ! command -v jq &> /dev/null; then
    echo "❌ 错误: 需要安装 jq"
    exit 1
fi

# 1. 更新 queue.json
jq --arg id "$TASK_ID" --arg reason "$REASON" '
    .tasks[] |= if .id == $id then
        .status = "pending" |
        .retry_count = 0 |
        .skip_count = 0 |
        .blocked_at = null |
        .block_reason = null |
        .resume_history += [{"time": now, "reason": $reason}]
    else . end
' "$QUEUE_FILE" > tmp.json && mv tmp.json "$QUEUE_FILE"

if [ $? -eq 0 ]; then
    echo "✅ 任务 $TASK_ID 已恢复: $REASON"
    echo "下次循环将重新执行该任务"
else
    echo "❌ 更新队列文件失败"
    exit 1
fi

# 可选：自动更新 TODO.md（需要知道模块）
MODULE=$(jq -r --arg id "$TASK_ID" '.tasks[] | select(.id==$id) | .module' "$QUEUE_FILE" 2>/dev/null)
TODO_FILE="docs/modules/$MODULE/TODO.md"

if [ -f "$TODO_FILE" ] && [ "$MODULE" != "null" ] && [ -n "$MODULE" ]; then
    # 将 ⛔ 阻塞 改为 🔲 待开发
    if sed -i 's/- \*\*状态\*\*: ⛔ 阻塞/- **状态**: 🔲 待开发/g' "$TODO_FILE" 2>/dev/null; then
        echo "✅ 已更新 $TODO_FILE"
    else
        echo "⚠️ 无法自动更新 $TODO_FILE，请手动修改状态"
    fi
else
    echo "ℹ️ 未找到对应的 TODO.md 文件，跳过自动更新"
fi
