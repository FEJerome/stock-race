#!/bin/bash

# Stock Race Production Deployment Script
# 用途：一键部署生产环境

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查Docker是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        exit 1
    fi
    log_info "Docker已安装: $(docker --version)"
}

# 检查Docker Compose是否安装
check_docker_compose() {
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose未安装，请先安装Docker Compose"
        exit 1
    fi
    log_info "Docker Compose已安装"
}

# 检查环境变量文件
check_env_files() {
    log_info "检查环境变量文件..."

    local env_files=(
        "backend/.env.production"
        "ai-service/.env.production"
        "data-service/.env.production"
        "frontend/.env.production"
    )

    for env_file in "${env_files[@]}"; do
        if [ ! -f "$env_file" ]; then
            log_warn "环境变量文件 $env_file 不存在"
        elif grep -q "CHANGE_ME" "$env_file"; then
            log_error "环境变量文件 $env_file 中存在需要修改的值 (CHANGE_ME)"
            log_warn "请在部署前修改所有 CHANGE_ME 值"
            return 1
        fi
    done

    log_info "环境变量文件检查通过"
}

# 创建必要的目录
create_directories() {
    log_info "创建必要的目录..."

    mkdir -p logs
    mkdir -p data/postgres
    mkdir -p data/timescaledb
    mkdir -p data/redis
    mkdir -p nginx/ssl

    log_info "目录创建完成"
}

# 生成安全密钥
generate_secrets() {
    log_info "生成安全密钥..."

    # 检查是否已存在密钥文件
    if [ -f ".env.secrets" ]; then
        log_warn "密钥文件已存在，跳过生成"
        return 0
    fi

    # 生成随机密钥
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-25)
    TSDB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-25)
    REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-25)
    JWT_SECRET=$(openssl rand -base64 64)
    GRAFANA_PASSWORD=$(openssl rand -base64 16 | tr -d '/+=' | cut -c1-16)

    # 写入密钥文件
    cat > .env.secrets <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
TSDB_PASSWORD=$TSDB_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
JWT_SECRET=$JWT_SECRET
GRAFANA_PASSWORD=$GRAFANA_PASSWORD
EOF

    log_warn "密钥已生成到 .env.secrets"
    log_warn "请妥善保管此文件，不要提交到版本控制"
}

# 拉取最新镜像
pull_images() {
    log_info "拉取最新镜像..."
    docker-compose -f docker-compose.prod.yml pull
}

# 构建镜像
build_images() {
    log_info "构建应用镜像..."
    docker-compose -f docker-compose.prod.yml build
}

# 启动服务
start_services() {
    log_info "启动生产服务..."

    # 加载密钥文件
    if [ -f ".env.secrets" ]; then
        export $(cat .env.secrets | xargs)
    fi

    docker-compose -f docker-compose.prod.yml up -d

    log_info "服务启动完成"
}

# 检查服务状态
check_services() {
    log_info "检查服务状态..."
    sleep 10

    docker-compose -f docker-compose.prod.yml ps
}

# 显示访问信息
show_access_info() {
    log_info "服务访问信息:"
    echo ""
    echo "  前端:         http://localhost"
    echo "  后端API:      http://localhost/api"
    echo "  API文档:       http://localhost/api/docs"
    echo "  Grafana:       http://localhost:3002"
    echo "  Prometheus:    http://localhost:9090"
    echo ""
    log_info "使用以下命令查看日志:"
    echo "  docker-compose -f docker-compose.prod.yml logs -f [service_name]"
    echo ""
}

# 主函数
main() {
    log_info "开始部署 Stock Race 生产环境..."
    echo ""

    check_docker
    check_docker_compose

    if ! check_env_files; then
        log_error "环境变量配置不完整，部署中止"
        exit 1
    fi

    create_directories

    if [ "$1" == "--generate-secrets" ]; then
        generate_secrets
    fi

    pull_images
    build_images
    start_services
    check_services
    show_access_info

    log_info "部署完成！"
}

# 执行主函数
main "$@"
