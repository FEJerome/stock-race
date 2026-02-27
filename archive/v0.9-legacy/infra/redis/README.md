# Redis 渐进式部署指南

> 从单节点起步，平滑过渡到企业级高可用集群

## 部署阶段概览

```
阶段一：起步期（0-6个月）        阶段二：成长期（6-12个月）        阶段三：成熟期（12个月+）
┌─────────────┐                  ┌─────────────┐     ┌─────────────┐      ┌─────────┐  ┌─────────┐  ┌─────────┐
│  单节点     │  ───────────►   │   Master    │◄───►│    Slave    │  ──► │ Master1 │  │ Master2 │  │ Master3 │
│  1GB内存   │    用户增长      │   主节点    │ 同步  │   从节点    │      │  Slot   │  │  Slot   │  │  Slot   │
│  无持久化   │                  │   2GB内存  │       │   2GB内存  │      │ 0-5460  │  │ 5461-   │  │ 10923-  │
│  成本：¥0   │                  └──────┬──────┘     └─────────────┘      └────┬────┘  │ 10922   │  │ 16383   │
└─────────────┘                         │                                     │      └─────────┘  └─────────┘
   可用性：99%                    ┌────┴────┐                              ┌─┴─┐
                                 │Sentinel │                              │...│
                                 │  哨兵   │                              └─┬─┘
                                 └─────────┘                                │
                                  可用性：99.9%                              可用性：99.95%
                                  成本：¥50-200/月                           成本：¥200-500/月
```

## 快速开始

### 阶段一：单节点（当前）

```bash
# 启动Redis单节点
docker-compose -f infra/redis/docker-compose.redis.yml up -d

# 验证Redis运行
docker exec stock-race-redis redis-cli ping
# 预期输出：PONG

# 查看Redis信息
docker exec stock-race-redis redis-cli info server
```

### 配置说明

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `maxmemory` | 1gb | 最大内存限制 |
| `maxmemory-policy` | allkeys-lru | 内存满时淘汰最近最少使用的key |
| `appendonly` | yes | 开启AOF持久化 |
| `appendfsync` | everysec | 每秒同步一次（性能与安全的平衡） |
| `save` | "" | 关闭RDB快照（减少IO） |
| `databases` | 16 | 数据库数量 |

### 升级触发条件

| 指标 | 阶段一→阶段二 | 阶段二→阶段三 |
|------|--------------|--------------|
| 用户规模 | > 100人 | > 1000人 |
| 内存使用 | > 70% (700MB) | > 8GB |
| QPS | > 5000 | > 10000 |
| 可用性要求 | 不能容忍停机 | 需要水平扩展 |

## 监控指标

```bash
# 查看内存使用
docker exec stock-race-redis redis-cli info memory | grep used_memory_human

# 查看连接数
docker exec stock-race-redis redis-cli info clients | grep connected_clients

# 查看命中率
docker exec stock-race-redis redis-cli info stats | grep keyspace
```

## 连接到Redis

### 从服务容器连接

```python
# Python
import redis
r = redis.Redis(host='redis', port=6379, decode_responses=True)
```

```javascript
// Node.js
const redis = require('redis');
const client = redis.createClient({ url: 'redis://redis:6379' });
```

### 从主机连接

```bash
redis-cli -h localhost -p 6379
```

## 故障排除

### 内存不足

```bash
# 查看内存使用详情
docker exec stock-race-redis redis-cli info memory

# 清理过期key
docker exec stock-race-redis redis-cli EVAL "return redis.call('del', unpack(redis.call('keys', 'pattern:*')))" 0
```

### 连接问题

```bash
# 检查Redis状态
docker ps | grep redis
docker logs stock-race-redis

# 重启Redis
docker-compose -f infra/redis/docker-compose.redis.yml restart redis
```

## 下一步

- [阶段二配置](./docs/stage2-master-slave.md) - 主从+Sentinel高可用
- [阶段三配置](./docs/stage3-cluster.md) - Cluster集群分片
- [迁移指南](./docs/migration-guide.md) - 平滑升级步骤
