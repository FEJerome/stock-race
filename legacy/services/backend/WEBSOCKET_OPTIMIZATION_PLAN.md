# WebSocket服务优化方案

## 概述
本方案旨在优化stock-race平台的WebSocket服务，提高实时消息推送的性能、稳定性和可扩展性。

## 当前状态分析

### 现有实现
- **技术栈**：Socket.IO 4.7.2
- **功能**：实时股票行情推送、交易通知、系统消息
- **架构**：单节点部署
- **问题**：
  1. 连接管理简单
  2. 缺乏状态监控
  3. 断线重连逻辑不完善
  4. 消息广播效率低
  5. 缺乏负载均衡支持

### 性能瓶颈
1. **连接数限制**：单节点支持连接数有限
2. **内存使用**：连接信息存储在内存中
3. **广播效率**：全量广播消耗资源
4. **恢复时间**：断线重连恢复慢

## 优化目标

### 短期目标（1-2周）
1. **连接管理优化**：支持1000+并发连接
2. **消息推送优化**：减少50%广播开销
3. **断线重连优化**：重连时间<3秒

### 中期目标（3-4周）
4. **集群支持**：多节点部署
5. **状态持久化**：Redis存储连接状态
6. **监控完善**：实时连接监控

### 长期目标（5-8周）
7. **自动扩缩容**：根据连接数自动调整
8. **消息队列集成**：可靠消息投递
9. **客户端优化**：智能重连策略

## 优化措施

### 1. 连接管理优化

#### 1.1 连接池管理
```javascript
// 优化后的连接管理器
class EnhancedConnectionManager {
  constructor() {
    this.connections = new Map();
    this.userConnections = new Map(); // userId -> Set(connectionId)
    this.roomSubscriptions = new Map(); // room -> Set(connectionId)
    this.connectionStats = {
      totalConnections: 0,
      activeConnections: 0,
      disconnectedConnections: 0,
      peakConnections: 0
    };
  }

  // 添加连接
  addConnection(socket, userId) {
    const connectionId = socket.id;
    const connectionInfo = {
      id: connectionId,
      socket,
      userId,
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent'],
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      rooms: new Set(),
      status: 'connected'
    };

    // 存储连接
    this.connections.set(connectionId, connectionInfo);

    // 用户连接映射
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId).add(connectionId);

    // 更新统计
    this.updateStats('connect');

    return connectionInfo;
  }

  // 移除连接
  removeConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // 清理用户连接映射
    if (this.userConnections.has(connection.userId)) {
      const userConnections = this.userConnections.get(connection.userId);
      userConnections.delete(connectionId);
      if (userConnections.size === 0) {
        this.userConnections.delete(connection.userId);
      }
    }

    // 清理房间订阅
    connection.rooms.forEach(room => {
      this.unsubscribeFromRoom(connectionId, room);
    });

    // 移除连接
    this.connections.delete(connectionId);

    // 更新统计
    this.updateStats('disconnect');
  }
}
```

#### 1.2 心跳检测
```javascript
// 增强的心跳检测
class HeartbeatManager {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
    this.heartbeatInterval = 25000; // 25秒
    this.timeoutThreshold = 30000; // 30秒
    this.heartbeatTimer = null;
  }

  start() {
    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeats();
    }, this.heartbeatInterval);
  }

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  checkHeartbeats() {
    const now = Date.now();
    const connections = this.connectionManager.connections;

    connections.forEach((connection, connectionId) => {
      if (connection.status === 'connected') {
        const timeSinceLastActivity = now - connection.lastActivity;

        if (timeSinceLastActivity > this.timeoutThreshold) {
          // 发送心跳检查
          connection.socket.emit('ping', { timestamp: now });

          // 设置超时检查
          setTimeout(() => {
            const currentConnection = connections.get(connectionId);
            if (currentConnection &&
                currentConnection.status === 'connected' &&
                now - currentConnection.lastActivity > this.timeoutThreshold * 2) {
              // 强制断开
              currentConnection.socket.disconnect(true);
              currentConnection.status = 'timeout';
            }
          }, 5000);
        }
      }
    });
  }

  updateActivity(connectionId) {
    const connection = this.connectionManager.connections.get(connectionId);
    if (connection) {
      connection.lastActivity = Date.now();
    }
  }
}
```

