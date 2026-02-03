# Stock Race Data Service

股票数据采集和处理服务，为AI股票竞赛平台提供实时和历史股票数据。

## 功能特性

- **多数据源采集**：支持新浪财经、腾讯财经、东方财富等多个数据源
- **实时行情数据**：5秒级实时行情更新
- **历史数据存储**：日K、周K、月K历史数据存储
- **数据清洗处理**：数据验证、清洗、转换和增强
- **技术指标计算**：MA、MACD、RSI、布林带等技术指标
- **实时数据推送**：WebSocket实时数据推送
- **数据质量监控**：数据完整性、准确性、及时性监控
- **RESTful API**：完整的股票数据API接口

## 技术架构

- **框架**：FastAPI (异步支持)
- **数据库**：TimescaleDB (时序数据) + PostgreSQL (元数据)
- **缓存**：Redis
- **数据处理**：pandas, numpy
- **部署**：Docker, Uvicorn

## 快速开始

### 环境要求

- Python 3.11+
- PostgreSQL 14+ with TimescaleDB extension
- Redis 6+
- Docker (可选)

### 安装依赖

```bash
pip install -r requirements.txt
```

### 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Server
HOST=0.0.0.0
PORT=8001
DEBUG=true

# Database
TSDB_HOST=localhost
TSDB_PORT=5433
TSDB_NAME=stock_race_tsdb
TSDB_USER=timescale
TSDB_PASSWORD=password

DB_HOST=localhost
DB_PORT=5432
DB_NAME=stock_race
DB_USER=postgres
DB_PASSWORD=postgres

# Redis
REDIS_URL=redis://localhost:6379

# Data Collection
COLLECTION_INTERVAL=60
BATCH_SIZE=100
MAX_RETRIES=3

# Market Hours (China A-share)
MARKET_OPEN_HOUR=9
MARKET_OPEN_MINUTE=30
MARKET_CLOSE_HOUR=15
MARKET_CLOSE_MINUTE=0

# Default Stocks
DEFAULT_STOCK_SYMBOLS=000001.SZ,000002.SZ,000858.SZ,600036.SH,600519.SH
```

### 启动服务

```bash
# 开发模式
uvicorn data_service.main:app --reload --host 0.0.0.0 --port 8001

# 生产模式
uvicorn data_service.main:app --host 0.0.0.0 --port 8001 --workers 4
```

### Docker 运行

```bash
# 构建镜像
docker build -t stock-race-data-service .

# 运行容器
docker run -p 8001:8001 --env-file .env stock-race-data-service
```

## API 文档

启动服务后访问：http://localhost:8001/docs

### 主要API端点

#### 健康检查
```
GET /health
```

#### 获取股票列表
```
GET /api/v1/stocks
```

#### 获取实时行情
```
GET /api/v1/stocks/{symbol}/quote
```

#### 获取历史数据
```
GET /api/v1/stocks/{symbol}/history
参数：
- start_date: 开始日期
- end_date: 结束日期
- interval: 数据间隔 (1m, 5m, 1d, 1w, 1M)
```

#### 批量获取行情
```
GET /api/v1/stocks/batch/quotes
参数：
- symbols: 股票代码列表
```

#### 获取市场状态
```
GET /api/v1/market/status
```

#### 获取技术指标
```
GET /api/v1/technical/{symbol}/indicators
参数：
- indicators: 指标列表 (ma, macd, rsi, bollinger)
- period: 计算周期
```

#### 搜索股票
```
GET /api/v1/search
参数：
- query: 搜索关键词
- limit: 返回数量
```

#### 实时数据推送 (WebSocket)
```
WS /api/v1/ws/realtime
```

## 数据源

### 新浪财经 (Sina Finance)
- 实时行情：`http://hq.sinajs.cn/list=sz000001`
- 历史数据：`https://quotes.sina.cn/cn/api/json_v2.php`

### 腾讯财经 (Tencent Finance)
- 实时行情：`http://qt.gtimg.cn/q=sz000001`
- 历史数据：`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get`

### 东方财富 (East Money)
- 实时行情：`https://push2.eastmoney.com/api/qt/stock/get`
- 历史数据：`https://push2his.eastmoney.com/api/qt/stock/kline/get`

## 数据模型

### StockSymbol (股票信息)
```python
{
    "symbol": "000001.SZ",
    "name": "平安银行",
    "exchange": "SZ",
    "sector": "financial",
    "market_cap": 10000000000.0,
    "pe_ratio": 8.5,
    "pb_ratio": 0.9,
    "dividend_yield": 3.2,
    "listing_date": "1991-04-03",
    "is_active": true
}
```

