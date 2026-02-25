#!/bin/bash

# Docker镜像源配置脚本
# 用于配置国内镜像源，解决网络连接问题

set -e

echo "=== Docker镜像源配置脚本 ==="
echo "开始时间: $(date)"
echo ""

# 检查Docker是否安装
echo "1. 检查Docker安装状态..."
if command -v docker &> /dev/null; then
    echo "✅ Docker已安装"
    DOCKER_VERSION=$(docker --version)
    echo "   Docker版本: $DOCKER_VERSION"
else
    echo "❌ Docker未安装"
    echo "   请先安装Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# 检查Docker Compose是否安装
echo ""
echo "2. 检查Docker Compose安装状态..."
if command -v docker-compose &> /dev/null; then
    echo "✅ Docker Compose已安装"
    DOCKER_COMPOSE_VERSION=$(docker-compose --version)
    echo "   Docker Compose版本: $DOCKER_COMPOSE_VERSION"
elif docker compose version &> /dev/null; then
    echo "✅ Docker Compose插件已安装"
    DOCKER_COMPOSE_VERSION=$(docker compose version)
    echo "   Docker Compose版本: $DOCKER_COMPOSE_VERSION"
else
    echo "⚠️  Docker Compose未安装"
    echo "   将使用docker-compose.yml中的version 3.8配置"
fi

# 创建Docker配置目录
echo ""
echo "3. 创建Docker配置目录..."
DOCKER_CONFIG_DIR="/etc/docker"
if [ ! -d "$DOCKER_CONFIG_DIR" ]; then
    echo "   创建Docker配置目录: $DOCKER_CONFIG_DIR"
    sudo mkdir -p "$DOCKER_CONFIG_DIR"
else
    echo "✅ Docker配置目录已存在: $DOCKER_CONFIG_DIR"
fi

# 备份现有配置
echo ""
echo "4. 备份现有配置..."
if [ -f "$DOCKER_CONFIG_DIR/daemon.json" ]; then
    BACKUP_FILE="$DOCKER_CONFIG_DIR/daemon.json.backup.$(date +%Y%m%d_%H%M%S)"
    echo "   备份现有配置到: $BACKUP_FILE"
    sudo cp "$DOCKER_CONFIG_DIR/daemon.json" "$BACKUP_FILE"
    echo "✅ 配置备份完成"
else
    echo "⚠️  未找到现有配置，将创建新配置"
fi

# 创建新的daemon.json配置
echo ""
echo "5. 创建新的Docker镜像源配置..."
cat > /tmp/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com",
    "https://registry.docker-cn.com"
  ],
  "insecure-registries": [],
  "debug": false,
  "experimental": false,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "live-restore": true,
  "max-concurrent-downloads": 10,
  "max-concurrent-uploads": 5
}
EOF

# 应用配置
echo "   应用新的Docker配置..."
sudo cp /tmp/daemon.json "$DOCKER_CONFIG_DIR/daemon.json"
sudo chmod 644 "$DOCKER_CONFIG_DIR/daemon.json"

echo "✅ Docker镜像源配置已更新"

# 重启Docker服务
echo ""
echo "6. 重启Docker服务..."
if command -v systemctl &> /dev/null; then
    echo "   使用systemctl重启Docker..."
    sudo systemctl daemon-reload
    sudo systemctl restart docker
    echo "✅ Docker服务已重启"
elif command -v service &> /dev/null; then
    echo "   使用service重启Docker..."
    sudo service docker restart
    echo "✅ Docker服务已重启"
else
    echo "⚠️  无法自动重启Docker服务"
    echo "   请手动重启Docker服务"
fi

# 验证配置
echo ""
echo "7. 验证Docker配置..."
sleep 3  # 等待Docker服务完全启动

if sudo docker info 2>/dev/null | grep -q "Registry Mirrors"; then
    echo "✅ Docker镜像源配置生效"
    echo ""
    echo "当前配置的镜像源:"
    sudo docker info 2>/dev/null | grep -A 5 "Registry Mirrors" || echo "无法获取镜像源信息"
else
    echo "⚠️  无法验证Docker配置，请检查Docker服务状态"
fi

# 测试镜像拉取
echo ""
echo "8. 测试镜像拉取速度..."
TEST_IMAGE="hello-world:latest"

echo "   测试拉取镜像: $TEST_IMAGE"
START_TIME=$(date +%s)
PULL_OUTPUT=$(sudo docker pull "$TEST_IMAGE" 2>&1)
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if echo "$PULL_OUTPUT" | grep -q "Status: Downloaded newer image"; then
    echo "✅ 镜像拉取成功"
    echo "   耗时: ${DURATION}秒"

    # 清理测试镜像
    sudo docker rmi "$TEST_IMAGE" > /dev/null 2>&1
    echo "   已清理测试镜像"
else
    echo "⚠️  镜像拉取可能失败或已存在"
    echo "   输出: $PULL_OUTPUT"
fi

# 创建项目特定的Docker Compose配置
echo ""
echo "9. 创建项目特定的Docker Compose配置..."
cat > docker-compose.override.yml << 'EOF'
# Docker Compose覆盖配置
# 用于优化国内网络环境

version: '3.8'

