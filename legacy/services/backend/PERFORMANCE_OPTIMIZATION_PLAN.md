# 后端性能优化计划

## 概述
本计划旨在优化stock-race后端性能，提高系统响应速度、处理能力和稳定性。

## 当前性能基准
基于代码分析，识别以下性能瓶颈：

### 1. 数据库查询
- 多次独立查询可以合并
- 缺乏查询缓存
- 连接池配置可优化

### 2. 外部服务调用
- DataService调用缺乏断路器
- 重试机制简单
- 降级策略有限

### 3. 缓存策略
- 使用简单的Map缓存
- 无自动过期清理
- 内存泄漏风险

### 4. WebSocket连接
- 连接管理简单
- 缺乏状态监控
- 断线重连逻辑不完善

### 5. API响应
- 响应时间未监控
- 缺乏性能指标
- 错误处理重复

## 优化目标

### 短期目标（1-2周）
1. **数据库查询优化**：减少30%查询时间
2. **缓存策略改进**：提高缓存命中率到80%
3. **外部服务调用优化**：降低失败率到5%以下

### 中期目标（3-4周）
4. **WebSocket性能优化**：支持1000+并发连接
5. **API响应优化**：平均响应时间<100ms
6. **内存使用优化**：减少20%内存占用

### 长期目标（5-8周）
7. **监控系统完善**：实时性能监控
8. **自动扩缩容**：根据负载自动调整
9. **灾难恢复**：快速故障恢复

## 优化措施

### 1. 数据库查询优化

#### 1.1 查询合并
**问题**：StockController中多次独立查询
**解决方案**：
```javascript
// 优化前：多次查询
const stock = await stockRepository.findOne({ code: stockCode });
const portfolios = await portfolioRepository.findByStock(stockCode);
const trades = await tradeRepository.findByStock(stockCode);

// 优化后：单次查询包含关联数据
const stockWithRelations = await stockRepository.findOneWithRelations(
  { code: stockCode },
  {
    include: {
      portfolios: { take: 10, orderBy: { quantity: 'desc' } },
      trades: { take: 10, orderBy: { executedAt: 'desc' } }
    }
  }
);
```

#### 1.2 查询缓存
**问题**：频繁查询相同数据
**解决方案**：
```javascript
// 添加查询缓存层
class CachedRepository {
  constructor(repository, cacheTTL = 60000) {
    this.repository = repository;
    this.cache = new Map();
    this.cacheTTL = cacheTTL;
  }

  async findOneWithCache(key, query, options) {
    const cacheKey = this.buildCacheKey(key, query, options);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    const data = await this.repository.findOne(query, options);
    this.cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  }
}
```

#### 1.3 连接池优化
**问题**：固定连接池配置
**解决方案**：
```javascript
// 动态连接池配置
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
  min: parseInt(process.env.DB_MIN_CONNECTIONS) || 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // 连接健康检查
  maxUses: 7500, // 每个连接最大使用次数
  allowExitOnIdle: true
});
```

### 2. 缓存策略改进

#### 2.1 Redis集成
**问题**：内存缓存有限
**解决方案**：
```javascript
// Redis缓存服务
class RedisCacheService {
  constructor() {
    this.redisClient = redis.createClient({
      url: process.env.REDIS_URL
    });
    this.redisClient.connect();
  }

  async get(key) {
    const data = await this.redisClient.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set(key, value, ttl = 3600) {
    await this.redisClient.setEx(key, ttl, JSON.stringify(value));
  }

  async delete(key) {
    await this.redisClient.del(key);
  }
}
```

#### 2.2 多级缓存
**问题**：单一缓存策略
**解决方案**：
```javascript
// 多级缓存：内存 + Redis
class MultiLevelCache {
  constructor() {
    this.memoryCache = new Map();
    this.redisCache = new RedisCacheService();
    this.memoryTTL = 60000; // 1分钟
    this.redisTTL = 3600;   // 1小时
  }

  async get(key) {
    // 1. 检查内存缓存
    const memoryCached = this.memoryCache.get(key);
    if (memoryCached && Date.now() - memoryCached.timestamp < this.memoryTTL) {
      return memoryCached.data;
    }

    // 2. 检查Redis缓存
    const redisCached = await this.redisCache.get(key);
    if (redisCached) {
      // 回填到内存缓存
      this.memoryCache.set(key, {
        data: redisCached,
        timestamp: Date.now()
      });
      return redisCached;
    }

    return null;
  }
}
```

### 3. 外部服务调用优化

#### 3.1 断路器模式
**问题**：服务失败时继续尝试
**解决方案**：
```javascript
// 断路器实现
class CircuitBreaker {
  constructor(failureThreshold = 5, resetTimeout = 60000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('断路器打开，服务不可用');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}
```

