# Docker镜像加速器配置文档

## 文档信息
- **创建日期**: $(date +%Y-%m-%d)
- **维护者**: 首席架构师
- **版本**: 1.0
- **相关脚本**: `scripts/configure_docker_mirrors.sh`

## 问题背景
在中国网络环境下，访问Docker Hub (registry-1.docker.io) 经常出现连接超时或速度缓慢的问题，导致：
1. 基础镜像拉取失败
2. Docker构建过程超时
3. 服务启动失败

## 解决方案

### 方案一：系统级镜像加速器配置（推荐）
修改Docker守护进程配置，添加国内镜像源：

```bash
# 配置位置：/etc/docker/daemon.json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",      # 中科大镜像源
    "https://hub-mirror.c.163.com",            # 网易镜像源
    "https://mirror.baidubce.com",             # 百度镜像源
    "https://registry.docker-cn.com"           # Docker中国官方镜像源
  ]
}
```

**生效方法**：
```bash
sudo systemctl restart docker
```

### 方案二：用户级环境变量配置
适用于无法修改系统配置的情况：

```bash
# 配置位置：~/.docker-env
export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0
export DOCKER_REGISTRY_MIRROR="https://docker.mirrors.ustc.edu.cn"
```

**生效方法**：
```bash
source ~/.docker-env
```

### 方案三：项目级Docker Compose覆盖配置
为项目创建专门的镜像源配置：

1. **开发环境**：`docker-compose.override.yml`
2. **生产环境**：`docker-compose.prod-mirrors.yml`

**使用方法**：
```bash
# 开发环境
docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d

# 生产环境
docker-compose -f docker-compose.prod.yml -f docker-compose.prod-mirrors.yml up -d
```

## 镜像源列表

### 国内Docker镜像源
| 镜像源 | URL | 稳定性 | 速度 |
|--------|-----|--------|------|
| 中科大 | https://docker.mirrors.ustc.edu.cn | ★★★★★ | ★★★★★ |
| 网易 | https://hub-mirror.c.163.com | ★★★★☆ | ★★★★☆ |
| 百度 | https://mirror.baidubce.com | ★★★☆☆ | ★★★★☆ |
| Docker中国 | https://registry.docker-cn.com | ★★★☆☆ | ★★★☆☆ |

### 其他镜像源
| 类型 | 镜像源 | URL |
|------|--------|-----|
| NPM | 淘宝NPM镜像 | https://registry.npmmirror.com |
| PyPI | 清华大学PyPI镜像 | https://pypi.tuna.tsinghua.edu.cn/simple |
| Ubuntu | 阿里云Ubuntu镜像 | http://mirrors.aliyun.com/ubuntu |

## 生产环境配置

### 生产环境镜像源配置
生产环境使用阿里云容器镜像服务，确保稳定性和安全性：

```yaml
# docker-compose.prod-mirrors.yml
services:
  postgres:
    image: registry.cn-hangzhou.aliyuncs.com/google_containers/postgres:15-alpine
  redis:
    image: registry.cn-hangzhou.aliyuncs.com/google_containers/redis:7-alpine
```

### 构建参数配置
在Dockerfile中配置构建时使用的镜像源：

```dockerfile
# 前端Dockerfile示例
ARG NODE_IMAGE=registry.npmmirror.com/library/node:20-alpine
FROM ${NODE_IMAGE}

# 配置NPM镜像源
RUN npm config set registry https://registry.npmmirror.com
```

## 故障排除

### 常见问题

#### Q1: 配置后仍然拉取失败
**可能原因**：
1. 网络防火墙限制
2. DNS解析问题
3. 镜像源暂时不可用

**解决方案**：
1. 检查网络连接：`ping docker.mirrors.ustc.edu.cn`
2. 更换镜像源顺序
3. 使用代理：配置HTTP_PROXY环境变量

#### Q2: 生产环境镜像安全问题
**解决方案**：
1. 使用企业级镜像仓库（如阿里云ACR）
2. 配置镜像签名验证
3. 定期扫描镜像漏洞

#### Q3: 构建过程超时
**解决方案**：
1. 增加超时时间：`export DOCKER_CLIENT_TIMEOUT=300`
2. 分阶段构建，减少单次构建时间
3. 使用构建缓存

## 自动化脚本

项目提供了自动化配置脚本：

```bash
# 运行配置脚本
bash scripts/configure_docker_mirrors.sh

# 仅配置生产环境
bash scripts/configure_docker_mirrors.sh --prod-only
```

## 监控与维护

### 监控指标
1. **镜像拉取成功率**：监控各镜像源的可用性
2. **拉取速度**：记录镜像拉取耗时
3. **缓存命中率**：监控本地镜像缓存效果

### 定期维护
1. **每月**：检查镜像源可用性，更新镜像源列表
2. **每季度**：更新基础镜像版本
3. **每年**：评估镜像源策略，优化配置

## 相关文档
- [部署指南](DEPLOYMENT_GUIDE.md)
- [生产环境部署指南](PRODUCTION_DEPLOYMENT_GUIDE.md)
- [Docker最佳实践](../development/DOCKER_BEST_PRACTICES.md)

---

*本文档最后更新于: $(date +%Y-%m-%d)*
*文档维护者: 首席架构师*
