# 数据源适配器实现 - Code Review & 测试报告

**评审日期**: 2026-03-12
**评审范围**: B-1.2.5d/f 数据源适配器 + B-1.2.7 定时采集
**代码作者**: 开发团队
**评审人**: Claude Code

---

## 1. 测试执行结果

### 1.1 集成测试
```bash
cd local/backend && python -m pytest tests/integration/test_new_datasources.py -v
```

**结果**: 17 passed, 4 skipped, 9 warnings in 34.67s

| 测试类 | 状态 | 说明 |
|--------|------|------|
| TestAkShareDataSource | 5 passed | 全部通过 |
| TestBaostockDataSource | 6 passed | 全部通过 |
| TestTushareDataSource | 1 passed, 4 skipped | TUSHARE_TOKEN 未设置 |
| TestDataSourceRouterWithNewSources | 2 passed | 全部通过 |
| test_circuit_breaker | passed | 熔断器功能正常 |
| test_symbol_normalization | passed | 代码格式转换正确 |

### 1.2 熔断器单元测试
- CLOSED → OPEN 状态转换: ✓
- HALF_OPEN 恢复机制: ✓
- 超时自动恢复: ✓
- 成功记录重置: ✓

---

## 2. 代码质量评估

### 2.1 整体评价: 良好 (B+)

**优点**:
1. 遵循了项目架构，统一继承 `DataSource` 基类
2. 实现了熔断降级机制，提高系统稳定性
3. 使用 ThreadPoolExecutor 正确处理同步库
4. 测试覆盖率高，包含边界情况测试
5. 股票代码格式转换逻辑清晰

**需要改进**:
1. `datetime.utcnow()` 已弃用，需迁移到 `datetime.now(UTC)`
2. 过多的泛型 `Exception` 捕获
3. 部分性能优化空间
4. 非交易时间调度可优化

---

## 3. 详细问题列表

### 3.1 🔴 严重问题 (需立即修复)

**无严重问题**

### 3.2 🟡 中等问题 (建议修复)

#### 3.2.1 DeprecationWarning: datetime.utcnow()
**位置**: 多个文件

**问题描述**:
Python 3.12+ 中 `datetime.utcnow()` 已被弃用，会在未来版本移除。

**影响文件**:
- `akshare_source.py:94,137,169,176,217,244,329`
- `baostock_source.py:137,169`
- `base.py:179`
- `collector.py:58,82`
- `cache_service.py:73,86,104`

**修复建议**:
```python
# 旧代码
from datetime import datetime
timestamp = datetime.utcnow()

# 新代码
from datetime import datetime, timezone
timestamp = datetime.now(timezone.utc)
```

#### 3.2.2 过多的泛型 Exception 捕获
**位置**: 三个数据源文件

**问题描述**:
代码中大量使用 `except Exception as e`，可能隐藏真正的错误。

**修复建议**:
```python
# 建议至少区分网络异常和数据异常
from httpx import NetworkError, TimeoutException

try:
    data = await fetch_data()
except (NetworkError, TimeoutException) as e:
    # 可恢复的网络错误
    logger.warning(f"Network error: {e}")
    return None
except ValueError as e:
    # 数据格式错误
    logger.error(f"Data parsing error: {e}")
    return None
except Exception as e:
    # 未知错误，记录详细堆栈
    logger.exception(f"Unexpected error: {e}")
    return None
```

#### 3.2.3 AkShare get_quote 效率问题
**位置**: `akshare_source.py:144-177`

**问题描述**:
`get_quote` 方法获取整个股票列表来查找单只股票，效率极低。

**当前实现**:
```python
async def get_quote(self, symbol: str) -> Optional[Quote]:
    stocks = await self._get_stock_list()  # 获取5000+股票
    for stock in stocks:  # 线性查找
        if stock["symbol"] == symbol_upper:
            return Quote(...)
```

**修复建议**:
使用字典缓存加速查找，或直接使用 AkShare 的单股接口:
```python
async def get_quote(self, symbol: str) -> Optional[Quote]:
    # 方法1: 使用字典缓存
    if not self._stock_dict_cache:
        stocks = await self._get_stock_list()
        self._stock_dict_cache = {s["symbol"]: s for s in stocks}
    stock = self._stock_dict_cache.get(symbol.upper())
    if stock:
        return Quote(...)
```

#### 3.2.4 Baostock 顺序查询性能问题
**位置**: `baostock_source.py:241-251`

**问题描述**:
`get_quotes` 方法顺序查询每只股票，性能差。

**修复建议**:
```python
async def get_quotes(self, symbols: List[str]) -> Dict[str, Optional[Quote]]:
    # 使用 asyncio.gather 并发查询
    tasks = [self.get_quote(symbol) for symbol in symbols]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return {
        symbol: result if not isinstance(result, Exception) else None
        for symbol, result in zip(symbols, results)
    }
```

### 3.3 🟢 轻微问题 (可选优化)

#### 3.3.1 代码重复: pd_notna
**位置**: `akshare_source.py:338-346`, `tushare_source.py:494-502`

**问题描述**:
`pd_notna` 辅助函数在两个文件中重复定义。

