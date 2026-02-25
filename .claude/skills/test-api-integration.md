---
name: test-api-integration
description: 自动化测试小程序与后端 API 的集成
---

你是一名 API 集成测试专家。使用 MCP 自动化测试小程序与后端服务的 API 集成，验证数据流转是否正确。

## 测试范围

1. **页面加载时的 API 调用**
2. **用户交互触发的 API 请求**
3. **WebSocket 实时数据推送**
4. **错误处理和降级策略**

## 使用流程

1. **启动网络监控**
   ```
   connect_devtools({
     projectPath: "/path/to/miniprogram",
     strategy: "auto",
     autoMonitorNetwork: true
   })
   ```

2. **执行操作触发 API 调用**
   ```
   navigate_to({ url: "/pages/ranking" })
   ```

3. **获取网络请求**
   ```
   list_network_requests({
     urlPattern: "/api/ranking",
     successOnly: true
   })
   ```

4. **验证请求详情**
   ```
   get_network_request({ reqid: "xxx" })
   ```

5. **验证响应数据**
   ```
   assert_response({
     reqid: "xxx",
     status: 200,
     hasField: "data.list"
   })
   ```

## 支持的断言

| 断言 | 参数 | 说明 |
|------|------|------|
| `request_made` | `urlPattern`, `method` | 验证请求已发送 |
| `response_status` | `reqid`, `status` | 验证响应状态码 |
| `response_has_field` | `reqid`, `field` | 验证响应包含字段 |
| `response_matches` | `reqid`, `schema` | 验证响应符合 schema |
| `request_count` | `urlPattern`, `min`, `max` | 验证请求次数 |

## 参数说明

- `--page`: 测试页面路径
- `--api`: API 端点 pattern
- `--method`: HTTP 方法 (GET/POST/PUT/DELETE)
- `--expect-status`: 期望的响应状态码
- `--expect-fields`: 期望响应中包含的字段（逗号分隔）

## 示例

```bash
# 测试排行榜页面 API 调用
/test-api-integration --page=/pages/ranking --api=/api/ranking --method=GET

# 测试 AI 经理详情页数据加载
/test-api-integration --page=/pages/ai-manager-detail --api=/api/ai-managers/[0-9]+ --expect-fields=id,name,profit

# 测试 WebSocket 行情推送
/test-api-integration --page=/pages/market --websocket=/ws/market --timeout=30000
```

## 集成测试场景

### 场景 1：页面初始加载
```
1. 进入页面
2. 等待 API 请求完成
3. 验证请求参数正确
4. 验证数据渲染正确
```

### 场景 2：下拉刷新
```
1. 触发下拉刷新
2. 验证新请求发送
3. 验证数据更新
4. 验证 UI 刷新
```

### 场景 3：分页加载
```
1. 滚动到底部
2. 验证分页请求
3. 验证数据追加
```
