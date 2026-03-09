# 基础设施模块 - 测试脚本索引

> 本文档记录基础设施模块的所有测试脚本，包括测试目的、位置和状态。
> 最后更新：2026-02-12

---

## 测试脚本列表

### Redis部署测试

| 脚本名称 | 位置 | 功能描述 | 测试场景 | 状态 |
|---------|------|----------|----------|------|
| `test_redis_deployment.sh` | `infra/redis/tests/` | Redis单节点部署验证 | 8个测试场景 | ✅ 已完成 |

**测试覆盖场景：**
1. Redis容器运行状态检查
2. Redis健康检查 (PONG响应)
3. Redis配置验证 (maxmemory, maxmemory-policy)
4. Redis基本读写操作
5. Redis性能基准测试 (10万QPS)
6. Redis内存使用检查
7. Redis连接数检查
8. Redis持久化配置检查

**运行方式：**
```bash
./infra/redis/tests/test_redis_deployment.sh
```

---

### 服务状态机测试

| 脚本名称 | 位置 | 功能描述 | 测试场景 | 状态 |
|---------|------|----------|----------|------|
| `test_state_machine.py` | `infra/service-state/tests/` | 服务启动状态机测试 | 15个测试用例 | ✅ 已完成 |

**测试覆盖场景：**
1. 初始状态为INITIALIZING
2. 注册依赖服务
3. 所有依赖健康时进入正常模式
4. 关键依赖不健康时进入降级模式
5. 依赖恢复后自动升级到正常模式
6. 非关键依赖失败时保持正常模式
7. 循环依赖场景下冷启动
8. 状态处理器调用
9. 获取状态信息
10. 状态管理器单例模式
11. 状态管理器获取状态机
12. 多个依赖场景
13. 初始化→降级状态转换
14. 正常→降级状态转换
15. 降级→正常状态转换

**运行方式：**
```bash
cd infra/service-state/tests && python3 -m pytest test_state_machine.py -v
```

---

## 测试状态图例

- ✅ 已完成 - 测试脚本已编写并通过验证
- 🔄 进行中 - 测试脚本正在开发中
- ⏸️ 待开始 - 测试脚本待编写
- ⚠️ 需更新 - 测试脚本需要更新以匹配最新代码

---

## 按任务分类

### C1-001: 部署共享Redis集群（阶段一：单节点）
- **测试脚本**: `infra/redis/tests/test_redis_deployment.sh`
- **覆盖场景**:
  - [x] 测试场景1：Redis单节点部署成功（docker-compose up -d）
  - [x] 测试场景2：各服务能正常连接Redis
  - [x] 测试场景3：Redis性能基准测试（10万QPS）
- **状态**: ✅ 已完成

### C1-002: 定义服务启动状态机
- **测试脚本**: `infra/service-state/tests/test_state_machine.py`
- **覆盖场景**:
  - [x] 测试场景1：Redis不可用，服务应以降级模式启动
  - [x] 测试场景2：依赖服务宕机，服务应标记为降级但保持运行
  - [x] 测试场景3：依赖服务恢复，服务应自动升级到正常模式
  - [x] 测试场景4：循环依赖场景下所有服务应能正常冷启动
- **状态**: ✅ 已完成

### C2-005: 配置监控和告警
- **测试脚本**: `infra/monitoring/tests/test_event_bus_monitor.py`
- **覆盖场景**:
  - [x] 测试场景1：消息堆积超过阈值触发告警
  - [x] 测试场景2：消费延迟超过阈值触发告警
  - [x] 测试场景3：消费者空闲超过阈值触发告警
  - [x] 测试场景4：告警去重机制
- **状态**: ✅ 已完成

### C2-006: 实现事件总线管理后台
- **实现文件**: `infra/event-bus/admin/dashboard.py`
- **功能特性**:
  - [x] Web管理界面 (http://localhost:8080)
  - [x] 事件流列表查看
  - [x] 消费者组状态监控
  - [x] 消息堆积情况实时显示
  - [x] Redis状态监控
  - [x] 自动刷新 (30秒)
- **状态**: ✅ 已完成

### O4-002: 编写阶段二主从+Sentinel配置
- **配置文件**: `infra/redis/docker-compose.redis-sentinel.yml`
- **组件**:
  - [x] Master节点 (2GB内存)
  - [x] Slave节点 (2GB内存)
  - [x] 3个Sentinel节点
  - [x] Redis Exporter监控
- **状态**: ✅ 已完成

### O4-003: 编写阶段三Cluster集群配置
- **配置文件**: `infra/redis/docker-compose.redis-cluster.yml`
- **组件**:
  - [x] 3个Master节点 (4GB内存)
  - [x] 3个Slave节点 (4GB内存)
  - [x] 自动Cluster初始化
  - [x] Slot分片 (0-5460, 5461-10922, 10923-16383)
- **状态**: ✅ 已完成

### O4-004: 编写平滑迁移脚本
- **文档**: `infra/redis/migration-guide.md`
- **内容**:
  - [x] 阶段一→阶段二迁移步骤
  - [x] 阶段二→阶段三迁移步骤
  - [x] 零停机迁移方案
  - [x] 双写方案
  - [x] 回滚方案
- **状态**: ✅ 已完成

### O4-005: 配置Redis监控告警
- **配置文件**:
  - `infra/redis/monitoring/prometheus-redis.yml`
  - `infra/redis/monitoring/redis_alerts.yml`
- **告警规则**:
  - [x] 内存使用率告警 (80% warning, 90% critical)
  - [x] 连接数告警 (>500)
  - [x] 命中率告警 (<80%)
  - [x] 实例宕机告警
  - [x] 复制延迟告警
  - [x] 持久化失败告警
  - [x] 慢查询告警
- **状态**: ✅ 已完成

---

*文档版本: v1.0*
*最后更新: 2026-02-12*
*维护者: Claude*