#### 3.2 批量请求
**问题**：多次单独请求
**解决方案**：
```javascript
// 批量请求处理器
class BatchRequestHandler {
  constructor(batchSize = 10, batchTimeout = 100) {
    this.batchSize = batchSize;
    this.batchTimeout = batchTimeout;
    this.queue = [];
    this.timer = null;
  }

  async request(key, fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ key, fn, resolve, reject });

      if (this.queue.length >= this.batchSize) {
        this.processBatch();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.processBatch(), this.batchTimeout);
      }
    });
  }

  async processBatch() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const batch = this.queue.splice(0, this.batchSize);
    const batchKeys = batch.map(item => item.key);

    try {
      // 执行批量请求
      const results = await this.executeBatch(batchKeys);

      // 分发结果
      batch.forEach((item, index) => {
        item.resolve(results[index]);
      });
    } catch (error) {
      batch.forEach(item => {
        item.reject(error);
      });
    }
  }
}
```

### 4. WebSocket性能优化

#### 4.1 连接池管理
**问题**：连接管理简单
**解决方案**：
```javascript
// WebSocket连接管理器
class WebSocketConnectionManager {
  constructor() {
    this.connections = new Map();
    this.heartbeatInterval = 30000; // 30秒
    this.maxConnectionsPerIP = 10;
    this.connectionStats = new Map();
  }

  addConnection(socket, userId) {
    const connectionId = socket.id;

    // 检查IP限制
    const ip = socket.handshake.address;
    const ipConnections = this.getIPConnections(ip);

    if (ipConnections >= this.maxConnectionsPerIP) {
      socket.disconnect(true);
      return false;
    }

    this.connections.set(connectionId, {
      socket,
      userId,
      ip,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now()
    });

    this.updateIPStats(ip, 1);
    return true;
  }

  // 心跳检测
  startHeartbeatCheck() {
    setInterval(() => {
      const now = Date.now();
      this.connections.forEach((conn, id) => {
        if (now - conn.lastHeartbeat > this.heartbeatInterval * 2) {
          conn.socket.disconnect(true);
          this.connections.delete(id);
          this.updateIPStats(conn.ip, -1);
        }
      });
    }, this.heartbeatInterval);
  }
}
```

#### 4.2 消息广播优化
**问题**：广播效率低
**解决方案**：
```javascript
// 高效消息广播
class EfficientBroadcaster {
  constructor() {
    this.roomSubscriptions = new Map();
    this.messageQueue = new Map();
  }

  subscribe(connectionId, room) {
    if (!this.roomSubscriptions.has(room)) {
      this.roomSubscriptions.set(room, new Set());
    }
    this.roomSubscriptions.get(room).add(connectionId);
  }

  broadcastToRoom(room, event, data) {
    const subscribers = this.roomSubscriptions.get(room);
    if (!subscribers) return;

    // 批量发送
    const message = JSON.stringify({ event, data });
    subscribers.forEach(connectionId => {
      this.queueMessage(connectionId, message);
    });
  }

  queueMessage(connectionId, message) {
    if (!this.messageQueue.has(connectionId)) {
      this.messageQueue.set(connectionId, []);
    }
    this.messageQueue.get(connectionId).push(message);

    // 批量发送
    if (this.messageQueue.get(connectionId).length >= 10) {
      this.flushMessages(connectionId);
    }
  }
}
```

### 5. API响应优化

#### 5.1 响应压缩
**问题**：响应数据未压缩
**解决方案**：
```javascript
// 动态压缩中间件
const dynamicCompression = (req, res, next) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';

  if (acceptEncoding.includes('br')) {
    res.setHeader('Content-Encoding', 'br');
    // 使用Brotli压缩
  } else if (acceptEncoding.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
    // 使用Gzip压缩
  }

  next();
};

app.use(dynamicCompression);
```

