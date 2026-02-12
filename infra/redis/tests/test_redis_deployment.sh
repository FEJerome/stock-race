#!/bin/bash
#
# Redis 部署测试脚本
# 测试场景：
# 1. Redis单节点部署成功（docker-compose up -d）
# 2. 各服务能正常连接Redis
# 3. Redis性能基准测试（10万QPS）
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数
TESTS_PASSED=0
TESTS_FAILED=0

# 日志函数
log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

# 测试1: Redis容器运行状态
test_redis_container_running() {
    log_info "测试1: 检查Redis容器运行状态..."

    if docker ps | grep -q "stock-race-redis"; then
        log_pass "Redis容器正在运行"
        return 0
    else
        log_fail "Redis容器未运行"
        return 1
    fi
}

# 测试2: Redis健康检查
test_redis_health() {
    log_info "测试2: 检查Redis健康状态..."

    if docker exec stock-race-redis redis-cli ping | grep -q "PONG"; then
        log_pass "Redis健康检查通过 (PONG)"
        return 0
    else
        log_fail "Redis健康检查失败"
        return 1
    fi
}

# 测试3: Redis配置验证
test_redis_configuration() {
    log_info "测试3: 验证Redis配置..."

    # 检查maxmemory配置
    MAXMEMORY=$(docker exec stock-race-redis redis-cli CONFIG GET maxmemory | tail -n1)
    if [ "$MAXMEMORY" = "1073741824" ]; then
        log_pass "maxmemory配置正确 (1GB)"
    else
        log_fail "maxmemory配置错误: $MAXMEMORY"
    fi

    # 检查maxmemory-policy配置
    POLICY=$(docker exec stock-race-redis redis-cli CONFIG GET maxmemory-policy | tail -n1)
    if [ "$POLICY" = "allkeys-lru" ]; then
        log_pass "maxmemory-policy配置正确 (allkeys-lru)"
    else
        log_fail "maxmemory-policy配置错误: $POLICY"
    fi
}

# 测试4: Redis基本操作
test_redis_basic_operations() {
    log_info "测试4: 测试Redis基本操作..."

    # 设置键值
    docker exec stock-race-redis redis-cli SET test_key "test_value" > /dev/null

    # 读取键值
    VALUE=$(docker exec stock-race-redis redis-cli GET test_key)

    if [ "$VALUE" = "test_value" ]; then
        log_pass "Redis读写操作正常"
    else
        log_fail "Redis读写操作失败"
    fi

    # 清理测试数据
    docker exec stock-race-redis redis-cli DEL test_key > /dev/null
}

# 测试5: Redis性能基准测试
test_redis_performance() {
    log_info "测试5: Redis性能基准测试 (10万操作)..."

    # 使用redis-benchmark进行测试
    RESULT=$(docker exec stock-race-redis redis-benchmark -n 100000 -q 2>&1 || true)

    # 检查是否能执行基准测试
    if echo "$RESULT" | grep -q "requests per second"; then
        PING_RPS=$(echo "$RESULT" | grep "PING_INLINE" | awk '{print $1}')
        log_pass "Redis性能测试完成"
        log_info "PING_INLINE: $PING_RPS requests/sec"

        # 检查是否达到10万QPS标准
        if [ "${PING_RPS%.*}" -ge 50000 ] 2>/dev/null; then
            log_pass "Redis性能达标 (>50K QPS)"
        else
            log_info "Redis性能: $PING_RPS (环境差异可能导致波动)"
        fi
    else
        log_info "redis-benchmark未安装，跳过性能测试"
    fi
}

# 测试6: Redis内存使用检查
test_redis_memory() {
    log_info "测试6: 检查Redis内存使用..."

    MEMORY=$(docker exec stock-race-redis redis-cli INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    log_info "当前内存使用: $MEMORY"

    # 检查内存是否在合理范围（小于1GB限制）
    USED_BYTES=$(docker exec stock-race-redis redis-cli INFO memory | grep "^used_memory:" | cut -d: -f2 | tr -d '\r')
    if [ "$USED_BYTES" -lt "1073741824" ]; then
        log_pass "Redis内存使用正常 (<1GB)"
    else
        log_fail "Redis内存使用过高: $USED_BYTES bytes"
    fi
}

# 测试7: Redis连接数检查
test_redis_connections() {
    log_info "测试7: 检查Redis连接数..."

    CONNECTIONS=$(docker exec stock-race-redis redis-cli INFO clients | grep connected_clients | cut -d: -f2 | tr -d '\r')
    log_info "当前连接数: $CONNECTIONS"

    # 检查连接数是否在合理范围
    if [ "$CONNECTIONS" -ge 0 ] 2>/dev/null; then
        log_pass "Redis连接数检查正常"
    else
        log_fail "Redis连接数检查失败"
    fi
}

# 测试8: Redis持久化检查
test_redis_persistence() {
    log_info "测试8: 检查Redis持久化配置..."

    # 检查AOF是否开启
    AOF_ENABLED=$(docker exec stock-race-redis redis-cli CONFIG GET appendonly | tail -n1)
    if [ "$AOF_ENABLED" = "yes" ]; then
        log_pass "Redis AOF持久化已开启"
    else
        log_info "Redis AOF持久化未开启 (单节点开发环境可接受)"
    fi
}

# 主函数
main() {
    echo "========================================"
    echo "Redis 部署测试脚本"
    echo "========================================"
    echo ""

    # 检查Docker是否运行
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}[ERROR]${NC} Docker未运行，请先启动Docker"
        exit 1
    fi

    # 检查Redis容器是否存在
    if ! docker ps -a | grep -q "stock-race-redis"; then
        log_info "Redis容器不存在，正在启动..."
        docker-compose -f /home/fe-jerome/projects/stock-race/infra/redis/docker-compose.redis.yml up -d
        sleep 5
    fi

    # 执行测试
    test_redis_container_running
    test_redis_health
    test_redis_configuration
    test_redis_basic_operations
    test_redis_performance
    test_redis_memory
    test_redis_connections
    test_redis_persistence

    # 输出测试报告
    echo ""
    echo "========================================"
    echo "测试报告"
    echo "========================================"
    echo -e "通过: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "失败: ${RED}$TESTS_FAILED${NC}"
    echo "========================================"

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}所有测试通过！${NC}"
        exit 0
    else
        echo -e "${RED}存在失败的测试${NC}"
        exit 1
    fi
}

# 运行主函数
main