### 2. 消息推送优化

#### 2.1 智能广播
```javascript
// 智能广播管理器
class SmartBroadcastManager {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
    this.messageQueue = new Map();
    this.batchSize = 50;
    this.batchInterval = 100; // 100ms
    this.batchTimer = null;
  }

  // 广播到房间
  broadcastToRoom(room, event, data, options = {}) {
    const subscribers = this.connectionManager.roomSubscriptions.get(room);
    if (!subscribers || subscribers.size === 0) return;

    const message = {
      event,
      data,
      room,
      timestamp: Date.now(),
      options
    };

    // 分批发送
    const connectionIds = Array.from(subscribers);
    const batches = this.chunkArray(connectionIds, this.batchSize);

    batches.forEach((batch, index) => {
      setTimeout(() => {
        this.sendBatch(batch, message);
      }, index * 10); // 每批间隔10ms
    });
  }

  // 发送批次
  sendBatch(connectionIds, message) {
    connectionIds.forEach(connectionId => {
      const connection = this.connectionManager.connections.get(connectionId);
      if (connection && connection.status === 'connected') {
        try {
          connection.socket.emit(message.event, message.data);
        } catch (error) {
          console.error(`发送消息失败 ${connectionId}:`, error);
        }
      }
    });
  }

  // 数组分块
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

#### 2.2 消息压缩
```javascript
// 消息压缩工具
class MessageCompressor {
  constructor() {
    this.compressionThreshold = 1024; // 1KB
  }

  compress(message) {
    const messageStr = JSON.stringify(message);

    if (messageStr.length < this.compressionThreshold) {
      return {
        compressed: false,
        data: message
      };
    }

    // 使用简单压缩（实际项目中可使用zlib）
    const compressed = this.simpleCompress(messageStr);
    return {
      compressed: true,
      data: compressed,
      originalSize: messageStr.length,
      compressedSize: compressed.length
    };
  }

  simpleCompress(str) {
    // 移除多余空格和换行
    return str.replace(/\s+/g, ' ').trim();
  }

  decompress(compressedData) {
    if (!compressedData.compressed) {
      return compressedData.data;
    }

    // 解压缩
    return JSON.parse(compressedData.data);
  }
}
```

### 3. 断线重连优化

#### 3.1 智能重连策略
```javascript
// 智能重连管理器
class SmartReconnectManager {
  constructor() {
    this.reconnectAttempts = new Map(); // connectionId -> attempts
    this.maxReconnectAttempts = 5;
    this.reconnectDelays = [1000, 2000, 5000, 10000, 30000]; // 重连延迟
    this.reconnectTimeouts = new Map();
  }

  // 处理断开连接
  handleDisconnect(connectionId, reason) {
    const attempts = this.reconnectAttempts.get(connectionId) || 0;

    if (attempts >= this.maxReconnectAttempts) {
      // 超过最大重试次数
      this.reconnectAttempts.delete(connectionId);
      return false;
    }

    // 计算重连延迟
    const delay = this.reconnectDelays[Math.min(attempts, this.reconnectDelays.length - 1)];

    // 设置重连定时器
    const timeout = setTimeout(() => {
      this.attemptReconnect(connectionId);
    }, delay);

    this.reconnectTimeouts.set(connectionId, timeout);
    this.reconnectAttempts.set(connectionId, attempts + 1);

    return true;
  }

