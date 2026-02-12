> ⚠️ **历史文档警告**
> 本文档为历史版本V1，创建于2026-02-04，记录早期数据服务集成方案。
> 最新数据平台架构请参考 [CURRENT/DATA_PLATFORM.md](../CURRENT/DATA_PLATFORM.md)

---

# DataService 集成指南

## 概述

本文档描述了后端DataService与数据服务的集成方式，包括API端点配置、监控功能、降级策略和数据质量验证。

## 主要修改

### 1. API端点配置

DataService现在支持可配置的API前缀，以适配不同版本的数据服务API。

**环境变量配置：**
```bash
# 数据服务配置
DATA_SERVICE_URL=http://localhost:8001
DATA_SERVICE_API_PREFIX=/api/v1
DATA_SERVICE_API_KEY=stock-race-data-key
```

### 2. API端点映射

后端DataService调用的API端点已更新为与数据服务实际提供的端点匹配：

| 功能 | 原端点 | 新端点 | 说明 |
|------|--------|--------|------|
| 实时数据 | `/api/data/stocks/{code}/realtime` | `/api/v1/stocks/{code}/quote` | 获取股票实时报价 |
| 批量实时数据 | `/api/data/stocks/realtime/batch` | `/api/v1/stocks/batch/quotes` | 批量获取股票报价 |
| K线数据 | `/api/data/stocks/{code}/kline` | `/api/v1/stocks/{code}/history` | 获取历史K线数据 |
| 技术指标 | `/api/data/stocks/{code}/indicators` | `/api/v1/technical/{code}/indicators` | 获取技术指标 |
| 市场状态 | `/api/data/market/stats` | `/api/v1/market/status` | 获取市场状态 |
| 搜索股票 | `/api/data/stocks/search` | `/api/v1/search` | 搜索股票 |
| 健康检查 | `/api/data/health` | `/api/v1/health` | 服务健康检查 |

### 3. 数据格式转换

DataService现在包含数据格式转换逻辑，将数据服务返回的数据格式转换为后端期望的格式：

```javascript
// 示例：实时数据格式转换
const result = {
  success: true,
  stock_code: stockCode,
  price: response.data.price || response.data.current_price || 0,
  change: response.data.change || response.data.change_amount || 0,
  change_percent: response.data.change_percent || response.data.change_percentage || 0,
  // ... 其他字段
};
```

### 4. 监控和健康检查

DataService现在包含完整的监控和健康检查功能：

**监控功能：**
- 请求统计（总请求数、成功数、失败数、降级数）
- 数据质量评分
- 服务健康状态
- 自动健康检查（可配置间隔）

**环境变量配置：**
```bash
# 监控配置
DATA_SERVICE_HEALTH_CHECK_INTERVAL=30000      # 健康检查间隔（毫秒）
DATA_SERVICE_MAX_FALLBACK_DURATION=300000     # 最大降级持续时间（毫秒）
DATA_SERVICE_QUALITY_THRESHOLD=0.8            # 数据质量阈值（0-1）
```

### 5. 降级策略

DataService实现了智能降级策略，在以下情况下自动使用模拟数据：

1. **服务不健康**：数据服务健康检查失败
2. **数据质量低**：数据质量评分低于阈值（默认0.8）
3. **长时间无成功请求**：超过最大降级持续时间（默认5分钟）

**降级数据特征：**
- 包含 `is_fallback: true` 标志
- 包含 `fallback_reason` 说明降级原因
- 缓存时间较短（5秒）

### 6. 数据质量验证

DataService包含数据质量验证功能，检查以下方面：

1. **必要字段检查**：价格、时间戳、股票代码等
2. **价格合理性**：价格大于0且不超过10000
3. **时间戳新鲜度**：数据不超过1小时
4. **涨跌幅合理性**：涨跌幅不超过20%

### 7. 缓存策略

DataService使用多层缓存策略：

| 数据类型 | 缓存时间 | 说明 |
|----------|----------|------|
| 实时数据 | 10秒 | 高频数据，短期缓存 |
| 降级数据 | 5秒 | 降级数据，更短缓存 |
| K线数据 | 5分钟 | 历史数据，较长缓存 |
| 技术指标 | 2分钟 | 计算数据，中等缓存 |
| 股票信息 | 1小时 | 静态数据，长期缓存 |

## 使用方法

### 1. 基本使用

```javascript
import { dataService } from './services/DataService.js';

// 获取实时数据
const realtimeData = await dataService.getRealtimeData('000001.SZ');

// 批量获取数据
const batchData = await dataService.batchGetRealtimeData(['000001.SZ', '000002.SZ']);

// 获取K线数据
const klineData = await dataService.getKlineData('000001.SZ', '1d', 100);
```

### 2. 监控功能

