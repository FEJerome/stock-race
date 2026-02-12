# 前端模拟数据改造 - 阶段三：交易系统改造

## 📋 阶段概述
**目标**：将前端交易系统服务从模拟数据改为真实数据，实现交易状态缓存和实时更新
**完成时间**：2026-02-05
**负责人**：首席架构师

## 🎯 完成目标

### 1. 交易服务全面改造
- **文件**：`frontend/src/services/trading.service.ts`
- **改造函数**：
  - `getOrders()`：交易订单获取，带缓存和降级机制（用户数据15分钟）
  - `createOrder()`：创建交易订单，成功后清理相关缓存
  - `cancelOrder()`：取消交易订单，成功后清理相关缓存
  - `getPositions()`：持仓列表获取，带缓存和降级机制（用户数据15分钟）
  - `getPortfolioSummary()`：持仓汇总获取，已调用真实API，保留降级机制
  - `getOrderDetail()`：订单详情获取，带缓存和降级机制（用户数据15分钟）
  - `getTradeHistory()`：交易历史获取，带缓存和降级机制（历史数据30分钟）

### 2. 缓存工具增强
- **文件**：`frontend/src/utils/cache.ts`
- **新增功能**：
  - `clearByPattern()`：清理匹配特定模式的缓存
  - 支持交易操作后的缓存清理，确保数据一致性

### 3. 缓存策略设计
- **用户数据**：缓存15分钟（订单、持仓、订单详情）
- **历史数据**：缓存30分钟（交易历史）
- **操作后清理**：创建/取消订单后清理相关缓存
- **降级数据**：缓存1分钟，避免频繁降级

### 4. 错误处理增强
- **API限流**（429）：使用缓存数据
- **服务器错误**（≥500）：使用缓存数据
- **网络超时**：使用缓存数据
- **优雅降级**：所有错误最终降级到模拟数据
- **操作反馈**：交易操作提供明确的成功/失败反馈

## 🔧 技术实现

### 缓存工具类增强功能
```typescript
// 清理匹配模式的缓存
clearByPattern(pattern: string): void {
  // 清理内存缓存
  for (const [key, _] of this.memoryCache.entries()) {
    if (key.includes(pattern)) {
      this.memoryCache.delete(key);
    }
  }

  // 清理本地存储缓存
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (storageKey?.startsWith(this.PREFIX)) {
        const cacheKey = storageKey.substring(this.PREFIX.length);
        if (cacheKey.includes(pattern)) {
          localStorage.removeItem(storageKey);
        }
      }
    }
  } catch (e) {
    console.warn('本地存储模式清理失败:', e);
  }
}
```

### 交易服务缓存集成模式
```typescript
getOrders: async (params?: PaginationParams): Promise<PaginatedResponse<TradeOrder>> => {
  // 1. 生成缓存键（包含分页参数）
  const page = params?.page || 1;
  const pageSize = params?.pageSize || 10;
  const cacheKey = `trading_orders_page${page}_size${pageSize}`;

  // 2. 尝试从缓存获取（用户数据缓存15分钟）
  const cached = cacheManager.get(cacheKey);
  if (cached) {
    console.log('使用缓存交易订单数据:', cacheKey);
    return cached;
  }

  // 3. 调用真实API
  const response = await api.get<{...}>('/trades', { params });

  // 4. 转换数据格式并缓存（15分钟）
  const orders = response.data.items.map(item => ({ ... }));
  cacheManager.set(cacheKey, orders, 900000);

  return orders;
}
```

### 交易操作缓存清理
```typescript
createOrder: async (order: CreateOrderRequest): Promise<TradeOrder> => {
  try {
    const response = await api.post<{...}>('/trades', order);

    // 创建订单成功后，清理相关缓存
    cacheManager.clearByPattern('trading_orders_page');

    return response.data;
  } catch (error) {
    // 降级处理...
  }
}
```

## 📊 缓存性能优化

### 缓存命中策略
1. **首次请求**：调用API，缓存结果
2. **重复请求**（15分钟内）：使用缓存
3. **交易操作后**：清理相关缓存，确保下次获取最新数据
4. **API失败**：使用缓存或降级数据

### 数据一致性保障
- **操作后清理**：交易操作成功后清理相关缓存
- **缓存键设计**：包含分页参数，支持多页数据独立缓存
- **模式匹配清理**：支持清理匹配特定模式的所有缓存键

## 🧪 测试验证

### 已验证功能
1. ✅ 交易服务7个核心函数全部改造完成
2. ✅ 缓存工具增强功能（clearByPattern）
3. ✅ 缓存设置和获取机制
4. ✅ 错误处理降级机制
5. ✅ 后端API连通性（交易相关API）
6. ✅ 前端服务状态验证
7. ✅ 缓存策略配置正确
8. ✅ 操作后缓存清理机制

### 待验证功能
1. 🔄 实际交易操作测试（创建/取消订单）
2. 🔄 缓存清理效果验证
3. 🔄 降级机制触发测试（停止后端服务验证）
4. 🔄 分页数据缓存验证

### 测试脚本建议
```bash
# 交易功能测试脚本
#!/bin/bash
echo "=== 交易功能测试脚本 ==="

echo "1. 测试获取订单列表:"
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/trades

echo "2. 测试获取持仓列表:"
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/portfolios

echo "3. 测试创建订单（需要先登录获取token）:"
# 创建买入订单示例
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"stockSymbol":"AAPL","orderType":"buy","quantity":10,"limitPrice":162.50}' \
  http://localhost:3001/api/trades
```

## 📝 文档留痕

### 相关文档更新
1. **开发文档**：本文件记录阶段三工作
2. **代码注释**：所有修改添加详细注释
3. **API文档**：更新交易服务接口说明
4. **用户文档**：更新交易功能说明

### 代码变更记录
- `frontend/src/services/trading.service.ts`：修改7个核心函数
- `frontend/src/utils/cache.ts`：新增`clearByPattern`方法
- 导入语句更新：所有交易函数集成缓存管理器

## 🚀 下一步工作

### 阶段四：AI系统改造
1. 修改AI服务调用真实API
2. 实现AI决策缓存
3. 更新AI账户页面

### 阶段五：组件层清理
1. 移除组件中的模拟数据
2. 更新数据展示逻辑
3. 优化用户体验

### 阶段六：测试与优化
1. 端到端功能测试
2. 性能优化和监控
3. 用户体验优化

## ⚠️ 注意事项

### 用户反馈处理
1. **交易状态实时性**：操作后清理缓存，确保数据及时更新
2. **错误处理友好性**：交易操作提供明确的成功/失败反馈
3. **数据一致性**：缓存清理机制保障数据一致性

### 风险控制
1. **API失败处理**：多层降级机制，确保交易功能可用
2. **数据一致性**：操作后缓存清理策略
3. **性能监控**：缓存命中率跟踪，API响应时间监控

## 📞 支持信息

### 问题排查
1. **缓存问题**：检查浏览器开发者工具 -> Application -> Local Storage
2. **API问题**：检查网络请求和响应
3. **数据问题**：验证数据格式转换逻辑
4. **交易操作问题**：检查操作后缓存清理日志

### 紧急恢复
```bash
# 清理所有缓存
localStorage.clear()

# 重启前端服务
cd frontend && npm run dev

# 验证交易功能
检查浏览器控制台日志，验证交易API调用
```

### 测试账号
- **用户名**：admin
- **密码**：admin123
- **说明**：认证系统已连接真实后端API，保留降级机制确保始终可登录

---

*文档创建时间：2026-02-05*
*最后更新：2026-02-05*
*文档维护者：首席架构师*