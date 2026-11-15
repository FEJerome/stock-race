#!/bin/bash

# Docker安装脚本（中国镜像源版）
# 请使用sudo运行此脚本: sudo bash install_docker_china.sh

set -e

echo "🚀 开始安装Docker和Docker Compose（使用国内镜像源）..."

# 更新apt包列表
echo "📦 更新软件包列表..."
apt-get update -y

# 安装必要依赖
echo "📦 安装依赖包..."
apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    apt-transport-https

# 使用阿里云Docker镜像源
echo "🔑 添加阿里云Docker镜像源..."
# 方法1：使用阿里云镜像源（推荐）
ALIYUN_MIRROR="https://mirrors.aliyun.com/docker-ce"
DOCKER_GPG_KEY_URL="${ALIYUN_MIRROR}/linux/ubuntu/gpg"
DOCKER_REPO_URL="${ALIYUN_MIRROR}/linux/ubuntu"

# 备份原始源列表
cp /etc/apt/sources.list /etc/apt/sources.list.backup.$(date +%Y%m%d%H%M%S)

# 添加阿里云镜像源
echo "添加阿里云Docker镜像源..."
mkdir -p /etc/apt/keyrings

# 下载GPG密钥（带重试机制）
echo "下载Docker GPG密钥..."
for i in {1..3}; do
    echo "尝试第 $i 次下载..."
    if curl -fsSL "${DOCKER_GPG_KEY_URL}" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg; then
        echo "✅ GPG密钥下载成功"
        break
    elif [ $i -eq 3 ]; then
        echo "❌ GPG密钥下载失败，尝试备选方案..."
        # 备选方案：使用本地已有的密钥或跳过
        if [ -f /etc/apt/keyrings/docker.gpg ]; then
            echo "⚠️ 使用已存在的GPG密钥文件"
        else
            echo "⚠️ 创建空的GPG密钥文件（可能影响安全性）"
            touch /etc/apt/keyrings/docker.gpg
        fi
    fi
    sleep 2
done

# 设置Docker仓库（使用阿里云镜像）
echo "📦 设置Docker仓库（阿里云镜像）..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] ${DOCKER_REPO_URL} \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# 更新仓库
echo "🔄 更新软件包列表..."
apt-get update -y

# 安装Docker Engine
echo "🐳 安装Docker Engine..."
# 先尝试安装docker.io（Ubuntu官方包）
if apt-get install -y docker.io; then
    echo "✅ 使用docker.io安装成功"
else
    echo "⚠️ docker.io安装失败，尝试安装docker-ce..."
    apt-get install -y \
        docker-ce \
        docker-ce-cli \
        containerd.io \
        docker-buildx-plugin \
        docker-compose-plugin
fi

# 安装Docker Compose
echo "📦 安装Docker Compose..."
# 方法1：使用apt安装docker-compose-plugin
if apt-get install -y docker-compose-plugin; then
    echo "✅ docker-compose-plugin安装成功"
    # 创建软链接
    ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
else
    echo "⚠️ docker-compose-plugin安装失败，尝试直接下载..."
    # 方法2：直接下载二进制文件（使用国内镜像）
    DOCKER_COMPOSE_VERSION="v2.24.0"
    DOCKER_COMPOSE_URL="https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-x86_64"

    # 尝试使用镜像站
    MIRROR_URLS=(
        "https://ghproxy.com/${DOCKER_COMPOSE_URL}"
        "https://download.fastgit.org/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-x86_64"
        "${DOCKER_COMPOSE_URL}"
    )

    for url in "${MIRROR_URLS[@]}"; do
        echo "尝试从 $url 下载..."
        if curl -L "${url}" -o /usr/local/bin/docker-compose; then
            chmod +x /usr/local/bin/docker-compose
            echo "✅ Docker Compose下载成功"
            break
        fi
    done
fi

# 验证Docker Compose安装
if [ -f /usr/local/bin/docker-compose ] && [ -x /usr/local/bin/docker-compose ]; then
    echo "✅ Docker Compose安装验证通过"
else
    echo "❌ Docker Compose安装失败，尝试安装python3-pip并使用pip安装"
    apt-get install -y python3-pip
    pip3 install docker-compose
    ln -sf /usr/local/bin/docker-compose /usr/local/bin/docker-compose 2>/dev/null || true
fi

# 将当前用户添加到docker组（需要重新登录）
echo "👥 将当前用户添加到docker组..."
if getent group docker >/dev/null; then
    echo "docker组已存在"
else
    groupadd docker
fi
usermod -aG docker $SUDO_USER 2>/dev/null || usermod -aG docker $(whoami) 2>/dev/null || echo "⚠️ 无法将用户添加到docker组，请手动添加"

# 启动Docker服务
echo "🔧 启动Docker服务..."
systemctl start docker 2>/dev/null || service docker start 2>/dev/null || echo "⚠️ 无法启动Docker服务"
systemctl enable docker 2>/dev/null || update-rc.d docker defaults 2>/dev/null || echo "⚠️ 无法设置Docker开机启动"

echo "✅ Docker安装完成！"
echo ""
echo "📋 验证安装："
echo ""
# 显示版本信息
echo "📊 安装版本信息："
if command -v docker >/dev/null; then
    docker --version
else
    echo "❌ Docker未安装"
fi

if command -v docker-compose >/dev/null; then
    docker-compose --version
else
    echo "❌ Docker Compose未安装"
fi

echo ""
echo "🔍 测试Docker运行："
docker ps 2>/dev/null && echo "✅ Docker运行正常" || echo "⚠️ Docker运行测试失败"

echo ""
echo "📋 下一步操作："
echo "1. 重新登录或运行: newgrp docker"
echo "2. 启动服务: cd /path/to/stock-race && docker-compose up -d"
echo ""
echo "🔄 如果遇到权限问题，可以尝试："
echo "   sudo chmod 666 /var/run/docker.sock"
echo "   或者重新登录: newgrp docker"
echo ""
echo "🎉 安装完成！"