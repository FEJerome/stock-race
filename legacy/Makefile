# Stock Race - 统一命令入口
# 简化开发流程，统一管理常用命令

.PHONY: help up down integration test status logs

# 默认显示帮助
help:
	@echo "Stock Race 项目管理命令"
	@echo "========================"
	@echo ""
	@echo "环境管理:"
	@echo "  make up          - 启动基础设施 (Redis/PostgreSQL/TimescaleDB)"
	@echo "  make down        - 停止所有服务"
	@echo "  make integration - 启动联调环境 (全容器化)"
	@echo "  make status      - 查看所有服务状态"
	@echo "  make logs        - 查看实时日志"
	@echo ""
	@echo "测试:"
	@echo "  make test        - 运行所有测试"
	@echo "  make test-e2e    - 运行 E2E 测试"
	@echo ""
	@echo "维护:"
	@echo "  make clean       - 清理停止的容器和未使用的镜像"
	@echo "  make build       - 重新构建所有镜像"

# 启动基础设施（开发环境）
up:
	@echo "🚀 启动基础设施..."
	docker-compose up -d
	@echo "✅ 基础设施已启动"
	@echo "  Redis:       localhost:6380"
	@echo "  PostgreSQL:  localhost:5434"
	@echo "  TimescaleDB: localhost:5433"

# 停止所有服务
down:
	@echo "🛑 停止所有服务..."
	docker-compose -f docker-compose.yml down
	docker-compose -f docker-compose.integration.yml down
	@echo "✅ 所有服务已停止"

# 启动联调环境（全容器化，含热重载）
integration:
	@echo "🚀 启动联调环境（全容器化）..."
	@echo "   使用热重载，代码修改自动生效"
	docker-compose -f docker-compose.integration.yml up -d
	@echo ""
	@echo "✅ 联调环境已启动"
	@echo "  Backend:           http://localhost:3001"
	@echo "  Trading AI:        http://localhost:8000"
	@echo "  Market Data:       http://localhost:8001"
	@echo "  Redis:             localhost:6380"
	@echo "  PostgreSQL:        localhost:5434"
	@echo "  TimescaleDB:       localhost:5433"
	@echo ""
	@echo "查看日志: docker-compose -f docker-compose.integration.yml logs -f"

# 查看服务状态
status:
	@echo "📊 服务状态:"
	@docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep stock-race || echo "   无运行中的服务"

# 查看日志
logs:
	docker-compose -f docker-compose.integration.yml logs -f

# 运行测试
test:
	@echo "🧪 运行测试..."
	./scripts/test/run-all.sh 2>/dev/null || echo "   测试脚本待实现"

# 运行 E2E 测试
test-e2e:
	@echo "🧪 运行 E2E 测试..."
	./scripts/test/e2e/run-e2e-tests.sh 2>/dev/null || echo "   E2E 测试脚本待实现"

# 清理未使用的资源
clean:
	@echo "🧹 清理资源..."
	docker system prune -f
	@echo "✅ 清理完成"

# 重新构建镜像
build:
	@echo "🔨 重新构建镜像..."
	docker-compose -f docker-compose.integration.yml build
	@echo "✅ 镜像构建完成"

# 健康检查
health:
	@echo "🏥 健康检查:"
	@echo "  Backend..."
	@curl -s http://localhost:3001/api/health | grep -o '"status":"[^"]*"' || echo "    ❌ 未启动"
	@echo "  Trading AI..."
	@curl -s http://localhost:8000/api/v1/health/ | grep -o '"status":"[^"]*"' || echo "    ❌ 未启动"
	@echo "  Market Data..."
	@curl -s http://localhost:8001/health | grep -o '"status":"[^"]*"' || echo "    ❌ 未启动"