  // 尝试重连
  attemptReconnect(connectionId) {
    this.reconnectTimeouts.delete(connectionId);

    // 发送重连指令到客户端
    // 实际实现中需要与客户端协调
    console.log(`尝试重连: ${connectionId}`);
  }

  // 重置重连计数
  resetReconnectAttempts(connectionId) {
    this.reconnectAttempts.delete(connectionId);
    const timeout = this.reconnectTimeouts.get(connectionId);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(connectionId);
    }
  }
}
```

#### 3.2 状态恢复
```javascript
// 连接状态恢复
class ConnectionStateRecovery {
  constructor(redisClient) {
    this.redisClient = redisClient;
    this.stateTTL = 3600; // 1小时
  }

  // 保存连接状态
  async saveConnectionState(connectionId, state) {
    const key = `ws:state:${connectionId}`;
    await this.redisClient.setEx(
      key,
      this.stateTTL,
      JSON.stringify({
        ...state,
        savedAt: Date.now()
      })
    );
  }

  // 恢复连接状态
  async restoreConnectionState(connectionId) {
    const key = `ws:state:${connectionId}`;
    const stateStr = await this.redisClient.get(key);

    if (!stateStr) return null;

    const state = JSON.parse(stateStr);

    // 检查状态是否过期
    if (Date.now() - state.savedAt > this.stateTTL * 1000) {
      await this.redisClient.del(key);
      return null;
    }

    return state;
  }

  // 清理过期状态
  async cleanupExpiredStates() {
    // 使用Redis的过期机制自动清理
    // 定期扫描并清理
  }
}
```

### 4. 集群支持

#### 4.1 Redis适配器
```javascript
// Redis适配器用于多节点通信
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

class RedisClusterAdapter {
  constructor() {
    this.pubClient = createClient({ url: process.env.REDIS_URL });
    this.subClient = this.pubClient.duplicate();
    this.adapter = null;
  }

  async initialize(ioServer) {
    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

    this.adapter = createAdapter(this.pubClient, this.subClient, {
      key: 'socket.io',
      requestsTimeout: 10000
    });

    ioServer.adapter(this.adapter);
  }

  // 发布消息到其他节点
  async publishToCluster(event, data) {
    await this.pubClient.publish('socket.io-cluster', JSON.stringify({
      event,
      data,
      nodeId: process.env.NODE_ID,
      timestamp: Date.now()
    }));
  }

  // 订阅集群消息
  async subscribeToCluster(callback) {
    await this.subClient.subscribe('socket.io-cluster', (message) => {
      const parsed = JSON.parse(message);
      callback(parsed);
    });
  }
}
```

#### 4.2 负载均衡配置
```nginx
# Nginx负载均衡配置
upstream websocket_backend {
  ip_hash; # 保持会话粘性
  server ws1.example.com:3001;
  server ws2.example.com:3001;
  server ws3.example.com:3001;
}

server {
  listen 80;
  server_name ws.example.com;

  location / {
    proxy_pass http://websocket_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 超时设置
    proxy_connect_timeout 7d;
    proxy_send_timeout 7d;
    proxy_read_timeout 7d;
  }
}
```

### 5. 监控和告警

#### 5.1 连接监控
```javascript
// WebSocket监控服务
class WebSocketMonitor {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
    this.metrics = {
      connections: {
        total: 0,
        active: 0,
        byUser: new Map(),
        byRoom: new Map()
      },
      messages: {
        sent: 0,
        received: 0,
        errors: 0
      },
      performance: {
        avgResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: Infinity
      }
    };