**修复建议**:
在 `base.py` 或新建 `utils.py` 中定义一次，统一导入。

#### 3.3.2 非交易时间调度
**位置**: `collector.py:408-418`

**问题描述**:
AkShare 采集任务每分钟都执行，非交易时间浪费资源。

**修复建议**:
```python
# 添加交易时间检查
from datetime import datetime

def is_trading_time() -> bool:
    """检查是否为A股交易时间"""
    now = datetime.now()
    if now.weekday() >= 5:  # 周末
        return False
    time_str = now.strftime("%H:%M")
    # 9:30-11:30, 13:00-15:00
    return ("09:30" <= time_str <= "11:30") or ("13:00" <= time_str <= "15:00")

async def _collect_akshare(self):
    if not is_trading_time():
        return  # 跳过非交易时间
    # ... 原有逻辑
```

#### 3.3.3 Tushare 并发查询优化
**位置**: `tushare_source.py:254-341`

**问题描述**:
`get_financial_data` 顺序执行4个 API 调用。

**修复建议**:
```python
async def get_financial_data(self, symbol: str) -> Optional[Dict[str, Any]]:
    # 并发查询多个财务数据
    ts_code = self._to_ts_code(symbol)

    income_task = self._run_in_thread(self._pro.income, ts_code=ts_code, limit=1)
    balance_task = self._run_in_thread(self._pro.balancesheet, ts_code=ts_code, limit=1)
    cashflow_task = self._run_in_thread(self._pro.cashflow, ts_code=ts_code, limit=1)
    fina_task = self._run_in_thread(self._pro.fina_indicator, ts_code=ts_code, limit=1)

    income_df, balance_df, cashflow_df, fina_df = await asyncio.gather(
        income_task, balance_task, cashflow_task, fina_task,
        return_exceptions=True
    )
    # ... 处理结果
```

---

## 4. 架构设计评价

### 4.1 熔断器实现

**设计**: CLOSED → OPEN → HALF_OPEN 三状态

**优点**:
- 失败阈值、恢复超时、半开最大调用数可配置
- 与采集任务集成良好

**潜在改进**:
```python
# 当前 HALF_OPEN 实现有并发问题
# 如果多个请求同时进入 HALF_OPEN 状态，可能超出 half_open_max_calls

# 建议添加锁保护
import asyncio

@dataclass
class CircuitBreaker:
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def can_execute(self) -> bool:
        async with self._lock:
            # ... 原有逻辑
```

### 4.2 定时调度

**设计**: APScheduler + 不同频率的采集任务

**优点**:
- 配置清晰，易于理解
- 支持手动触发

**建议**:
- 考虑添加 misfire_grace_time 防止任务堆积
- 考虑使用 max_instances 防止同一任务并发执行

```python
self._scheduler.add_job(
    self._collect_akshare,
    IntervalTrigger(minutes=1),
    id="akshare_collect",
    name="AkShare 1-minute collection",
    replace_existing=True,
    misfire_grace_time=30,  # 允许30秒的延迟执行
    max_instances=1  # 禁止并发执行
)
```

---

## 5. 依赖检查

### 5.1 requirements.txt 新增依赖

```
akshare==1.15.46
baostock==0.8.9
tushare==1.4.14
```

**评估**:
- ✅ 版本号已固定
- ✅ 与现有依赖无冲突
- ⚠️ akshare 依赖较重，包含大量数据分析库

---

## 6. 测试建议

### 6.1 缺失的测试

1. **熔断器并发测试**: 验证多线程/协程环境下状态转换正确性
2. **错误恢复测试**: 模拟数据源恢复后系统是否正常
3. **性能基准测试**: 测量各数据源响应时间
4. **资源泄漏测试**: 验证 ThreadPoolExecutor 正确关闭

### 6.2 测试覆盖率

当前测试主要覆盖:
- ✅ 基本功能
- ✅ 熔断器状态机
- ✅ 代码格式转换

建议补充:
- ⬜ 异常处理路径
- ⬜ 并发场景
- ⬜ 长时间运行稳定性

---

## 7. 修复优先级建议

| 优先级 | 问题 | 预估工作量 |
|--------|------|----------|
| P1 | datetime.utcnow() 弃用警告 | 30分钟 |
| P2 | AkShare get_quote 效率优化 | 1小时 |
| P2 | Baostock 并发查询优化 | 30分钟 |
| P3 | 提取 pd_notna 到公共模块 | 15分钟 |
| P3 | 非交易时间调度优化 | 1小时 |
| P4 | Exception 捕获细化 | 2小时 |

---

## 8. 总结

**总体评价**: 实现质量良好，架构设计合理，测试覆盖充分。

**主要亮点**:
1. 熔断降级机制增强了系统稳定性
2. 多数据源设计提供了良好的扩展性
3. 测试用例设计合理，覆盖了主要功能路径

**需要关注**:
1. Python 3.12+ 兼容性（datetime.utcnow）
2. 部分性能优化空间
3. 生产环境建议使用结构化日志替代 print

**建议下一步**:
1. 修复 P1/P2 优先级问题
2. 补充并发场景测试
3. 在生产环境部署前进行压力测试

---

**报告生成时间**: 2026-03-12
**评审完成**: ✅