services:
  # 所有服务使用国内镜像源
  postgres:
    image: registry.cn-hangzhou.aliyuncs.com/google_containers/postgres:15-alpine

  timescaledb:
    image: registry.cn-hangzhou.aliyuncs.com/timescale/timescaledb:latest-pg15

  redis:
    image: registry.cn-hangzhou.aliyuncs.com/library/redis:7-alpine

  pgadmin:
    image: registry.cn-hangzhou.aliyuncs.com/dpage/pgadmin4:latest

  redis-commander:
    image: registry.cn-hangzhou.aliyuncs.com/rediscommander/redis-commander:latest

  # 构建优化配置
  backend:
    build:
      args:
        NPM_REGISTRY: "https://registry.npmmirror.com"

  frontend:
    build:
      args:
        NPM_REGISTRY: "https://registry.npmmirror.com"

  ai-service:
    build:
      args:
        PIP_INDEX_URL: "https://pypi.tuna.tsinghua.edu.cn/simple"
        PIP_TRUSTED_HOST: "pypi.tuna.tsinghua.edu.cn"

  data-service:
    build:
      args:
        PIP_INDEX_URL: "https://pypi.tuna.tsinghua.edu.cn/simple"
        PIP_TRUSTED_HOST: "pypi.tuna.tsinghua.edu.cn"

EOF

echo "✅ 项目特定的Docker Compose配置已创建: docker-compose.override.yml"

# 生成使用说明
echo ""
echo "10. 生成使用说明..."
cat > DOCKER_MIRROR_SETUP_GUIDE.md << 'EOF'
# Docker镜像源配置指南

## 配置完成状态
- **配置时间**: $(date)
- **Docker版本**: $DOCKER_VERSION
- **镜像源数量**: 4个国内镜像源
- **测试结果**: $(if [ $DURATION -lt 30 ]; then echo "良好"; else echo "一般"; fi)

## 配置的镜像源
1. **中国科学技术大学镜像源**: https://docker.mirrors.ustc.edu.cn
2. **网易镜像源**: https://hub-mirror.c.163.com
3. **百度镜像源**: https://mirror.baidubce.com
4. **Docker中国官方镜像源**: https://registry.docker-cn.com

## 使用方法

### 1. 启动项目服务
```bash
# 使用覆盖配置启动服务
docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d

# 或者直接使用（Docker Compose会自动合并配置）
docker-compose up -d
```

### 2. 查看服务状态
```bash
docker-compose ps
docker-compose logs -f [service_name]
```

### 3. 停止服务
```bash
docker-compose down
```

### 4. 清理资源
```bash
# 停止并删除所有容器、网络、卷
docker-compose down -v

# 清理未使用的镜像
docker image prune -a
```

## 故障排除

### 常见问题

#### 1. 镜像拉取失败
```bash
# 尝试使用特定镜像源
docker pull registry.cn-hangzhou.aliyuncs.com/library/redis:7-alpine
```

#### 2. Docker服务无法启动
```bash
# 检查Docker服务状态
sudo systemctl status docker

# 查看Docker日志
sudo journalctl -u docker.service -f
```

#### 3. 网络连接问题
```bash
# 测试网络连接
curl -I https://docker.mirrors.ustc.edu.cn

# 检查DNS配置
cat /etc/resolv.conf
```

### 手动配置

如果自动配置失败，可以手动配置：

1. 编辑Docker配置：
   ```bash
   sudo nano /etc/docker/daemon.json
   ```

2. 添加以下内容：
   ```json
   {
     "registry-mirrors": [
       "https://docker.mirrors.ustc.edu.cn",
       "https://hub-mirror.c.163.com",
       "https://mirror.baidubce.com",
       "https://registry.docker-cn.com"
     ]
   }
   ```

3. 重启Docker服务：
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart docker
   ```

## 性能优化建议

### 1. 镜像缓存
```bash
# 使用本地镜像缓存
docker pull --all-tags [image_name]

# 导出和导入镜像
docker save -o backup.tar [image_name]
docker load -i backup.tar
```

### 2. 网络优化
```bash
# 使用国内DNS
echo "nameserver 114.114.114.114" | sudo tee /etc/resolv.conf

# 优化网络参数
sudo sysctl -w net.core.rmem_max=26214400
sudo sysctl -w net.core.wmem_max=26214400
```

### 3. 存储优化
```bash
# 清理未使用的资源
docker system prune -a

# 查看磁盘使用情况
docker system df
```

## 联系支持

如有问题，请参考：
- [Docker官方文档](https://docs.docker.com/)
- [USTC镜像站帮助](https://mirrors.ustc.edu.cn/help/dockerhub.html)
- [阿里云容器镜像服务](https://cr.console.aliyun.com/)

---
*文档生成时间: $(date)*
*文档版本: 1.0.0*

EOF

echo "✅ 使用指南已生成: DOCKER_MIRROR_SETUP_GUIDE.md"

echo ""
echo "=== Docker镜像源配置完成 ==="
echo "完成时间: $(date)"
echo ""
echo "下一步操作:"
echo "1. 查看配置指南: cat DOCKER_MIRROR_SETUP_GUIDE.md"
echo "2. 启动项目服务: docker-compose up -d"
echo "3. 验证服务状态: docker-compose ps"