    this.startMonitoring();
  }

  startMonitoring() {
    // 定期收集指标
    setInterval(() => {
      this.collectMetrics();
      this.checkThresholds();
    }, 60000); // 每分钟

    // 实时事件监听
    this.setupEventListeners();
  }

  collectMetrics() {
    const connections = this.connectionManager.connections;

    this.metrics.connections.total = connections.size;
    this.metrics.connections.active = Array.from(connections.values())
      .filter(conn => conn.status === 'connected').length;

    // 按用户统计
    this.metrics.connections.byUser.clear();
    connections.forEach(conn => {
      const count = this.metrics.connections.byUser.get(conn.userId) || 0;
      this.metrics.connections.byUser.set(conn.userId, count + 1);
    });

    // 发送到监控系统
    this.sendToMonitoringSystem(this.metrics);
  }

  checkThresholds() {
    // 检查连接数阈值
    if (this.metrics.connections.active > 1000) {
      this.triggerAlert('high_connections', {
        activeConnections: this.metrics.connections.active,
        threshold: 1000
      });
    }

    // 检查错误率
    const errorRate = this.metrics.messages.errors /
                     (this.metrics.messages.sent + 1);
    if (errorRate > 0.01) { // 1%错误率
      this.triggerAlert('high_error_rate', {
        errorRate,
        threshold: 0.01
      });
    }
  }
}
```

#### 5.2 性能仪表板
```javascript
// 性能仪表板端点
app.get('/api/websocket/metrics', authenticate, checkRole('admin'), (req, res) => {
  const monitor = webSocketService.monitor;

  res.json({
    success: true,
    data: {
      connections: {
        total: monitor.metrics.connections.total,
        active: monitor.metrics.connections.active,
        byUser: Array.from(monitor.metrics.connections.byUser.entries())
          .map(([userId, count]) => ({ userId, count })),
        peakToday: monitor.metrics.connections.peakToday
      },
      messages: {
        sent: monitor.metrics.messages.sent,
        received: monitor.metrics.messages.received,
        errors: monitor.metrics.messages.errors,
        errorRate: monitor.metrics.messages.errors /
                  (monitor.metrics.messages.sent + 1)
      },
      performance: monitor.metrics.performance,
      uptime: process.uptime(),
      nodeId: process.env.NODE_ID || 'single',
      timestamp: new Date().toISOString()
    },
    message: 'WebSocket指标获取成功'
  });
});
```

## 实施步骤

### 阶段1：基础优化（1周）
1. **连接管理器重构**
   - 实现EnhancedConnectionManager
   - 添加心跳检测
   - 测试连接管理

2. **消息推送优化**
   - 实现智能广播
   - 添加消息压缩
   - 测试推送性能

### 阶段2：稳定性和恢复（1周）
3. **断线重连优化**
   - 实现智能重连策略
   - 添加状态恢复
   - 测试重连功能

4. **监控系统**
   - 实现WebSocketMonitor
   - 添加性能仪表板
   - 设置告警规则

### 阶段3：扩展性优化（2周）
5. **集群支持**
   - 实现Redis适配器
   - 配置负载均衡
   - 测试集群部署

6. **客户端优化**
   - 更新客户端重连逻辑
   - 添加状态同步
   - 测试端到端功能

### 阶段4：测试和部署（1周）
7. **性能测试**
   - 负载测试
   - 压力测试
   - 耐久测试

8. **生产部署**
   - 分阶段部署
   - 监控验证
   - 问题修复

## 成功指标

### 性能指标
1. **连接数**：支持1000+并发连接
2. **消息延迟**：<100ms（P95）
3. **重连时间**：<3秒（平均）
4. **错误率**：<1%
5. **内存使用**：<500MB（1000连接）

### 可用性指标
1. **服务可用性**：>99.9%
2. **故障恢复**：<5分钟
3. **数据一致性**：100%
4. **监控覆盖率**：100%

### 业务指标
1. **用户满意度**：无连接问题投诉
2. **系统稳定性**：零连接相关故障
3. **开发效率**：WebSocket问题减少80%

## 测试计划

### 单元测试
1. **连接管理测试**
   - 连接/断开测试
   - 心跳检测测试
   - 房间订阅测试

2. **消息推送测试**
   - 广播性能测试
   - 消息压缩测试
   - 错误处理测试

### 集成测试
3. **端到端测试**
   - 完整连接流程
   - 消息收发测试
   - 断线重连测试

4. **集群测试**
   - 多节点通信
   - 负载均衡测试
   - 故障转移测试

### 性能测试
5. **负载测试**
   - 模拟500并发用户
   - 消息频率测试
   - 资源使用监控

6. **压力测试**
   - 模拟1000+并发连接
   - 极限情况测试
   - 恢复能力测试

## 回滚策略

### 情况1：优化引入问题
1. 立即停止新版本部署
2. 回退到稳定版本
3. 分析问题原因
4. 修复后重新测试

### 情况2：性能下降
1. 收集性能数据
2. 对比优化前后
3. 定位性能瓶颈
4. 调整优化策略

### 情况3：集群问题
1. 切换回单节点模式
2. 检查集群配置
3. 修复集群问题
4. 重新部署集群

## 文档更新

### 需要更新的文档
1. **架构文档**：WebSocket架构更新
2. **部署文档**：集群部署指南
3. **监控文档**：WebSocket监控指南
4. **API文档**：WebSocket事件文档
5. **故障处理文档**：连接问题处理

### 新增文档
1. **WebSocket客户端指南**
2. **性能优化指南**
3. **集群配置指南**
4. **监控仪表板使用指南**

## 团队培训

### 培训内容
1. **新架构介绍**
2. **监控工具使用**
3. **故障排查方法**
4. **性能优化技巧**

### 培训方式
1. **技术分享会**
2. **实践工作坊**
3. **文档学习**
4. **代码审查会**

## 附录

### A. 配置示例
```javascript
// WebSocket服务配置
const webSocketConfig = {
  // 连接配置
  connection: {
    pingInterval: 25000,
    pingTimeout: 30000,
    maxHttpBufferSize: 1e6, // 1MB
    connectTimeout: 45000,
    transports: ['websocket', 'polling']
  },

  // 集群配置
  cluster: {
    enabled: process.env.CLUSTER_ENABLED === 'true',
    redisUrl: process.env.REDIS_URL,
    adapterKey: 'socket.io',
    nodeId: process.env.NODE_ID
  },

  // 监控配置
  monitoring: {
    enabled: true,
    metricsInterval: 60000,
    alertThresholds: {
      maxConnections: 1000,
      errorRate: 0.01,
      memoryUsage: 0.8
    }
  }
};
```

### B. 客户端重连示例
```javascript
// 客户端智能重连
class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.reconnectTimer = null;
    this.isConnected = false;
  }

  connect() {
    this.socket = io(this.url, {
      reconnection: false, // 使用自定义重连逻辑
      transports: ['websocket', 'polling']
    });

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('WebSocket连接成功');
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.log(`WebSocket断开: ${reason}`);
      this.handleDisconnect();
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket连接错误:', error);
      this.handleDisconnect();
    });
  }

  handleDisconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('达到最大重连次数，停止重连');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`${delay}ms后尝试重连 (尝试 ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.socket.connect();
    }, delay);
  }
}
```

### C. 监控指标说明
1. **连接指标**
   - active_connections：活跃连接数
   - total_connections：总连接数
   - connection_rate：连接速率
   - disconnect_rate：断开速率

2. **消息指标**
   - messages_sent：发送消息数
   - messages_received：接收消息数
   - message_latency：消息延迟
   - error_rate：错误率

3. **资源指标**
   - memory_usage：内存使用
   - cpu_usage：CPU使用
   - network_io：网络IO

## 更新记录

| 日期 | 版本 | 更新内容 | 负责人 |
|------|------|----------|--------|
| 2026-02-04 | 1.0 | 创建WebSocket优化方案 | 后端模块智能体 |

## 联系方式
- 优化负责人：后端模块智能体
- 问题反馈：通过项目issue系统
- 紧急联系：项目协调主文档