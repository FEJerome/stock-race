# 后端API问题汇总报告

**报告日期**: 2026-02-09
**测试范围**: 微信小程序全功能端到端测试
**测试环境**: http://localhost:3001/api
**文档用途**: 供后端负责智能体排查修复

---

## 1. 测试概览

| 测试模块 | 测试总数 | 通过 | 失败 | 成功率 |
|----------|----------|------|------|--------|
| 认证与仪表盘 | 15 | 15 | 0 | 100% |
| AI基金经理 | 12 | 9 | 3 | 75% |
| 市场数据与持仓 | 20 | 18 | 2 | 90% |
| 交易记录与竞赛排行 | 12 | 3 | 9 | 25% |
| **总计** | **59** | **45** | **14** | **76.3%** |

---

## 2. 问题汇总（按优先级排序）

### 🔴 P0 - 严重问题（需立即修复）

#### 2.1 路由顺序问题（2处）

**问题描述**: 具体路由被参数路由拦截，导致API无法正确响应

**受影响端点**:
1. `GET /api/trades/hot` - 被 `/:tradeId` 拦截
2. `GET /api/stocks/rankings` - 被 `/:stockCode` 拦截

**错误表现**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_001",
    "message": "交易ID无效"
  },
  "message": "交易ID必须为有效的正整数"
}
```

**修复方案**:
```javascript
// backend/src/routes/trades.js
// 将具体路由放在参数路由之前
router.get('/hot', authenticate, tradeController.getHotTradingStocks);
router.get('/statistics', authenticate, tradeController.getTradeStats);
router.get('/:tradeId', authenticate, tradeController.getTradeDetail);  // 参数路由放最后

// backend/src/routes/stocks.js
router.get('/search', optionalAuthenticate, stockController.searchStocks);
router.get('/market/stats', optionalAuthenticate, stockController.getMarketStats);
router.get('/rankings', optionalAuthenticate, stockController.getStockRankings);
router.get('/:stockCode', optionalAuthenticate, stockController.getStockDetail);  // 参数路由放最后
```

---

#### 2.2 MarketController 方法缺失（3处）

**问题描述**: 路由配置了但控制器缺少对应方法实现

**缺失方法**:
1. `MarketController.getAccountRanking` - 获取账户排名
2. `MarketController.getCompetitions` - 获取竞赛列表
3. `MarketController.getCompetitionDetail` - 获取竞赛详情

**错误表现**:
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "marketController.getAccountRanking is not a function"
  }
}
```

**修复方案**: 在 `backend/src/controllers/MarketController.js` 中添加以下方法：

```javascript
/**
 * 获取账户排名
 */
async getAccountRanking(req, res) {
  try {
    const { accountId } = req.params;
    const userId = req.user?.id;

    // 验证权限
    const account = await aiAccountRepository.findOne({
      id: parseInt(accountId),
      userId
    });

    if (!account) {
      return res.status(403).json({
        success: false,
        error: { code: 'AUTH_003', message: '权限不足' },
        message: '无权查看该账户排名'
      });
    }

    // 获取账户排名信息
    const ranking = await rankingRepository.getAccountRankingHistory(
      parseInt(accountId),
      { limit: 1 }
    );

    res.json({
      success: true,
      data: { ranking: ranking[0] || null },
      message: '获取账户排名成功'
    });
  } catch (error) {
    console.error('获取账户排名错误:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
      message: '获取账户排名失败'
    });
  }
}

/**
 * 获取竞赛列表
 */
async getCompetitions(req, res) {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    // 返回模拟的竞赛数据
    const competitions = [
      {
        id: 'monthly-challenge',
        name: '月度挑战赛',
        description: '每月一度的AI交易竞赛',
        status: 'ongoing',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        prizePool: 50000,
        participants: 150
      }
    ];

    res.json({
      success: true,
      data: {
        competitions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: competitions.length
        }
      },
      message: '获取竞赛列表成功'
    });
  } catch (error) {
    console.error('获取竞赛列表错误:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
      message: '获取竞赛列表失败'
    });
  }
}

/**
 * 获取竞赛详情
 */
async getCompetitionDetail(req, res) {
  try {
    const { competitionId } = req.params;

    // 使用现有的 getCompetitionDetails 方法
    const competition = await this.getCompetitionDetails(competitionId);

    res.json({
      success: true,
      data: { competition },
      message: '获取竞赛详情成功'
    });
  } catch (error) {
    console.error('获取竞赛详情错误:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
      message: '获取竞赛详情失败'
    });
  }
}
```