### StockQuote (实时行情)
```python
{
    "symbol": "000001.SZ",
    "price": 16.85,
    "open": 16.80,
    "high": 16.90,
    "low": 16.75,
    "prev_close": 16.78,
    "change": 0.07,
    "change_percent": 0.42,
    "volume": 1000000,
    "amount": 16850000.0,
    "bid_price": 16.84,
    "ask_price": 16.86,
    "timestamp": "2024-01-01T09:30:00"
}
```

### StockData (历史数据)
```python
{
    "symbol": "000001.SZ",
    "timestamp": "2024-01-01T00:00:00",
    "open": 16.80,
    "high": 16.90,
    "low": 16.75,
    "close": 16.85,
    "volume": 1000000,
    "amount": 16850000.0
}
```

## 数据采集策略

### 采集频率
- 实时行情：5秒/次 (交易时间)
- 历史数据：每日收盘后更新
- 基本面数据：每周更新

### 容错机制
- 多数据源备份
- 自动故障切换
- 指数退避重试
- 数据验证和清洗

### 缓存策略
- L1: 内存缓存 (10秒TTL)
- L2: Redis缓存 (60秒TTL)
- L3: 数据库存储 (持久化)

## 监控指标

### 数据质量
- 数据完整性
- 数据准确性
- 数据及时性
- 数据一致性

### 系统性能
- API响应时间
- 数据采集延迟
- 缓存命中率
- 数据库查询性能

### 业务指标
- 数据采集成功率
- 数据覆盖率
- 用户访问量
- 系统可用性

## 测试

### 运行测试
```bash
# 运行所有测试
pytest tests/

# 运行特定测试
pytest tests/test_data_service.py -v

# 生成测试覆盖率报告
pytest --cov=src tests/
```

### 测试类型
- 单元测试：数据处理器、数据源适配器
- 集成测试：API端点、数据库操作
- 性能测试：数据采集性能、API响应时间

## 部署

### 生产环境建议
1. **数据库**：使用独立的TimescaleDB和PostgreSQL实例
2. **缓存**：使用Redis集群
3. **负载均衡**：使用Nginx或HAProxy
4. **监控**：集成Prometheus和Grafana
5. **日志**：使用ELK Stack或类似方案

### Kubernetes部署
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: data-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: data-service
  template:
    metadata:
      labels:
        app: data-service
    spec:
      containers:
      - name: data-service
        image: stock-race-data-service:latest
        ports:
        - containerPort: 8001
        envFrom:
        - configMapRef:
            name: data-service-config
---
apiVersion: v1
kind: Service
metadata:
  name: data-service
spec:
  selector:
    app: data-service
  ports:
  - port: 8001
    targetPort: 8001
```

## 开发指南

### 代码结构
```
data-service/
├── src/
│   └── data_service/
│       ├── api/           # API路由
│       ├── collectors/    # 数据源适配器
│       ├── core/         # 核心配置
│       ├── models/       # 数据模型
│       ├── processors/   # 数据处理器
│       ├── services/     # 业务服务
│       ├── storage/      # 数据存储
│       └── utils/        # 工具函数
├── tests/               # 测试代码
├── requirements.txt     # Python依赖
├── Dockerfile          # Docker配置
└── README.md           # 本文档
```

### 添加新数据源
1. 在 `collectors/` 目录创建新数据源类
2. 继承 `DataSource` 基类
3. 实现必要的数据获取方法
4. 在 `DataService` 中注册新数据源
5. 添加相应的测试

### 添加新API端点
1. 在 `api/routes.py` 中添加新路由
2. 在 `services/data_service.py` 中实现业务逻辑
3. 更新API文档
4. 添加相应的测试

## 故障排除

### 常见问题

#### 数据采集失败
- 检查网络连接
- 验证数据源API是否可用
- 检查API密钥和访问限制
- 查看错误日志

#### 数据库连接问题
- 检查数据库服务状态
- 验证连接参数
- 检查防火墙设置
- 查看数据库日志

#### 缓存问题
- 检查Redis服务状态
- 验证缓存配置
- 检查内存使用情况
- 查看Redis日志

### 日志查看
```bash
# 查看应用日志
tail -f logs/data_service.log

# 查看错误日志
grep ERROR logs/data_service.log

# 查看性能日志
grep "executed in" logs/data_service.log
```

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

### 代码规范
- 遵循PEP 8规范
- 使用类型注解
- 编写单元测试
- 更新文档

## 许可证

本项目采用MIT许可证。详见 [LICENSE](LICENSE) 文件。

## 联系方式

如有问题或建议，请通过以下方式联系：

- 项目地址：https://github.com/your-org/stock-race
- 问题反馈：https://github.com/your-org/stock-race/issues
- 文档更新：https://github.com/your-org/stock-race/docs