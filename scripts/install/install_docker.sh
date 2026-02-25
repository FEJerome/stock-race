#!/bin/bash

# Docker安装脚本
# 请使用sudo运行此脚本: sudo bash install_docker.sh

set -e

echo "🚀 开始安装Docker和Docker Compose..."

# 更新apt包列表
echo "📦 更新软件包列表..."
apt-get update -y

# 安装必要依赖
echo "📦 安装依赖包..."
apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# 添加Docker官方GPG密钥
echo "🔑 添加Docker官方GPG密钥..."
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# 设置Docker仓库
echo "📦 设置Docker仓库..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装Docker Engine
echo "🐳 安装Docker Engine..."
apt-get update -y
apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

# 安装Docker Compose (独立版本)
echo "📦 安装Docker Compose (独立版本)..."
curl -SL https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# 将当前用户添加到docker组（需要重新登录）
echo "👥 将当前用户添加到docker组..."
usermod -aG docker $SUDO_USER

echo "✅ Docker安装完成！"
echo ""
echo "📋 下一步操作："
echo "1. 重新登录或运行: newgrp docker"
echo "2. 验证安装: docker --version"
echo "3. 验证Docker Compose: docker-compose --version"
echo "4. 启动服务: cd /home/fe-jerome/projects/stock-race && docker-compose up -d"
echo ""

# 显示版本信息
echo "📊 安装版本信息："
docker --version
docker-compose --version

echo ""
echo "🎉 安装完成！请重新登录或运行 'newgrp docker' 使组更改生效。"