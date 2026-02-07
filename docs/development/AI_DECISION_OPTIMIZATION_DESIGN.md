# AI决策功能优化设计文档

**制定日期**：2026-02-07
**版本**：1.0.0
**维护者**：首席架构师
**关联任务**：#5 完善AI决策功能

## 📋 概述

本设计文档旨在优化AI决策功能，解决以下两个核心问题：
1. **决策偏好与token效率平衡**：确保用户创建的AI账户决策偏好能在AI决策时可靠生效，同时避免过多的token浪费
2. **决策透明度提升**：用户查看AI决策细节时，能够看到系统生成并发送给对应AI大模型的完整提示词

## 🎯 设计目标

### 1. 功能目标
- ✅ 用户AI账户配置（风险等级、交易频率、策略偏好）可靠影响AI决策
- ✅ 优化提示词长度，在决策匹配度和成本间取得平衡
- ✅ 完整记录并展示发送给AI大模型的提示词内容
- ✅ 提供决策过程的可追溯性和透明度

### 2. 性能目标
- 📊 **Token效率**：提示词长度控制在合理范围（目标：500-1500 tokens）
- ⚡ **响应时间**：决策生成时间不超过30秒
- 💾 **存储效率**：决策日志包含完整提示词但不冗余存储

## 🔧 技术方案

### 1. 决策偏好集成方案

#### 1.1 模板化提示词系统
```
基础模板 + 用户偏好变量 = 个性化提示词
```

**基础模板结构**：
```python
"""
请分析以下投资情况并提供交易建议：

账户信息：
{account_info}

当前持仓：
{positions}

股票数据：
{stock_data}

交易约束：
{constraints}

市场环境：
{market_conditions}

账户偏好：
{user_preferences}

当前时间：{current_time}

请基于以上信息，给出专业的交易决策建议...
"""
```

#### 1.2 用户偏好变量定义
```javascript
// AI账户配置结构
const userPreferences = {
  // 风险偏好
  riskLevel: 'medium', // low, medium, high
  riskTolerance: 'balanced', // conservative, balanced, aggressive

  // 交易风格
  tradingStyle: 'swing', // day, swing, position
  holdingPeriod: 'medium_term', // short_term, medium_term, long_term

  // 策略偏好
  preferredStrategies: ['momentum', 'value'], // momentum, value, growth, dividend
  avoidStrategies: ['speculative'], // speculative, high_frequency

  // 行业偏好
  preferredIndustries: ['technology', 'healthcare'],
  avoidIndustries: ['tobacco', 'gambling'],

  // 技术指标权重
  indicatorWeights: {
    technical: 0.4,
    fundamental: 0.4,
    sentiment: 0.2
  }
};
```

#### 1.3 Token优化策略
- **变量压缩**：使用缩写和结构化表示
- **选择性包含**：根据决策类型包含相关配置
- **模板缓存**：缓存常用模板组合
- **动态调整**：根据模型token限制动态调整详细程度

### 2. 完整提示词存储与展示方案

#### 2.1 决策日志增强
```javascript
// 增强的DecisionLog模型字段
model DecisionLog {
  // ... 现有字段

  // 新增/增强字段
  promptTemplate   String?      // 使用的模板标识
  promptVariables  Json?        // 模板变量值
  fullPrompt       String?      // 完整的提示词内容（可选，可存储或动态生成）
  promptVersion    String?      // 提示词版本
  tokenCount       Int?         // 提示词token数量
  modelContext     Json?        // 模型上下文信息
}
```

#### 2.2 存储策略选择
**方案A：完整存储**（推荐）
- 优点：查询快，无需重新生成
- 缺点：存储空间较大

**方案B：动态生成**
- 优点：节省存储空间
- 缺点：查询时需要重新生成，性能较差

**选择方案A**，因为：
1. 决策日志数量有限
2. 存储成本相对较低
3. 查询性能更重要

#### 2.3 前端展示设计
```typescript
// AI决策详情组件结构
interface AIDecisionDetailProps {
  decision: {
    id: number;
    // ... 现有字段

    // 新增字段
    fullPrompt: string;
    promptTemplate: string;
    promptVariables: Record<string, any>;
    tokenCount: number;
    modelContext: {
      modelName: string;
      provider: string;
      temperature: number;
      maxTokens: number;
    };
  };
}
```

## 🏗️ 架构设计

