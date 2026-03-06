# Redis 平滑迁移指南

本文档描述如何从阶段一平滑迁移到阶段二和阶段三，确保数据不丢失。

## 迁移路线图

```
阶段一（单节点） ──► 阶段二（主从+Sentinel） ──► 阶段三（Cluster集群）
   1GB内存              2GB+2GB内存                  4GBx6内存
   99%可用性            99.9%可用性                  99.95%可用性
   ¥0/月               ¥50-200/月                   ¥200-500/月
```

## 阶段一 → 阶段二 迁移

### 前置条件

- 阶段一Redis运行正常
- 备份数据（可选，阶段一数据可重建）
- 准备阶段二配置文件

### 迁移步骤

1. **启动阶段二集群**

```bash
# 停止现有Redis（可选，也可以并行运行）
docker-compose -f infra/redis/docker-compose.redis.yml down

# 启动阶段二主从+Sentinel
docker-compose -f infra/redis/docker-compose.redis-sentinel.yml up -d
```

2. **验证主从同步**

```bash
# 检查主节点
docker exec stock-race-redis-master redis-cli info replication

# 预期输出：
# role:master
# connected_slaves:1
# slave0:ip=redis-slave,port=6379,state=online,...
```

3. **验证Sentinel状态**

```bash
# 检查Sentinel
docker exec stock-race-sentinel-1 redis-cli -p 26379 sentinel master mymaster
```

4. **更新应用配置**

```yaml
# 修改各服务的 docker-compose.yml
# 从：
REDIS_URL: redis://redis:6379

# 改为：
REDIS_URL: redis://redis-master:6379
# 或连接Sentinel（推荐）
```

### 回滚方案

如果迁移失败，可以快速回滚到阶段一：

```bash
docker-compose -f infra/redis/docker-compose.redis-sentinel.yml down
docker-compose -f infra/redis/docker-compose.redis.yml up -d
```

---

## 阶段二 → 阶段三 迁移

### 前置条件

- 阶段二集群运行正常
- **重要**：阶段二到阶段三涉及数据迁移，需要谨慎操作
- 确保有足够磁盘空间存储备份

### 迁移步骤

1. **备份阶段二数据**

```bash
# 创建备份目录
mkdir -p /backup/redis-stage2

# 备份主节点数据
docker exec stock-race-redis-master redis-cli BGSAVE
docker cp stock-race-redis-master:/data/dump.rdb /backup/redis-stage2/
```

2. **导出数据**

```bash
# 使用redis-dump导出所有key（需要安装redis-dump）
# 或者使用Python脚本导出
python3 << 'EOF'
import redis
import json

r = redis.Redis(host='localhost', port=6379, password='redis123')

# 导出所有key
for key in r.scan_iter():
    key_type = r.type(key)
    print(f"Exporting {key} ({key_type})")
    # 根据类型导出数据...

print("Export completed")
EOF
```

3. **启动阶段三集群**

```bash
# 启动Cluster集群
docker-compose -f infra/redis/docker-compose.redis-cluster.yml up -d

# 等待集群初始化完成
sleep 10

# 验证集群状态
docker exec stock-race-redis-master-1 redis-cli -a redis123 cluster info
```

4. **导入数据到Cluster**

```bash
# 使用redis-cli导入数据
# 注意：Cluster需要key分布在不同slot，可能需要重新设计key

python3 << 'EOF'
import redis
from rediscluster import RedisCluster

# 连接Cluster
startup_nodes = [
    {"host": "localhost", "port": "6379"},
    {"host": "localhost", "port": "6380"},
    {"host": "localhost", "port": "6381"}
]
rc = RedisCluster(startup_nodes=startup_nodes, decode_responses=True, password='redis123')

# 导入数据...
print("Import completed")
EOF
```

5. **验证数据完整性**

```bash
# 检查Cluster节点
docker exec stock-race-redis-master-1 redis-cli -a redis123 cluster nodes

# 检查数据分布
docker exec stock-race-redis-master-1 redis-cli -a redis123 dbsize
```

### 回滚方案

```bash
# 停止Cluster
docker-compose -f infra/redis/docker-compose.redis-cluster.yml down

# 恢复阶段二
docker-compose -f infra/redis/docker-compose.redis-sentinel.yml up -d

# 如果需要恢复数据
docker cp /backup/redis-stage2/dump.rdb stock-race-redis-master:/data/
docker restart stock-race-redis-master
```

---

## 零停机迁移方案

对于生产环境，建议使用以下零停机迁移方案：

### 双写方案

1. **配置双写**：应用同时写入阶段一和阶段二
2. **数据同步**：使用Redis复制或自定义同步
3. **切换读流量**：逐步将读流量切换到阶段二
4. **停止写入阶段一**：确认阶段二稳定后停止写入
5. **清理**：下线阶段一

### 使用RedisShake迁移

```bash
# 安装RedisShake
wget https://github.com/alibaba/RedisShake/releases/download/v3.1.11/redis-shake-v3.1.11-linux.tar.gz
tar -xzf redis-shake-v3.1.11-linux.tar.gz

# 配置同步
cat > sync.toml << 'EOF'
[source]
type = "standalone"
address = "localhost:6379"
password = "redis123"

[target]
type = "standalone"
address = "localhost:6380"
password = "redis123"
EOF

# 启动同步
./redis-shake sync.toml
```

---

## 监控检查清单

迁移过程中需要监控的指标：

- [ ] 内存使用率
- [ ] 连接数
- [ ] 命令处理速率
- [ ] 复制延迟（主从）
- [ ] 错误率
- [ ] 客户端连接状态

---

## 常见问题

### Q1: 迁移后数据丢失怎么办？

**A**: 确保在迁移前进行完整备份。如果数据丢失，可以从备份恢复。

### Q2: Cluster模式下key如何分布？

**A**: Cluster使用CRC16算法计算key的slot。相关key需要使用hash tag（如`{user:123}:profile`）确保在同一slot。

### Q3: 迁移过程中性能下降怎么办？

**A**:
- 选择业务低峰期迁移
- 使用双写方案平滑过渡
- 监控性能指标，必要时回滚

### Q4: 如何验证迁移成功？

**A**:
- 检查数据完整性（key数量、数据内容）
- 验证读写功能正常
- 监控错误率
- 进行压力测试

---

*文档版本: v1.0*
*最后更新: 2026-02-12*
