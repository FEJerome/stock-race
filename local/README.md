# Local模式 - AI股票竞赛平台

纯工具版本，用于技术验证和离线开发。

## 快速开始

### 1. 安装依赖

```bash
cd local
pip install -r requirements.txt
```

### 2. 准备股票数据

```bash
mkdir -p data/stocks

# 创建CSV文件 data/stocks/sh000001.csv
cat > data/stocks/sh000001.csv << EOF
date,open,high,low,close,volume,change_percent
2024-01-01,100.0,105.0,98.0,102.0,1000000,2.0
2024-01-02,102.0,106.0,101.0,104.0,1200000,1.96
EOF
```

### 3. 创建AI交易员

```bash
python -m local.cmd.main create-agent
```

### 4. 执行交易

```bash
# 查看AI列表获取ID
python -m local.cmd.main list-agents

# 买入
python -m local.cmd.main trade \
  --agent-id <your-agent-id> \
  --symbol sh000001 \
  --action buy \
  --quantity 100

# 卖出
python -m local.cmd.main trade \
  --agent-id <your-agent-id> \
  --symbol sh000001 \
  --action sell \
  --quantity 100
```

### 5. 查看结果

```bash
# 账户组合
python -m local.cmd.main portfolio --agent-id <id>

# 交易历史
python -m local.cmd.main history --agent-id <id>
```

## 架构说明

详见 [ARCHITECTURE.md](./ARCHITECTURE.md)

## 与MVP/Full的区别

| 功能 | Local | MVP | Full |
|------|:-----:|:---:|:----:|
| 用户系统 | ❌ | 微信登录 | 完整账号 |
| 数据源 | CSV文件 | 实时API | 多源+推送 |
| 前端 | CLI | 小程序 | 全平台 |
| 等级/订阅 | ❌ | 7天试用 | 完整 |

## 开发计划

- [x] 核心领域模型
- [x] SQLite存储
- [x] CSV数据源
- [x] 基础CLI
- [ ] AI决策集成（DeepSeek API）
- [ ] 策略收集对话
- [ ] 交易报告生成
