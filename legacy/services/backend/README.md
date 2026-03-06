# Stock Race 后端API

股票竞赛平台的后端API服务，提供用户认证、AI账户管理、虚拟交易、实时数据推送等功能。

## 🚀 快速开始

### 环境要求
- Node.js >= 18.0.0
- PostgreSQL >= 14
- Redis >= 6
- Docker & Docker Compose (可选)

### 安装步骤

1. **克隆项目**
```bash
git clone https://github.com/FEJerome/stock-race.git
cd stock-race/backend
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库连接等信息
```

4. **启动数据库服务**
```bash
# 使用Docker Compose（推荐）
npm run docker:up

# 或者手动启动PostgreSQL和Redis
```

5. **运行数据库迁移**
```bash
# 生成Prisma客户端
npm run prisma:generate

# 运行数据库迁移
npm run prisma:migrate

# 初始化种子数据
npm run prisma:seed
```

6. **启动开发服务器**
```bash
npm run dev
```

服务器将在 http://localhost:3001 启动，API文档在 http://localhost:3001/api/docs。

## 📁 项目结构

```
backend/
├── src/
│   ├── app.js                 # Express应用入口
│   ├── config/               # 配置文件
│   │   └── database.js       # 数据库配置
│   ├── controllers/          # 控制器层
│   │   └── AuthController.js # 认证控制器
│   ├── middleware/           # 中间件
│   │   └── auth.js           # 认证中间件
│   ├── models/               # 数据模型层
│   │   ├── BaseRepository.js # 基础仓库类
│   │   ├── UserRepository.js # 用户仓库
│   │   └── index.js          # 模型导出
│   ├── routes/               # 路由定义
│   │   ├── auth.js           # 认证路由
│   │   └── index.js          # 主路由
│   ├── services/             # 业务逻辑层
│   │   ├── AuthService.js    # 认证服务
│   │   └── SessionService.js # 会话服务
│   └── database/             # 数据库相关
│       ├── migrations/       # 迁移脚本
│       └── seeds/            # 种子数据
├── prisma/                   # Prisma配置
│   └── schema.prisma         # 数据库模型定义
├── .env.example              # 环境变量示例
├── package.json              # 项目依赖
└── README.md                 # 本文档
```

## 🔐 认证系统

### 登录流程
1. 用户使用密码登录
2. 系统验证密码并生成JWT令牌
3. 创建Redis会话记录
4. 返回用户信息、令牌和会话ID

### 认证方式
- **JWT令牌**: 在请求头中使用 `Authorization: Bearer <token>`
- **会话管理**: 使用Redis存储会话信息
- **权限控制**: 基于角色的权限检查

### API端点

#### 认证相关
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/validate` - 验证令牌
- `POST /api/auth/refresh` - 刷新令牌
- `POST /api/auth/logout` - 退出登录
- `GET /api/auth/me` - 获取当前用户信息
- `PUT /api/auth/settings` - 更新用户设置
- `GET /api/auth/sessions` - 获取用户会话
- `POST /api/auth/sessions/force-logout` - 强制退出其他会话

#### 系统相关
- `GET /api/health` - 健康检查
- `GET /api/api-info` - API信息
- `GET /api/docs` - API文档

## 🗄️ 数据库设计

### 主要数据表
- **users** - 用户信息
- **ai_accounts** - AI交易账户
- **stocks** - 股票基本信息
- **trades** - 交易记录
- **portfolios** - 投资组合
- **decision_logs** - AI决策日志
- **rankings** - 排行榜数据
- **watchlists** - 关注列表
- **system_logs** - 系统日志

### 关系说明
- 一个用户可以拥有多个AI账户
- 一个AI账户可以进行多次交易
- 交易关联具体的股票
- 投资组合记录AI账户的持仓情况
- 决策日志记录AI的买卖决策

## 🔧 开发指南

### 添加新功能
1. 在 `prisma/schema.prisma` 中定义数据模型
2. 在 `src/models/` 中创建对应的Repository
3. 在 `src/services/` 中实现业务逻辑
4. 在 `src/controllers/` 中创建控制器
5. 在 `src/routes/` 中定义路由
6. 更新API文档注释

### 代码规范
- 使用ES6+语法
- 遵循Repository模式进行数据访问
- 控制器只处理HTTP请求和响应
- 业务逻辑放在Service层
- 添加详细的JSDoc注释

### 测试
```bash
# 运行所有测试
npm test

# 运行测试并监视文件变化
npm run test:watch

# 运行特定测试文件
npx jest src/services/AuthService.test.js
```

## 🐳 Docker部署

### 开发环境
```bash
# 启动所有服务
npm run docker:up

# 查看日志
npm run docker:logs

# 停止服务
npm run docker:down

# 重新构建并启动
npm run docker:rebuild
```

### 生产环境
```bash
# 构建Docker镜像
docker build -t stock-race-backend .

# 运行容器
docker run -p 3001:3001 \
  -e DATABASE_URL=postgresql://user:pass@db:5432/stock_race \
  -e REDIS_URL=redis://redis:6379 \
  -e JWT_SECRET=your-secret-key \
  stock-race-backend
```

## 📊 监控和日志

### 健康检查
```bash
# 检查服务状态
curl http://localhost:3001/api/health
```

### 日志级别
- `error`: 错误信息
- `warn`: 警告信息
- `info`: 一般信息
- `debug`: 调试信息（开发环境）

### 监控指标
- API响应时间
- 错误率
- 数据库连接状态
- Redis连接状态
- 内存使用情况

## 🔗 外部服务集成

### AI服务
- 地址: `AI_SERVICE_URL` 环境变量
- 功能: AI决策生成、策略分析

### 数据服务
- 地址: `DATA_SERVICE_URL` 环境变量
- 功能: 股票数据获取、实时行情

## 🚨 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查PostgreSQL服务是否运行
   - 验证 `DATABASE_URL` 配置
   - 检查网络连接

2. **Redis连接失败**
   - 检查Redis服务是否运行
   - 验证 `REDIS_URL` 配置
   - 检查Redis密码设置

3. **JWT验证失败**
   - 检查 `JWT_SECRET` 是否一致
   - 验证令牌是否过期
   - 检查请求头格式

4. **跨域问题**
   - 检查 `CORS_ORIGIN` 配置
   - 验证前端地址是否正确
   - 检查请求头设置

### 调试模式
```bash
# 设置调试环境变量
export DEBUG=stock-race:*
export LOG_LEVEL=debug

# 启动服务
npm run dev
```

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件。

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建Pull Request

## 📞 支持

- 问题报告: [GitHub Issues](https://github.com/FEJerome/stock-race/issues)
- 文档: [API文档](http://localhost:3001/api/docs)
- 邮件: support@stockrace.com

---

**最后更新**: 2026-02-03
**版本**: 1.0.0