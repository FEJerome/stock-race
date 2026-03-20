# MVP 形态

> **🔄 方向调整中**：基于合规分析，MVP方向已从"AI交易员实时竞赛"调整为"AI复盘搭档"
>
> 调整日期：2026-03-20

---

## 产品定位

**AI复盘搭档**（暂定名）—— 每个交易日收盘后，你的专属AI分析员为你做一份人格化的市场复盘。

不是冷冰冰的数据，而是有温度的陪伴。不构成投资建议，只叙述今日发生了什么。

---

## 状态

🔄 **方向重定义完成，MVP详细定义中**

| 阶段 | 状态 | 文档 |
|------|------|------|
| 方向调整分析 | ✅ 完成 | [docs/DIRECTION_REDEFINITION.md](docs/DIRECTION_REDEFINITION.md) |
| 合规边界分析 | ✅ 完成 | [docs/COMPLIANCE_ANALYSIS.md](docs/COMPLIANCE_ANALYSIS.md) |
| MVP产品定义 | ✅ 完成 | [docs/MVP_DEFINITION.md](docs/MVP_DEFINITION.md) |
| 技术可行性分析 | ✅ 完成 | [docs/TECHNICAL_FEASIBILITY.md](docs/TECHNICAL_FEASIBILITY.md) |
| 原型开发 | ⏳ 待启动 | - |

---

## 核心变化

### ❌ 放弃的原方向
- AI交易员实时虚拟交易
- 多AI竞赛排行榜
- 实时行情推送
- 策略决策执行

**放弃原因**：合规风险过高，涉及AI荐股、非法经营罪红线

### ✅ 新方向
- 收盘后市场复盘（非实时）
- 人格化AI分析员视角
- 每日400字文字复盘
- 关注板块匹配 + 分析员风格选择

**核心逻辑**：用刘小排"单点击穿"方法论，只做一个功能——收盘后的人格化复盘

---

## 目录结构

```
mpv/
├── docs/                          # MVP分析文档
│   ├── DIRECTION_REDEFINITION.md  # 方向调整核心决策
│   ├── COMPLIANCE_ANALYSIS.md     # 合规边界分析
│   ├── MVP_DEFINITION.md          # 产品定义（刘小排方法论）
│   └── TECHNICAL_FEASIBILITY.md   # 技术可行性/API成本
├── miniprogram/                   # 微信小程序代码（待开发）
└── README.md                      # 本文件
```

---

## 与Local项目的关系

```
Local（技术实验室）              MVP复盘搭档（独立产品）
├── AI适配器（DeepSeek等）  ───▶  ├── 直接复用
├── 新闻/舆情采集系统  ───────▶  ├── 数据服务调用
├── 事件时序分析（Phase 1.4）──▶  ├── 分析结果调用
├── 交易引擎              ───▶  ├── ❌ 不复用
└── 实时行情推送          ───▶  ├── ❌ 不复用
```

Local是你的**实验室**，MVP是你的**子弹**。
实验室不需要变成子弹，但子弹可以用实验室造出来的火药。

---

## 快速导航

| 如果你想了解 | 阅读 |
|-------------|------|
| 为什么要调整方向 | [docs/DIRECTION_REDEFINITION.md](docs/DIRECTION_REDEFINITION.md) |
| 合规边界在哪里 | [docs/COMPLIANCE_ANALYSIS.md](docs/COMPLIANCE_ANALYSIS.md) |
| MVP具体要做什么 | [docs/MVP_DEFINITION.md](docs/MVP_DEFINITION.md) |
| API成本怎么控制 | [docs/TECHNICAL_FEASIBILITY.md](docs/TECHNICAL_FEASIBILITY.md) |

---

## 参考

- [Local](../local/) - Phase 1 技术实验室（数据采集、事件分析）
- [Full](../full/) - Phase 3 完整商业版（规划中，视MVP验证结果决定）
- [DELIVERY_PLAN](../docs/DELIVERY_PLAN.md) - 三形态交付策略（需更新）

---

*最后更新：2026-03-20*