---

### 🟡 P1 - 高优先级问题

#### 2.3 交易记录查询 500 错误

**问题端点**: `GET /api/trades`

**错误表现**:
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "服务器内部错误"
  },
  "message": "获取交易记录失败，请稍后重试"
}
```

**可能原因**:
1. `tradeRepository.paginate` 方法实现问题
2. Prisma查询参数错误
3. 关联查询（include）中的字段映射问题

**排查步骤**:
1. 检查 `backend/src/models/TradeRepository.js` 的 `paginate` 方法
2. 检查Prisma schema中Trade模型的关联定义
3. 查看后端日志获取详细错误堆栈

---

#### 2.4 排行榜查询 500 错误

**问题端点**: `GET /api/market/rankings`

**错误表现**: 同2.3，服务器内部错误

**可能原因**:
1. `ranking` 表中没有数据
2. `rankingRepository.getRankings` 方法执行失败
3. Prisma查询参数错误（periodType/date不匹配）

**排查步骤**:
1. 检查数据库中是否有ranking数据
2. 检查 `backend/src/models/RankingRepository.js` 的查询逻辑
3. 确认periodType和date字段的使用是否正确

---

#### 2.5 AI决策历史查询 500 错误

**问题端点**: `GET /api/ai-accounts/{accountId}/decisions`

**错误表现**: 服务器内部错误

**可能原因**:
1. `DecisionLogRepository` 查询逻辑问题
2. 数据库表结构与Prisma schema不匹配
3. 关联查询错误

**排查步骤**:
1. 检查 `DecisionLogRepository` 的查询方法
2. 确认 `decision_logs` 表结构正确
3. 查看后端日志获取详细错误信息

---

#### 2.6 AI服务健康检查 500 错误

**问题端点**: `GET /api/ai-accounts/health`

**错误表现**: 服务器内部错误

**可能原因**:
1. `AIController.checkAIServiceHealth` 方法问题
2. AI服务连接状态检查逻辑错误

**排查步骤**:
1. 检查 `AIController.checkAIServiceHealth` 方法实现
2. 检查AI服务连接配置

---

### 🟢 P2 - 中优先级问题

#### 2.7 更新AI账户字段限制

**问题端点**: `PUT /api/ai-accounts/{accountId}`

**问题描述**: API不允许更新 `riskLevel` 和 `tradingFrequency` 字段

**错误表现**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "无效的更新字段"
  },
  "message": "不允许更新以下字段: riskLevel, tradingFrequency"
}
```

**修复建议**:
1. 检查 `AIController.updateAIAccount` 方法的字段验证逻辑
2. 确认业务逻辑是否允许更新这些字段
3. 更新API文档说明可更新字段

---

#### 2.8 股票搜索中文编码问题

**问题端点**: `GET /api/stocks/search?q=茅台`

**问题描述**: 使用中文字符作为搜索关键词时返回400错误

**修复建议**:
1. 检查请求参数的编码处理逻辑
2. 确保Express应用正确配置UTF-8编码
3. 临时解决方案：使用URL编码 `%E8%8C%85%E5%8F%B0` 代替中文字符

---

#### 2.9 全局决策记录端点缺失

**问题端点**: `GET /api/ai/decisions`

**问题描述**: 此端点未在路由中定义

**当前状态**: 决策记录只能通过特定账户获取（`/api/ai-accounts/{accountId}/decisions`）

**修复建议**:
1. 在 `aiAccounts.js` 路由中添加全局决策记录查询端点
2. 或更新文档说明决策记录必须通过账户ID获取

