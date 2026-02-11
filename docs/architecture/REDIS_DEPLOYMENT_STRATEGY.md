# Redis渐进式部署策略

> 针对个人成长型项目的分阶段Redis部署方案，从最低成本起步到企业级高可用。
>
> **文档版本**: v1.0
> **分析日期**: 2026-02-11
> **适用场景**: stock-race项目（个人成长型项目）

---

## 目录

1. [部署策略概览](#一部署策略概览)
2. [阶段一：起步期（单节点）](#二阶段一起步期单节点)
3. [阶段二：成长期（主从+Sentinel）](#三阶段二成长期主从sentinel)
4. [阶段三：成熟期（Cluster集群）](#四阶段三成熟期cluster集群)
5. [平滑迁移方案](#五平滑迁移方案)
6. [成本对比](#六成本对比)
7. [实施建议](#七实施建议)

---

## 一、部署策略概览

### 1.1 分阶段部署路线图

```
┌─────────────────────────────────────────────────────────────────┐
│                     Redis部署演进路线图                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  阶段一：起步期（0-6个月）                                        │
│  ┌─────────────┐                                                │
│  │  单节点     │  ◄── 个人开发/小范围测试                        │
│  │  1GB内存   │      成本：¥0（本机/Docker）                      │
│  │  无持久化   │      可用性：99%（单点）                         │
│  └─────────────┘                                                │
│         │                                                        │
│         ▼  用户增长，需要高可用                                   │
│                                                                  │
│  阶段二：成长期（6-12个月）                                       │
│  ┌─────────────┐     ┌─────────────┐                           │
│  │   Master    │◄───►│    Slave    │  ◄── 小规模生产            │
│  │   主节点    │ 同步  │   从节点    │      成本：¥50-100/月       │
│  │   2GB内存  │       │   2GB内存  │      可用性：99.9%          │
│  └──────┬──────┘     └─────────────┘                           │
│         │                                                        │
│    ┌────┴────┐                                                   │
│    │Sentinel │  自动故障转移                                      │
│    │  哨兵   │                                                   │
│    └─────────┘                                                   │
│         │                                                        │
│         ▼  数据量增长，需要分片                                   │
│                                                                  │
│  阶段三：成熟期（12个月+）                                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                         │
│  │ Master1 │  │ Master2 │  │ Master3 │  ◄── 大规模生产          │
│  │  Slot   │  │  Slot   │  │  Slot   │      成本：¥300-500/月    │
│  │ 0-5460  │  │ 5461-10922│ 10923-16383│     可用性：99.95%       │
│  └────┬────┘  └────┬────┘  └────┬────┘                         │
│       │            │            │                               │
│  ┌────┴────┐  ┌────┴────┐  ┌────┴────┐                        │
│  │  Slave1 │  │  Slave2 │  │  Slave3 │                        │
│  └─────────┘  └─────────┘  └─────────┘                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 各阶段适用场景

| 阶段 | 用户规模 | 数据量 | QPS | 可用性要求 | 预算 |
|------|----------|--------|-----|------------|------|
| **阶段一** | < 100人 | < 1GB | < 1000 | 可接受偶尔重启 | ¥0-50/月 |
| **阶段二** | 100-1000人 | 1-10GB | 1000-10000 | 99.9%可用性 | ¥50-200/月 |
| **阶段三** | 1000+人 | 10GB+ | 10000+ | 99.95%可用性 | ¥200-500/月 |

---

## 二、阶段一：起步期（单节点）

### 2.1 架构设计

```yaml
# docker-compose.dev.yml - 开发/起步期配置
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: stock-race-redis
    command: >
      redis-server
      --maxmemory 1gb
      --maxmemory-policy allkeys-lru
      --appendonly yes
      --appendfsync everysec
      --save "900 1 300 10 60 10000"
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    # 资源限制（适合低配服务器）
    deploy:
      resources:
        limits:
          memory: 1.2G
        reservations:
          memory: 512M

volumes:
  redis_data:
    driver: local
```

### 2.2 配置说明

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `maxmemory` | 1GB | 最大内存限制 |
| `maxmemory-policy` | allkeys-lru | 内存满时淘汰最近最少使用的key |
| `appendonly` | yes | 开启AOF持久化 |
| `appendfsync` | everysec | 每秒同步一次（性能与安全的平衡） |
| `save` | 900 1 300 10 60 10000 | RDB快照策略 |

### 2.3 适用场景

✅ **适合**：
- 个人开发调试
- 小范围内部测试（< 10人）
- 演示环境
- 低预算起步

❌ **不适合**：
- 生产环境（无高可用）
- 不能容忍数据丢失
- 高并发场景

### 2.4 运维脚本

```bash
#!/bin/bash
# redis-startup.sh - 起步期Redis启动脚本

echo "Starting Redis for stock-race (Stage 1: Single Node)..."

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed"
    exit 1
fi

# 创建数据目录
mkdir -p ./data/redis

# 启动Redis
docker run -d \
    --name stock-race-redis \
    --restart unless-stopped \
    -p 6379:6379 \
    -v $(pwd)/data/redis:/data \
    redis:7-alpine \
    redis-server \
    --maxmemory 1gb \
    --maxmemory-policy allkeys-lru \
    --appendonly yes \
    --appendfsync everysec

# 检查启动状态
sleep 2
if docker ps | grep -q stock-race-redis; then
    echo "✅ Redis started successfully!"
    echo "   Host: localhost:6379"
    echo "   Data: ./data/redis"
else
    echo "❌ Failed to start Redis"
    docker logs stock-race-redis
    exit 1
fi
```

### 2.5 监控告警（基础）

```bash
#!/bin/bash
# redis-health-check.sh - 健康检查脚本

REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}

# 检查连接
if ! redis-cli -h $REDIS_HOST -p $REDIS_PORT ping | grep -q PONG; then
    echo "❌ Redis is down!"
    # 发送告警（可接入钉钉/邮件）
    # curl -X POST ...
    exit 1
fi

# 检查内存使用
MEMORY_USAGE=$(redis-cli -h $REDIS_HOST -p $REDIS_PORT INFO memory | grep used_memory_human | cut -d: -f2)
echo "Memory usage: $MEMORY_USAGE"

# 检查连接数
CONNECTED_CLIENTS=$(redis-cli -h $REDIS_HOST -p $REDIS_PORT INFO clients | grep connected_clients | cut -d: -f2)
echo "Connected clients: $CONNECTED_CLIENTS"

echo "✅ Redis is healthy"
```

---

## 三、阶段二：成长期（主从+Sentinel）

### 3.1 架构设计

```yaml
# docker-compose.prod.yml - 成长期生产配置
version: '3.8'

services:
  # 主节点
  redis-master:
    image: redis:7-alpine
    container_name: redis-master
    command: >
      redis-server
      --maxmemory 2gb
      --maxmemory-policy allkeys-lru
      --appendonly yes
      --appendfsync everysec
    ports:
      - "6379:6379"
    volumes:
      - redis_master_data:/data
    networks:
      - redis-network
    restart: unless-stopped

  # 从节点
  redis-slave:
    image: redis:7-alpine
    container_name: redis-slave
    command: >
      redis-server
      --maxmemory 2gb
      --maxmemory-policy allkeys-lru
      --appendonly yes
      --slaveof redis-master 6379
    ports:
      - "6380:6379"
    volumes:
      - redis_slave_data:/data
    networks:
      - redis-network
    depends_on:
      - redis-master
    restart: unless-stopped

  # Sentinel 1
  redis-sentinel-1:
    image: redis:7-alpine
    container_name: redis-sentinel-1
    command: >
      redis-sentinel
      /etc/redis/sentinel.conf
    ports:
      - "26379:26379"
    volumes:
      - ./config/sentinel.conf:/etc/redis/sentinel.conf
    networks:
      - redis-network
    depends_on:
      - redis-master
      - redis-slave
    restart: unless-stopped

  # Sentinel 2
  redis-sentinel-2:
    image: redis:7-alpine
    container_name: redis-sentinel-2
    command: >
      redis-sentinel
      /etc/redis/sentinel.conf
    ports:
      - "26380:26379"
    volumes:
      - ./config/sentinel.conf:/etc/redis/sentinel.conf
    networks:
      - redis-network
    depends_on:
      - redis-master
      - redis-slave
    restart: unless-stopped

  # Sentinel 3
  redis-sentinel-3:
    image: redis:7-alpine
    container_name: redis-sentinel-3
    command: >
      redis-sentinel
      /etc/redis/sentinel.conf
    ports:
      - "26381:26379"
    volumes:
      - ./config/sentinel.conf:/etc/redis/sentinel.conf
    networks:
      - redis-network
    depends_on:
      - redis-master
      - redis-slave
    restart: unless-stopped

volumes:
  redis_master_data:
  redis_slave_data:

networks:
  redis-network:
    driver: bridge
```

### 3.2 Sentinel配置

```conf
# config/sentinel.conf

port 26379
daemonize no
logfile ""

# 监控主节点
sentinel monitor stock-race-master redis-master 6379 2

# 故障转移超时（毫秒）
sentinel down-after-milliseconds stock-race-master 5000
sentinel failover-timeout stock-race-master 60000

# 并行同步数量
sentinel parallel-syncs stock-race-master 1

# 密码（如果有）
# sentinel auth-pass stock-race-master your-password
```

### 3.3 客户端连接方式

```python
# shared/redis_client.py - 支持Sentinel的客户端

import redis
from redis.sentinel import Sentinel

class RedisClient:
    """
    渐进式Redis客户端
    自动适配单节点、主从、Sentinel模式
    """

    def __init__(self, config):
        self.config = config
        self.mode = config.get('mode', 'single')
        self.client = None

    def connect(self):
        """根据配置模式连接Redis"""

        if self.mode == 'single':
            # 阶段一：单节点
            self.client = redis.Redis(
                host=self.config['host'],
                port=self.config['port'],
                db=self.config.get('db', 0),
                decode_responses=True
            )

        elif self.mode == 'sentinel':
            # 阶段二：Sentinel模式
            sentinel = Sentinel(
                self.config['sentinels'],
                socket_timeout=0.5,
                decode_responses=True
            )
            # 自动发现主节点
            self.client = sentinel.master_for(
                self.config['master_name'],
                socket_timeout=0.5
            )

        elif self.mode == 'cluster':
            # 阶段三：Cluster模式
            from rediscluster import RedisCluster
            self.client = RedisCluster(
                startup_nodes=self.config['startup_nodes'],
                decode_responses=True,
                skip_full_coverage_check=True
            )

        return self.client

    def get_client(self):
        """获取Redis客户端（自动重连）"""
        if self.client is None:
            self.connect()
        try:
            self.client.ping()
        except Exception:
            self.connect()
        return self.client


# 配置示例
REDIS_CONFIG_STAGE1 = {
    'mode': 'single',
    'host': 'localhost',
    'port': 6379,
    'db': 0
}

REDIS_CONFIG_STAGE2 = {
    'mode': 'sentinel',
    'sentinels': [
        ('localhost', 26379),
        ('localhost', 26380),
        ('localhost', 26381)
    ],
    'master_name': 'stock-race-master'
}
```

### 3.4 故障转移测试

```bash
#!/bin/bash
# failover-test.sh - 故障转移测试脚本

echo "Testing Redis Sentinel Failover..."

# 1. 检查当前主节点
echo "Current master:"
redis-cli -p 26379 SENTINEL get-master-addr-by-name stock-race-master

# 2. 停止主节点
echo "Stopping master node..."
docker stop redis-master

# 3. 等待故障转移（约10秒）
echo "Waiting for failover..."
sleep 10

# 4. 检查新的主节点
echo "New master after failover:"
redis-cli -p 26379 SENTINEL get-master-addr-by-name stock-race-master

# 5. 恢复旧主节点
echo "Restarting old master..."
docker start redis-master

# 6. 验证数据同步
echo "Checking data sync..."
redis-cli -p 6380 INFO replication

echo "Failover test completed!"
```

---

## 四、阶段三：成熟期（Cluster集群）

### 4.1 架构设计

```yaml
# docker-compose.cluster.yml - Cluster模式（成熟期）
version: '3.8'

services:
  # 主节点1
  redis-node-1:
    image: redis:7-alpine
    container_name: redis-node-1
    command: >
      redis-server
      --port 6379
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
      --maxmemory 2gb
    ports:
      - "6379:6379"
      - "16379:16379"
    volumes:
      - redis_node1_data:/data
    networks:
      - redis-cluster

  # 主节点2
  redis-node-2:
    image: redis:7-alpine
    container_name: redis-node-2
    command: >
      redis-server
      --port 6379
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
      --maxmemory 2gb
    ports:
      - "6380:6379"
      - "16380:16379"
    volumes:
      - redis_node2_data:/data
    networks:
      - redis-cluster

  # 主节点3
  redis-node-3:
    image: redis:7-alpine
    container_name: redis-node-3
    command: >
      redis-server
      --port 6379
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
      --maxmemory 2gb
    ports:
      - "6381:6379"
      - "16381:16379"
    volumes:
      - redis_node3_data:/data
    networks:
      - redis-cluster

  # 从节点1（node-1的从）
  redis-replica-1:
    image: redis:7-alpine
    container_name: redis-replica-1
    command: >
      redis-server
      --port 6379
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
      --maxmemory 2gb
    ports:
      - "6382:6379"
      - "16382:16379"
    volumes:
      - redis_replica1_data:/data
    networks:
      - redis-cluster

  # 从节点2（node-2的从）
  redis-replica-2:
    image: redis:7-alpine
    container_name: redis-replica-2
    command: >
      redis-server
      --port 6379
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
      --maxmemory 2gb
    ports:
      - "6383:6379"
      - "16383:16379"
    volumes:
      - redis_replica2_data:/data
    networks:
      - redis-cluster

  # 从节点3（node-3的从）
  redis-replica-3:
    image: redis:7-alpine
    container_name: redis-replica-3
    command: >
      redis-server
      --port 6379
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
      --maxmemory 2gb
    ports:
      - "6384:6379"
      - "16384:16379"
    volumes:
      - redis_replica3_data:/data
    networks:
      - redis-cluster

volumes:
  redis_node1_data:
  redis_node2_data:
  redis_node3_data:
  redis_replica1_data:
  redis_replica2_data:
  redis_replica3_data:

networks:
  redis-cluster:
    driver: bridge
```

### 4.2 集群初始化脚本

```bash
#!/bin/bash
# cluster-init.sh - 初始化Redis Cluster

echo "Initializing Redis Cluster..."

# 等待所有节点启动
sleep 5

# 创建集群（3主3从）
docker exec -it redis-node-1 \
    redis-cli --cluster create \
    redis-node-1:6379 \
    redis-node-2:6379 \
    redis-node-3:6379 \
    redis-replica-1:6379 \
    redis-replica-2:6379 \
    redis-replica-3:6379 \
    --cluster-replicas 1 \
    --cluster-yes

echo "Cluster initialized!"

# 检查集群状态
docker exec -it redis-node-1 redis-cli cluster info
docker exec -it redis-node-1 redis-cli cluster nodes
```

### 4.3 扩容方案

```bash
#!/bin/bash
# cluster-scale.sh - 集群扩容脚本

# 添加新主节点
echo "Adding new master node..."
docker exec -it redis-node-1 \
    redis-cli --cluster add-node \
    new-master:6379 \
    redis-node-1:6379

# 重新分配槽位
echo "Resharding slots..."
docker exec -it redis-node-1 \
    redis-cli --cluster reshard \
    redis-node-1:6379 \
    --cluster-from all \
    --cluster-to $(docker exec new-master redis-cli CLUSTER MYID) \
    --cluster-slots 4096 \
    --cluster-yes

echo "Scale completed!"
```

---

## 五、平滑迁移方案

### 5.1 阶段一 → 阶段二迁移

```bash
#!/bin/bash
# migrate-stage1-to-stage2.sh

echo "Migrating from Stage 1 to Stage 2..."

# 1. 备份阶段一数据
echo "Backing up Stage 1 data..."
redis-cli BGSAVE
cp ./data/redis/dump.rdb ./backup/dump-stage1.rdb

# 2. 启动阶段二环境
echo "Starting Stage 2 environment..."
docker-compose -f docker-compose.prod.yml up -d

# 3. 等待主从同步
echo "Waiting for replication..."
sleep 10

# 4. 验证数据
echo "Verifying data..."
MASTER_KEYS=$(redis-cli -p 6379 DBSIZE)
SLAVE_KEYS=$(redis-cli -p 6380 DBSIZE)

if [ "$MASTER_KEYS" == "$SLAVE_KEYS" ]; then
    echo "✅ Migration successful!"
    echo "   Master keys: $MASTER_KEYS"
    echo "   Slave keys: $SLAVE_KEYS"
else
    echo "⚠️ Key count mismatch, please verify"
fi

# 5. 切换应用配置
echo "Please update your application to use Sentinel configuration"
echo "Sentinel endpoints:"
echo "  - localhost:26379"
echo "  - localhost:26380"
echo "  - localhost:26381"
```

### 5.2 双写切换方案（零停机）

```python
# 双写切换工具

class RedisMigrationTool:
    """Redis双写迁移工具"""

    def __init__(self, old_client, new_client):
        self.old = old_client
        self.new = new_client
        self.dual_write = True

    def migrate_key(self, key):
        """迁移单个key"""
        key_type = self.old.type(key)
        ttl = self.old.ttl(key)

        if key_type == 'string':
            value = self.old.get(key)
            self.new.set(key, value, ex=ttl if ttl > 0 else None)
        elif key_type == 'hash':
            value = self.old.hgetall(key)
            self.new.hset(key, mapping=value)
            if ttl > 0:
                self.new.expire(key, ttl)
        # ... 其他类型

    def dual_write_operation(self, operation, *args, **kwargs):
        """双写操作"""
        # 先写新集群
        try:
            result = getattr(self.new, operation)(*args, **kwargs)
        except Exception as e:
            print(f"Write to new failed: {e}")
            result = None

        # 再写旧集群（保持兼容）
        if self.dual_write:
            try:
                getattr(self.old, operation)(*args, **kwargs)
            except Exception as e:
                print(f"Write to old failed: {e}")

        return result
```

---

## 六、成本对比

### 6.1 云服务器成本估算（以阿里云为例）

| 阶段 | 配置 | 数量 | 单价/月 | 总计/月 | 适用场景 |
|------|------|------|---------|---------|----------|
| **阶段一** | 2核4G（共享型） | 1 | ¥50 | **¥50** | 起步期 |
| **阶段二** | 2核4G | 2 | ¥50 | **¥100** | 成长期 |
| **阶段三** | 2核4G | 6 | ¥50 | **¥300** | 成熟期 |

### 6.2 云服务Redis托管方案

| 方案 | 规格 | 成本/月 | 优点 | 缺点 |
|------|------|---------|------|------|
| **自建Docker** | 1-6节点 | ¥50-300 | 成本低，可控 | 需自行运维 |
| **阿里云Redis** | 主从版 | ¥200起 | 托管服务，省心 | 成本较高 |
| **AWS ElastiCache** | cache.t3.micro | $15起 | 全球可用 | 需要信用卡 |

### 6.3 推荐策略

| 阶段 | 推荐方案 | 理由 |
|------|----------|------|
| **起步期** | 自建单节点（Docker） | 零成本，快速启动 |
| **成长期** | 自建主从+Sentinel | 成本可控，高可用 |
| **成熟期** | 自建Cluster或云托管 | 根据运维能力选择 |

---

## 七、实施建议

### 7.1 起步期检查清单

- [ ] 单节点Redis部署完成
- [ ] 持久化配置验证（AOF文件生成）
- [ ] 内存限制配置（maxmemory 1GB）
- [ ] 基础监控脚本部署
- [ ] 数据备份脚本（每日自动备份）

### 7.2 何时升级到阶段二

**触发条件**（满足任意一条）：
1. 用户规模 > 100人
2. 不能容忍服务中断（如已有付费用户）
3. 数据量 > 500MB
4. QPS > 1000

### 7.3 何时升级到阶段三

**触发条件**（满足任意一条）：
1. 单节点内存 > 8GB（需要分片）
2. QPS > 10000
3. 需要99.95%以上可用性
4. 数据量 > 50GB

### 7.4 关键配置文件清单

```
config/
├── redis/
│   ├── redis-single.conf      # 阶段一配置
│   ├── redis-master.conf      # 阶段二主节点
│   ├── redis-slave.conf       # 阶段二从节点
│   ├── sentinel.conf          # Sentinel配置
│   └── redis-cluster.conf     # 阶段三配置
├── docker/
│   ├── docker-compose.dev.yml    # 开发环境
│   ├── docker-compose.prod.yml   # 生产环境（阶段二）
│   └── docker-compose.cluster.yml # 集群环境（阶段三）
└── scripts/
    ├── redis-startup.sh       # 启动脚本
    ├── redis-backup.sh        # 备份脚本
    ├── redis-health-check.sh  # 健康检查
    ├── migrate-stage1-to-stage2.sh  # 迁移脚本
    └── cluster-init.sh        # 集群初始化
```

---

## 八、总结

### 渐进式部署策略优势

1. **成本可控**：从¥0起步，按需扩容
2. **平滑过渡**：每个阶段都有明确的升级路径
3. **风险可控**：单节点阶段可以接受偶尔重启
4. **学习曲线平缓**：从简单到复杂逐步学习Redis运维

### 关键决策点

| 决策 | 建议 |
|------|------|
| **起步期用什么？** | 单节点Docker，足够支撑100用户 |
| **何时升级？** | 100用户或不能容忍停机时 |
| **用自建还是云托管？** | 有运维能力用自建，否则用云托管 |
| **数据如何备份？** | AOF持久化 + 定时RDB备份 |

---

*文档版本: v1.0*
*创建日期: 2026-02-11*
*维护者: 首席架构师*