#### 5.2 响应缓存
**问题**：相同请求重复处理
**解决方案**：
```javascript
// API响应缓存中间件
const responseCache = (duration = 60) => {
  const cache = new Map();

  return (req, res, next) => {
    // 只缓存GET请求
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `${req.originalUrl}:${JSON.stringify(req.query)}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < duration * 1000) {
      // 设置缓存头
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', `public, max-age=${duration}`);
      return res.json(cached.data);
    }

    // 重写res.json方法
    const originalJson = res.json;
    res.json = function(data) {
      // 只缓存成功响应
      if (res.statusCode === 200) {
        cache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });

        res.setHeader('X-Cache', 'MISS');
        res.setHeader('Cache-Control', `public, max-age=${duration}`);
      }

      return originalJson.call(this, data);
    };

    next();
  };
};
```

### 6. 监控和指标

#### 6.1 性能指标收集
```javascript
// 性能监控中间件
const performanceMonitor = (req, res, next) => {
  const startTime = Date.now();
  req.startTime = startTime;

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const metrics = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'],
      ip: req.ip
    };

    // 发送到监控系统
    this.sendMetrics(metrics);

    // 记录慢请求
    if (duration > 1000) {
      console.warn(`慢请求: ${req.method} ${req.path} - ${duration}ms`);
    }
  });

  next();
};
```

#### 6.2 健康检查端点
```javascript
// 增强的健康检查
app.get('/api/health', async (req, res) => {
  const checks = {
    database: { status: 'checking', latency: 0 },
    redis: { status: 'checking', latency: 0 },
    dataService: { status: 'checking', latency: 0 },
    aiService: { status: 'checking', latency: 0 }
  };

  // 并行检查所有依赖
  await Promise.allSettled([
    checkDatabase().then(result => {
      checks.database = result;
    }),
    checkRedis().then(result => {
      checks.redis = result;
    }),
    checkDataService().then(result => {
      checks.dataService = result;
    }),
    checkAIService().then(result => {
      checks.aiService = result;
    })
  ]);

  const allHealthy = Object.values(checks).every(check => check.status === 'healthy');
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: allHealthy ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version
  });
});
```

## 实施时间表

### 第1周：数据库和缓存优化
- 周一：查询合并优化
- 周二：查询缓存实现
- 周三：连接池优化
- 周四：Redis集成
- 周五：测试和验证

### 第2周：外部服务和WebSocket优化
- 周一：断路器模式实现
- 周二：批量请求处理
- 周三：WebSocket连接管理
- 周四：消息广播优化
- 周五：测试和验证

### 第3周：API和监控优化
- 周一：响应压缩和缓存
- 周二：性能监控实现
- 周三：健康检查增强
- 周四：集成测试
- 周五：性能基准测试

### 第4周：优化和收尾
- 周一：问题修复
- 周二：性能调优
- 周三：文档更新
- 周四：生产部署
- 周五：监控验证

## 成功指标

### 性能指标
1. **API响应时间**：平均<100ms，P95<200ms
2. **数据库查询时间**：减少30%
3. **缓存命中率**：>80%
4. **服务可用性**：>99.9%
5. **并发连接数**：支持1000+ WebSocket连接

### 资源指标
1. **CPU使用率**：平均<60%
2. **内存使用**：减少20%
3. **网络带宽**：优化后减少30%
4. **磁盘IO**：减少50%

### 业务指标
1. **用户满意度**：无性能相关投诉
2. **系统稳定性**：零性能相关故障
3. **开发效率**：性能问题减少50%

## 风险评估

### 技术风险
1. **优化引入新bug**
   - 缓解：充分测试，分阶段部署
2. **性能优化无效**
   - 缓解：基准测试，A/B测试
3. **兼容性问题**
   - 缓解：保持API兼容，版本控制

### 业务风险
1. **服务中断**
   - 缓解：蓝绿部署，回滚计划
2. **数据不一致**
   - 缓解：数据验证，事务处理
3. **用户体验下降**
   - 缓解：用户测试，监控反馈

### 运维风险
1. **监控缺失**
   - 缓解：完善监控，告警设置
2. **容量不足**
   - 缓解：容量规划，自动扩缩容
3. **备份恢复**
   - 缓解：定期备份，恢复演练

## 监控和告警

### 关键指标监控
1. **响应时间监控**
   - 阈值：>200ms触发警告，>500ms触发告警
2. **错误率监控**
   - 阈值：>1%触发警告，>5%触发告警
3. **资源使用监控**
   - CPU：>80%警告，>90%告警
   - 内存：>80%警告，>90%告警
4. **服务健康监控**
   - 连续失败：3次警告，5次告警

### 告警渠道
1. **即时通讯**：Slack/钉钉
2. **邮件通知**：关键告警
3. **短信通知**：紧急告警
4. **电话通知**：严重故障

## 文档更新

### 需要更新的文档
1. **架构文档**：更新性能优化部分
2. **部署文档**：更新配置要求
3. **监控文档**：更新监控指标
4. **故障处理文档**：更新性能问题处理
5. **API文档**：更新性能特性

## 团队培训

### 培训内容
1. **性能优化原则**
2. **监控工具使用**
3. **故障排查方法**
4. **性能测试方法**

### 培训方式
1. **技术分享会**
2. **实践工作坊**
3. **文档学习**
4. **代码审查**

## 附录

### A. 性能测试工具
1. **负载测试**：Apache JMeter, k6
2. **压力测试**：Artillery, Locust
3. **基准测试**：autocannon, wrk
4. **监控工具**：Prometheus, Grafana

### B. 优化检查清单
- [ ] 数据库查询优化
- [ ] 缓存策略实现
- [ ] 外部服务优化
- [ ] WebSocket优化
- [ ] API响应优化
- [ ] 监控系统完善
- [ ] 文档更新
- [ ] 团队培训

### C. 性能测试场景
1. **正常负载测试**：模拟日常用户行为
2. **峰值负载测试**：模拟促销活动
3. **压力测试**：测试系统极限
4. **耐久测试**：长时间运行测试
5. **故障恢复测试**：模拟服务中断

## 更新记录

| 日期 | 版本 | 更新内容 | 负责人 |
|------|------|----------|--------|
| 2026-02-04 | 1.0 | 创建性能优化计划 | 后端模块智能体 |

## 联系方式
- 性能优化负责人：后端模块智能体
- 问题反馈：通过项目issue系统
- 紧急联系：项目协调主文档