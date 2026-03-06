# Scripts 目录说明

所有脚本按功能分类存放，便于查找和维护。

## 📁 目录结构

```
scripts/
├── README.md           # 本文件
├── dev/                # 开发工具脚本
├── install/            # 环境安装脚本
├── test/               # 测试脚本
│   ├── e2e/           # 端到端测试
│   ├── ai/            # AI 服务测试
│   └── verify/        # 验证脚本
├── mcp/                # MCP 相关测试
├── deploy/             # 部署脚本
└── archive/            # 归档的旧脚本
```

## 🔧 开发脚本 (dev/)

| 脚本 | 用途 |
|------|------|
| `start-integration.sh` | 启动 Docker 联调环境（推荐） |
| `start-integration-local.sh` | 启动本地混合模式（基础设施 Docker + 服务本地） |
| `stop-local.sh` | 停止本地运行的服务 |
| `check-environment.sh` | 检查开发环境依赖 |
| `worktree-manager.sh` | Git worktree 管理 |

## 📦 安装脚本 (install/)

| 脚本 | 用途 |
|------|------|
| `install_databases.sh` | 安装 PostgreSQL/Redis/TimescaleDB |
| `install_databases_china.sh` | 国内网络优化版 |
| `install_docker.sh` | 安装 Docker |
| `install_docker_china.sh` | 国内网络优化版 |
| `configure_docker_mirror.sh` | 配置 Docker 国内镜像源 |

## 🧪 测试脚本 (test/)

### E2E 测试 (test/e2e/)
- `e2e_test.sh` - 完整 E2E 测试
- `e2e_api_test.sh` - API 专项测试
- `direct_e2e_test.sh` - 直接 E2E 测试

### AI 测试 (test/ai/)
- `test_ai_decision_flow.sh` - AI 决策流程测试
- `test_ai_decision_simple.sh` - 简化版测试
- `test_ai_decision_optimization.sh` - 优化测试
- `test_ai_decision_enhancement.sh` - 增强功能测试
- `test_ai_api_keys.sh` - API Key 验证

### 验证脚本 (test/verify/)
- `verify_real_data.sh` - 验证真实数据使用
- `verify_basics.sh` - 基础功能验证
- `verify_deployment.sh` - 部署验证
- `verify_production_readiness.sh` - 生产就绪检查

## 🔌 MCP 脚本 (mcp/)

| 脚本 | 用途 |
|------|------|
| `test-mcp-simple.sh` | MCP 连通性测试 |
| `test-mcp-sse.sh` | SSE 端点测试 |
| `test-mcp-call.js` | MCP 工具调用测试 |
| `test-mcp-connect.js` | 连接测试 |
| `test-mcp-ws.js` | WebSocket 测试 |

## 🚀 部署脚本 (deploy/)

| 脚本 | 用途 |
|------|------|
| `deploy-production.sh` | 生产环境部署 |

## 📦 归档脚本 (archive/)

早期演示和测试脚本，不再维护，仅供参考：
- `demo_enhanced.py`
- `demo_stock_race.py`
- `prepare_demo_data.py`

## 💡 使用建议

1. **日常开发**：使用 `make integration` 启动联调环境
2. **环境检查**：运行 `scripts/dev/check-environment.sh`
3. **运行测试**：使用 `make test` 或 `make test-e2e`