```javascript
// 获取监控统计
const stats = dataService.getMonitoringStats();
console.log('成功率:', stats.successRate, '%');
console.log('服务状态:', stats.uptime);

// 测试连接
const connection = await dataService.testConnection();
console.log('连接状态:', connection.status);

// 重置监控统计
dataService.resetMonitoringStats();
```

### 3. 数据质量检查

```javascript
// 验证数据质量
const data = { stock_code: 'TEST', price: 15.5, timestamp: new Date().toISOString() };
const quality = dataService.validateDataQuality(data);

if (!quality.isValid) {
  console.warn('数据质量问题:', quality.reasons);
}
```

## 测试脚本

提供了一个测试脚本用于验证DataService功能：

```bash
cd backend
node test-data-service.js
```

## 故障排除

### 常见问题

1. **连接失败**
   - 检查 `DATA_SERVICE_URL` 配置
   - 确保数据服务正在运行
   - 检查网络连接和防火墙设置

2. **API端点不匹配**
   - 检查 `DATA_SERVICE_API_PREFIX` 配置
   - 验证数据服务API版本
   - 查看数据服务API文档

3. **数据质量警告**
   - 检查数据服务返回的数据格式
   - 验证数据字段完整性
   - 检查数据时间戳

4. **频繁降级**
   - 检查数据服务健康状态
   - 调整数据质量阈值
   - 检查网络延迟和超时设置

### 调试信息

DataService提供详细的调试信息：

```javascript
// 启用详细日志
console.log('监控统计:', dataService.getMonitoringStats());
console.log('健康检查:', await dataService.testConnection());
```

## 配置参考

完整的环境变量配置：

```bash
# 数据服务基础配置
DATA_SERVICE_URL=http://localhost:8001
DATA_SERVICE_API_PREFIX=/api/v1
DATA_SERVICE_API_KEY=stock-race-data-key

# 超时和重试配置
DATA_SERVICE_TIMEOUT=10000
DATA_SERVICE_MAX_RETRIES=3
DATA_SERVICE_RETRY_DELAY=1000

# 监控配置
DATA_SERVICE_HEALTH_CHECK_INTERVAL=30000
DATA_SERVICE_MAX_FALLBACK_DURATION=300000
DATA_SERVICE_QUALITY_THRESHOLD=0.8
```

## 版本历史

### v1.0.0 (2026-02-03)
- 初始版本：API端点适配和数据格式转换
- 添加监控和健康检查功能
- 实现智能降级策略
- 添加数据质量验证
- 提供测试脚本和文档
## 虚拟环境使用说明

### Python服务虚拟环境

数据服务（DataService）是一个Python FastAPI应用，强烈建议在虚拟环境中运行以确保依赖隔离和环境一致性。

#### 创建和激活虚拟环境

```bash
# 进入数据服务目录
cd data-service

# 创建虚拟环境（如果尚未创建）
python -m venv venv

# 激活虚拟环境
# Linux/macOS:
source venv/bin/activate

# Windows:
# venv\Scripts\activate

# 验证虚拟环境已激活
which python  # 应该显示venv/bin/python
pip --version # 应该使用虚拟环境的pip
```

#### 在虚拟环境中安装依赖

```bash
# 确保虚拟环境已激活
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 或安装开发依赖
pip install -r requirements-dev.txt
```

#### 在虚拟环境中启动服务

```bash
# 确保虚拟环境已激活
source venv/bin/activate

# 启动数据服务
uvicorn data_service.main:app --reload --host 0.0.0.0 --port 8001

# 或使用生产模式
uvicorn data_service.main:app --host 0.0.0.0 --port 8001 --workers 4
```

#### 虚拟环境管理命令

```bash
# 查看已安装的包
pip list

# 导出依赖列表
pip freeze > requirements.txt

# 安装特定版本
pip install package==version

# 升级所有包
pip install --upgrade -r requirements.txt

# 退出虚拟环境
deactivate
```

#### 虚拟环境优势

1. **依赖隔离**：避免与系统Python包冲突
2. **环境一致性**：确保开发、测试、生产环境一致
3. **版本控制**：requirements.txt精确记录依赖版本
4. **易于部署**：虚拟环境可以打包部署
5. **多项目支持**：不同项目可以使用不同Python版本和依赖

#### 常见问题

1. **虚拟环境未激活**：命令提示符没有显示`(venv)`前缀
   - 解决方案：运行`source venv/bin/activate`

2. **依赖安装失败**：网络问题或包版本冲突
   - 解决方案：使用国内镜像源`pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt`

3. **虚拟环境损坏**：Python版本不匹配或文件损坏
   - 解决方案：删除并重新创建`rm -rf venv && python -m venv venv`

4. **权限问题**：无法创建或写入虚拟环境
   - 解决方案：检查目录权限或使用`sudo`（不推荐）