### 1. 系统架构
```
前端界面 → 后端API → AI服务 → AI大模型
    ↑          ↑         ↑         ↑
展示提示词  存储日志  生成提示词  接收提示词
```

### 2. 数据流设计
```
1. 用户配置AI账户偏好
2. 决策请求时，后端收集账户配置
3. AI服务根据配置生成个性化提示词
4. 发送提示词给AI大模型
5. 存储完整提示词到决策日志
6. 前端从决策日志获取并展示提示词
```

### 3. 组件设计

#### 3.1 后端增强组件
- **PromptTemplateService**：提示词模板管理服务
- **UserPreferenceProcessor**：用户偏好处理服务
- **DecisionLogger**：增强的决策日志记录器

#### 3.2 前端增强组件
- **AIDecisionPromptViewer**：提示词查看器组件
- **UserPreferenceEditor**：用户偏好编辑器组件
- **TokenUsageMonitor**：token使用监控组件

## 🔄 实施计划

### 阶段一：后端增强（1-2天）
1. **数据库迁移**：增强DecisionLog模型
2. **服务层开发**：实现PromptTemplateService和UserPreferenceProcessor
3. **API增强**：更新决策请求API，集成用户偏好
4. **决策日志增强**：在决策日志中存储完整提示词

### 阶段二：AI服务集成（1天）
1. **提示词生成优化**：实现模板化提示词生成
2. **用户偏好集成**：在提示词中嵌入用户偏好变量
3. **Token优化**：实现token计数和优化逻辑

### 阶段三：前端展示（1天）
1. **组件增强**：增强AIDecisionDetail组件
2. **提示词展示**：实现完整提示词查看功能
3. **用户偏好编辑**：增强AI账户配置界面

### 阶段四：测试优化（1天）
1. **功能测试**：测试用户偏好集成效果
2. **性能测试**：测试token使用效率
3. **用户体验测试**：测试提示词展示效果

## 📊 性能指标

### 1. Token使用指标
- **基础提示词**：300-500 tokens
- **用户偏好**：50-100 tokens
- **市场数据**：200-500 tokens
- **持仓数据**：100-300 tokens
- **总提示词**：650-1400 tokens（目标范围）

### 2. 存储指标
- **决策日志大小**：平均2-5KB/条
- **每月增长**：约10-50MB（假设每天100-500条决策）
- **存储成本**：可忽略不计

### 3. 性能指标
- **提示词生成时间**：< 100ms
- **决策总时间**：< 30s
- **前端加载时间**：< 1s

## 🛡️ 风险与缓解

### 1. 技术风险
- **风险**：提示词过长导致API调用失败
- **缓解**：实现token计数和自动截断机制
- **风险**：用户偏好配置复杂度过高
- **缓解**：提供预设模板和简化配置选项

### 2. 业务风险
- **风险**：用户不理解提示词内容
- **缓解**：提供提示词解释和示例
- **风险**：token成本超出预算
- **缓解**：实现token使用监控和告警

### 3. 安全风险
- **风险**：提示词泄露敏感信息
- **缓解**：敏感信息脱敏处理
- **风险**：用户偏好被恶意修改
- **缓解**：实现配置变更审计日志

## 📝 测试计划

### 1. 功能测试
- [ ] 用户偏好配置保存和加载
- [ ] 个性化提示词生成
- [ ] 完整提示词存储
- [ ] 前端提示词展示
- [ ] Token计数准确性

### 2. 性能测试
- [ ] 提示词生成性能
- [ ] 决策API响应时间
- [ ] 前端组件加载性能
- [ ] 数据库查询性能

### 3. 集成测试
- [ ] 端到端决策流程
- [ ] 多用户并发测试
- [ ] 错误处理和降级机制
- [ ] 数据一致性验证

## 🔗 相关文档

- [当前功能清单](../CURRENT_FUNCTIONALITY_INVENTORY.md)
- [开发规范](../CODING_STANDARDS.md)
- [产出物管理规范](../ARTIFACT_MANAGEMENT.md)
- [AI服务API配置](../AI_SERVICE_API_CONFIGURATION.md)

## 🚀 下一步行动

1. **立即开始**：创建数据库迁移脚本
2. **并行执行**：开发PromptTemplateService
3. **后续跟进**：增强前端决策详情组件
4. **测试验证**：创建端到端测试脚本

---
*本设计文档将指导AI决策功能优化实施工作*
*所有实施工作必须遵循项目开发规范和产出物管理规范*