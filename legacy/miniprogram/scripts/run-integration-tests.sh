#!/bin/bash

# =============================================================================
# 小程序联调准备测试运行脚本
# =============================================================================
# 功能：运行所有单元测试并生成测试报告
# 作者：Miniprogram开发团队
# 日期：2026-02-12
# =============================================================================

# 不设置 set -e，以便我们可以捕获测试失败并输出摘要

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试配置
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COVERAGE_DIR="$TEST_DIR/coverage"
REPORT_FILE="$TEST_DIR/test-report.log"

# 关键测试文件
KEY_TEST_FILES=(
    "tests/unit/services/websocket.test.ts"
    "tests/unit/services/health.test.ts"
    "tests/unit/api/public.test.ts"
    "tests/unit/api/guest.test.ts"
)

# 计数器
PASSED=0
FAILED=0
TOTAL=0

# =============================================================================
# 辅助函数
# =============================================================================

print_header() {
    echo -e "${BLUE}"
    echo "============================================================================="
    echo "                    小程序联调准备测试运行脚本"
    echo "============================================================================="
    echo -e "${NC}"
}

print_section() {
    echo -e "${YELLOW}\n>>> $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# =============================================================================
# 前置检查
# =============================================================================

check_prerequisites() {
    print_section "前置检查"

    # 检查是否在正确的目录
    if [ ! -f "$TEST_DIR/package.json" ]; then
        print_error "未找到 package.json，请确保在 miniprogram 目录下运行此脚本"
        exit 1
    fi

    print_success "项目目录检查通过: $TEST_DIR"

    # 检查关键测试文件是否存在
    print_info "检查关键测试文件..."
    local all_files_exist=true
    for file in "${KEY_TEST_FILES[@]}"; do
        if [ -f "$TEST_DIR/$file" ]; then
            print_success "找到测试文件: $file"
        else
            print_error "缺少测试文件: $file"
            all_files_exist=false
        fi
    done

    if [ "$all_files_exist" = false ]; then
        print_error "部分关键测试文件缺失，请检查测试文件是否已创建"
        exit 1
    fi

    # 检查 vitest 是否安装
    if ! command -v npx &> /dev/null; then
        print_error "未找到 npx，请确保已安装 Node.js"
        exit 1
    fi

    print_success "环境检查通过"
}

# =============================================================================
# 运行测试
# =============================================================================

run_tests() {
    print_section "运行单元测试"

    cd "$TEST_DIR"

    # 检查 node_modules 是否存在
    if [ ! -d "$TEST_DIR/node_modules" ]; then
        print_error "未找到 node_modules 目录，请先运行 npm install 安装依赖"
        print_info "运行命令: cd $TEST_DIR && npm install"
        return 1
    fi

    # 检查 vitest 是否已安装
    if ! npx vitest --version &> /dev/null 2>&1; then
        print_info "正在安装 vitest 和覆盖率工具..."
        npm install -D vitest @vitest/coverage-v8 --save-dev
    fi

    # 清理之前的覆盖率报告
    if [ -d "$COVERAGE_DIR" ]; then
        rm -rf "$COVERAGE_DIR"
    fi

    # 运行测试并生成覆盖率报告
    print_info "开始运行测试..."
    echo ""

    # 使用 npx 运行 vitest
    if npx vitest run --coverage --reporter=verbose 2>&1 | tee "$REPORT_FILE"; then
        TEST_EXIT_CODE=0
    else
        TEST_EXIT_CODE=${PIPESTATUS[0]}
    fi

    return $TEST_EXIT_CODE
}

# =============================================================================
# 解析测试结果
# =============================================================================

parse_results() {
    print_section "解析测试结果"

    if [ ! -f "$REPORT_FILE" ]; then
        print_error "未找到测试报告文件"
        return 1
    fi

    # 初始化计数器
    PASSED=0
    FAILED=0

    # 解析测试数量
    if grep -q "failed" "$REPORT_FILE" 2>/dev/null; then
        # 从 vitest 输出中提取测试统计
        local test_line=$(grep -E "Tests\s+\(" "$REPORT_FILE" 2>/dev/null | tail -1)

        if [ -n "$test_line" ]; then
            # 提取通过数量
            if echo "$test_line" | grep -q "passed"; then
                PASSED=$(echo "$test_line" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
            fi

            # 提取失败数量
            if echo "$test_line" | grep -q "failed"; then
                FAILED=$(echo "$test_line" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo "0")
            fi
        fi
    else
        # 如果没有失败，尝试从输出中提取通过数量
        PASSED=$(grep -c "✓" "$REPORT_FILE" 2>/dev/null || echo "0")
        FAILED=0
    fi

    # 确保是数字
    PASSED=${PASSED:-0}
    FAILED=${FAILED:-0}

    # 计算总数
    TOTAL=$((PASSED + FAILED))

    print_info "测试统计:"
    echo "  - 通过: $PASSED"
    echo "  - 失败: $FAILED"
    echo "  - 总计: $TOTAL"
}

# =============================================================================
# 检查关键测试
# =============================================================================

check_key_tests() {
    print_section "检查关键测试文件执行状态"

    local key_tests_passed=true

    for file in "${KEY_TEST_FILES[@]}"; do
        local filename=$(basename "$file" .test.ts)
        if grep -q "$filename" "$REPORT_FILE" 2>/dev/null || grep -q "$(echo "$filename" | sed 's/\./\\./g')" "$REPORT_FILE" 2>/dev/null; then
            print_success "已执行: $file"
        else
            print_error "未找到执行记录: $file"
            key_tests_passed=false
        fi
    done

    if [ "$key_tests_passed" = true ]; then
        return 0
    else
        return 1
    fi
}

# =============================================================================
# 生成摘要报告
# =============================================================================

print_summary() {
    print_section "测试摘要报告"

    # 确定测试状态
    local has_error=false
    if [ "$FAILED" -gt 0 ] || [ "$test_result" -ne 0 ] 2>/dev/null; then
        has_error=true
    fi

    echo "============================================================================="
    echo "                          测试执行摘要"
    echo "============================================================================="
    echo ""
    echo "  测试时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "  项目路径: $TEST_DIR"
    echo ""
    echo "  -------------------------- 测试结果统计 --------------------------"
    echo ""

    echo -e "  ${GREEN}通过: $PASSED${NC}"
    echo -e "  ${RED}失败: $FAILED${NC}"
    echo ""

    if [ "$has_error" = true ]; then
        echo "============================================================================="
        echo -e "${RED}"
        echo "                    ❌ 测试失败，请检查上述错误"
        echo -e "${NC}"
        echo "============================================================================="
    else
        echo "============================================================================="
        echo -e "${GREEN}"
        echo "                    ✅ 小程序联调准备测试全部通过"
        echo -e "${NC}"
        echo "============================================================================="
    fi

    echo ""
    echo "  关键测试文件:"
    for file in "${KEY_TEST_FILES[@]}"; do
        echo "    - $file"
    done
    echo ""

    if [ -d "$COVERAGE_DIR" ]; then
        echo "  覆盖率报告: $COVERAGE_DIR/index.html"
    fi

    echo "  详细日志: $REPORT_FILE"
    echo ""
    echo "============================================================================="
}

# =============================================================================
# 主函数
# =============================================================================

main() {
    print_header

    # 前置检查
    check_prerequisites

    # 运行测试
    run_tests
    local test_result=$?

    # 解析结果
    parse_results

    # 检查关键测试
    check_key_tests

    # 输出摘要
    print_summary

    # 清理临时文件
    if [ -f "$REPORT_FILE" ]; then
        # 保留报告文件供查看
        print_info "测试报告已保存至: $REPORT_FILE"
    fi

    # 根据测试结果返回退出码
    # 如果 test_result 不为 0 或者 FAILED 大于 0，则测试失败
    if [ "$test_result" -ne 0 ]; then
        print_error "测试执行过程中发生错误"
        exit 1
    fi

    if [ "$FAILED" -gt 0 ]; then
        exit 1
    fi

    exit 0
}

# 运行主函数
main "$@"
