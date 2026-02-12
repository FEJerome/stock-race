# AI服务API配置指南

## 📋 概述

本文档指导用户如何配置AI服务的API密钥，避免硬编码。系统支持多种AI模型，包括：
- DeepSeek
- GLM4.5 (智谱AI)
- GLM4.6 (智谱AI)
- OpenAI
- Claude
- Qwen
- 文心一言

## 🔧 配置位置

### 1. 环境变量配置文件
**主要配置文件**：`ai-service/.env`

这是AI服务的主要配置文件，所有API密钥都应在此文件中配置。

### 2. 环境变量示例文件
**参考文件**：`ai-service/.env.example`

此文件包含所有可配置的环境变量示例，用户应复制此文件为`.env`并填写自己的API密钥。

## 📝 配置步骤

### 步骤1：复制环境变量文件
```bash
cd ai-service
cp .env.example .env
```

### 步骤2：编辑.env文件
打开`.env`文件，找到以下配置项并填写您的API密钥：

```env
# AI Provider API Keys
OPENAI_API_KEY=your-openai-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
DEEPSEEK_API_KEY=your-deepseek-api-key-here
QWEN_API_KEY=your-qwen-api-key-here
GLM_API_KEY=your-glm-api-key-here  # 新增：智谱AI API密钥
```

### 步骤3：GLM API密钥获取
要使用GLM4.5和GLM4.6模型，您需要：

1. **访问智谱AI开放平台**：https://open.bigmodel.cn/
2. **注册账号**并完成实名认证
3. **创建API密钥**：在控制台创建新的API密钥
4. **获取API密钥**：复制生成的API密钥

### 步骤4：配置其他AI服务（可选）
如果您需要使用其他AI模型，请相应配置：

```env
# 其他AI服务配置
WENXIN_API_KEY=your-wenxin-api-key-here  # 文心一言
```

## 🎯 支持的模型配置

### DeepSeek模型
- **模型名称**：`deepseek-chat`, `deepseek-coder`
- **API密钥**：`DEEPSEEK_API_KEY`
- **获取地址**：https://platform.deepseek.com/

### GLM模型（智谱AI）
- **模型名称**：`glm-4`, `glm-4-plus`, `glm-4v`, `glm-4-0520`, `glm-4-air`, `glm-4-airx`
- **API密钥**：`GLM_API_KEY`
- **获取地址**：https://open.bigmodel.cn/

### OpenAI模型
- **模型名称**：`gpt-4-turbo-preview`, `gpt-4`, `gpt-3.5-turbo`
- **API密钥**：`OPENAI_API_KEY`
- **获取地址**：https://platform.openai.com/

### Claude模型
- **模型名称**：`claude-3-opus-20240229`, `claude-3-sonnet-20240229`, `claude-3-haiku-20240307`
- **API密钥**：`ANTHROPIC_API_KEY`
- **获取地址**：https://console.anthropic.com/

## 🔄 系统集成

### 后端服务配置
后端服务通过环境变量配置AI服务URL：

```env
# 后端服务配置 (backend/.env)
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_API_KEY=your-ai-service-api-key
```

### 前端服务配置
前端服务通过环境变量配置后端API URL：

```env
# 前端服务配置 (frontend/.env)
VITE_API_URL=http://localhost:3001/api
```

## 🧪 测试配置

### 1. 验证环境变量
```bash
cd ai-service
# 检查环境变量是否加载
python -c "import os; print('DEEPSEEK_API_KEY:', 'SET' if os.getenv('DEEPSEEK_API_KEY') else 'NOT SET')"
python -c "import os; print('GLM_API_KEY:', 'SET' if os.getenv('GLM_API_KEY') else 'NOT SET')"
```

### 2. 启动AI服务测试
```bash
cd ai-service
source venv/bin/activate
python -m uvicorn ai_service.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. 验证健康检查
```bash
curl http://localhost:8000/api/v1/health/
```

## ⚠️ 安全注意事项

### 1. 密钥安全
- **不要提交**.env文件到版本控制
- 将`.env`添加到`.gitignore`
- 使用环境变量管理工具（如Vault）管理生产环境密钥

### 2. 权限控制
- 为不同环境使用不同的API密钥
- 定期轮换API密钥
- 监控API使用情况，设置使用限额

### 3. 错误处理
系统设计了完善的错误处理机制：
- API密钥无效时返回明确的错误信息
- 服务不可用时自动降级到可用模型
- 记录详细的错误日志便于排查

## 🔍 故障排除

### 常见问题1：API密钥无效
**症状**：AI服务返回401错误
**解决方案**：
1. 检查API密钥是否正确
2. 验证API密钥是否有足够的权限
3. 检查API密钥是否过期

### 常见问题2：服务连接失败
**症状**：无法连接到AI服务
**解决方案**：
1. 检查网络连接
2. 验证AI服务URL配置
3. 检查防火墙设置

### 常见问题3：模型不可用
**症状**：特定模型返回404错误
**解决方案**：
1. 检查模型名称是否正确
2. 验证API密钥是否支持该模型
3. 查看AI服务提供商文档

## 📊 配置验证清单

- [ ] 复制`.env.example`为`.env`
- [ ] 填写DeepSeek API密钥
- [ ] 填写GLM API密钥（如需使用GLM模型）
- [ ] 配置其他AI服务API密钥（可选）
- [ ] 验证环境变量加载
- [ ] 启动AI服务并验证健康检查
- [ ] 测试AI决策功能

## 🚀 快速开始

### 最小配置（仅DeepSeek）
```env
DEEPSEEK_API_KEY=your-deepseek-api-key-here
```

### 完整配置（多模型支持）
```env
DEEPSEEK_API_KEY=your-deepseek-api-key-here
GLM_API_KEY=your-glm-api-key-here
OPENAI_API_KEY=your-openai-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

## 📞 支持

如有配置问题，请参考：
1. **项目文档**：`docs/development/`目录
2. **AI服务文档**：`ai-service/README.md`
3. **问题反馈**：项目Issue跟踪

---

*文档创建时间：2026-02-06*
*最后更新：2026-02-06*
*文档维护者：首席架构师*