---

### ⚪ P3 - 低优先级问题

#### 2.10 更新持仓市值API参数问题

**问题端点**: `POST /api/portfolios/update-market-values`

**问题描述**: 需要提供有效的accountId参数

**修复建议**:
1. 添加参数验证，返回更友好的错误信息
2. 正确的调用方式：
```bash
curl -X POST "http://localhost:3001/api/portfolios/update-market-values" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"accountId": 3}'
```

---

## 3. 已修复问题（测试期间已解决）

### 3.1 代码层面修复

| 问题 | 文件 | 修复内容 |
|------|------|----------|
| Repository modelName大小写不匹配 | 所有Repository文件 | 'user' -> 'User', 'stock' -> 'Stock' 等 |
| BaseRepository findOne参数处理 | BaseRepository.js | 只在options.include存在时才添加到查询 |
| PortfolioController语法错误 | PortfolioController.js:969 | 删除多余的 `}` |
| Auth路由缺少中间件 | auth.js | 为需要认证的端点添加authenticate中间件 |
| AuthService密码验证 | AuthService.js | 将hash改为compare |
| MarketController缺失方法 | MarketController.js | 添加getIndices等方法 |
| PortfolioController缺失方法 | PortfolioController.js | 添加getRiskAnalysis等方法 |
| 路由顺序问题 | stocks.js, portfolios.js | 将特定路由移到参数路由之前 |

### 3.2 数据库修复

```sql
-- AIAccount表缺少字段
ALTER TABLE ai_accounts
ADD COLUMN IF NOT EXISTS preference_config JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS prompt_template_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS token_budget INTEGER DEFAULT 1500,
ADD COLUMN IF NOT EXISTS last_decision_at TIMESTAMPTZ;

-- DecisionLog表缺少字段
ALTER TABLE decision_logs
ADD COLUMN IF NOT EXISTS prompt_template VARCHAR(100),
ADD COLUMN IF NOT EXISTS prompt_variables JSONB,
ADD COLUMN IF NOT EXISTS full_prompt TEXT,
ADD COLUMN IF NOT EXISTS token_count INTEGER,
ADD COLUMN IF NOT EXISTS model_context JSONB,
ADD COLUMN IF NOT EXISTS user_preferences JSONB;
```

---

## 4. 修复优先级建议

### 第一优先级（P0）
1. 修复路由顺序问题（2处）
2. 添加缺失的MarketController方法（3个）

### 第二优先级（P1）
3. 修复交易记录查询500错误
4. 修复排行榜查询500错误
5. 修复AI决策历史查询500错误
6. 修复AI服务健康检查500错误

### 第三优先级（P2）
7. 明确更新AI账户API的可更新字段
8. 修复股票搜索中文编码问题
9. 添加全局决策记录查询端点

### 第四优先级（P3）
10. 优化更新持仓市值API的参数验证

---

## 5. 测试验证清单

修复完成后，请验证以下API：

```bash
# 1. 路由顺序修复验证
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/trades/hot
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/stocks/rankings

# 2. MarketController方法修复验证
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/market/rankings/1
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/market/competitions
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/market/competitions/1

# 3. 交易记录查询修复验证
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/trades?page=1&limit=20"

# 4. 排行榜查询修复验证
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/market/rankings?type=total"

# 5. AI决策历史查询修复验证
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/ai-accounts/3/decisions?page=1&limit=10"

# 6. AI服务健康检查修复验证
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/ai-accounts/health
```

---

## 6. 相关文档

- [认证与仪表盘测试报告](E2E_TEST_RESULTS_AUTH_DASHBOARD.md)
- [AI基金经理模块测试报告](AI_MANAGER_MODULE_API_TEST_REPORT.md)
- [市场数据与持仓模块测试报告](MARKET_PORTFOLIO_API_TEST_REPORT.md)
- [交易记录与竞赛排行模块测试报告](TRADE_COMPETITION_API_TEST_REPORT.md)

---

**报告生成时间**: 2026-02-09
**报告版本**: v1.0
**维护者**: 首席架构师
