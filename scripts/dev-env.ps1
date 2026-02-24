#!/usr/bin/env pwsh
# 智能体开发环境管理脚本（Windows PowerShell）
# 用法: .\scripts\dev-env.ps1 <action> [service]

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("start", "stop", "restart", "logs", "shell", "test", "status", "clean", "env", "ping-db", "ping-redis", "build")]
    [string]$Action,

    [Parameter(Mandatory=$false)]
    [ValidateSet("backend", "trading-ai", "market-data", "news", "postgres", "redis", "all")]
    [string]$Service = "all"
)

$ComposeFile = "docker-compose.integration.yml"
$ProjectName = "stock-race"

# 服务名映射
$ServiceMap = @{
    "backend" = "backend"
    "trading-ai" = "trading-ai-service"
    "market-data" = "market-data-service"
    "news" = "news-service"
    "postgres" = "postgres"
    "redis" = "redis"
}

function Start-Services {
    Write-Host "🚀 启动 Stock Race 开发环境..." -ForegroundColor Green
    Write-Host "配置文件: $ComposeFile" -ForegroundColor Gray

    docker-compose -f $ComposeFile -p $ProjectName up -d

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n⏳ 等待服务健康检查..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10

        Show-Status

        Write-Host "`n📋 服务访问地址：" -ForegroundColor Cyan
        Write-Host "  Backend:           http://localhost:3001"
        Write-Host "  Trading AI:        http://localhost:8000"
        Write-Host "  Market Data:       http://localhost:8001"
        Write-Host "  PostgreSQL:        localhost:5434"
        Write-Host "  TimescaleDB:       localhost:5433"
        Write-Host "  Redis:             localhost:6380"
    } else {
        Write-Host "`n❌ 启动失败，请检查日志" -ForegroundColor Red
    }
}

function Stop-Services {
    Write-Host "🛑 停止 Stock Race 开发环境..." -ForegroundColor Red
    docker-compose -f $ComposeFile -p $ProjectName down
}

function Restart-Service {
    param([string]$Svc)
    if ($Svc -eq "all") {
        Write-Host "🔄 重启所有服务..." -ForegroundColor Yellow
        docker-compose -f $ComposeFile -p $ProjectName restart
    } else {
        $containerName = $ServiceMap[$Svc]
        Write-Host "🔄 重启服务: $containerName" -ForegroundColor Yellow
        docker-compose -f $ComposeFile -p $ProjectName restart $containerName
    }
}

function Show-Logs {
    param([string]$Svc)
    if ($Svc -eq "all") {
        docker-compose -f $ComposeFile -p $ProjectName logs -f
    } else {
        $containerName = $ServiceMap[$Svc]
        docker-compose -f $ComposeFile -p $ProjectName logs -f $containerName
    }
}

function Enter-Shell {
    param([string]$Svc)
    if ($Svc -eq "all") {
        Write-Host "❌ 请指定具体服务" -ForegroundColor Red
        return
    }
    $containerName = $ServiceMap[$Svc]
    $fullName = "${ProjectName}-${containerName}-int"
    Write-Host "🐚 进入容器: $fullName" -ForegroundColor Cyan
    docker exec -it $fullName sh
}

function Run-Tests {
    param([string]$Svc)
    if ($Svc -eq "all") {
        Write-Host "❌ 请指定具体服务" -ForegroundColor Red
        return
    }
    $containerName = $ServiceMap[$Svc]
    $fullName = "${ProjectName}-${containerName}-int"

    switch ($Svc) {
        "backend" {
            docker exec $fullName npm test
        }
        "trading-ai" {
            docker exec $fullName python -m pytest
        }
        "market-data" {
            docker exec $fullName python -m pytest
        }
        "news" {
            docker exec $fullName python -m pytest
        }
        default {
            Write-Host "❌ 暂不支持该服务的测试" -ForegroundColor Red
        }
    }
}

function Show-Status {
    docker-compose -f $ComposeFile -p $ProjectName ps
}

function Clean-Environment {
    Write-Host "🧹 清理开发环境（包括数据卷）..." -ForegroundColor Red
    docker-compose -f $ComposeFile -p $ProjectName down -v
    Write-Host "✅ 环境已清理" -ForegroundColor Green
}

function Show-Environment {
    param([string]$Svc)
    if ($Svc -eq "all") {
        Write-Host "❌ 请指定具体服务" -ForegroundColor Red
        return
    }
    $containerName = $ServiceMap[$Svc]
    $fullName = "${ProjectName}-${containerName}-int"
    Write-Host "📋 环境变量 ($fullName):" -ForegroundColor Cyan
    docker exec $fullName env | Sort-Object
}

function Test-Connection {
    param([string]$Target)

    switch ($Target) {
        "ping-db" {
            $containerName = "${ProjectName}-backend-int"
            Write-Host "🌐 测试数据库连接..." -ForegroundColor Cyan
            docker exec $containerName sh -c "nc -zv postgres 5432 && echo '✅ Database connection OK'"
        }
        "ping-redis" {
            $containerName = "${ProjectName}-backend-int"
            Write-Host "🌐 测试 Redis 连接..." -ForegroundColor Cyan
            docker exec $containerName sh -c "nc -zv redis 6379 && echo '✅ Redis connection OK'"
        }
    }
}

function Build-Services {
    Write-Host "🔨 构建所有服务镜像..." -ForegroundColor Cyan
    docker-compose -f $ComposeFile -p $ProjectName build
}

# 主逻辑
switch ($Action) {
    "start" { Start-Services }
    "stop" { Stop-Services }
    "restart" { Restart-Service -Svc $Service }
    "logs" { Show-Logs -Svc $Service }
    "shell" { Enter-Shell -Svc $Service }
    "test" { Run-Tests -Svc $Service }
    "status" { Show-Status }
    "clean" { Clean-Environment }
    "env" { Show-Environment -Svc $Service }
    "ping-db" { Test-Connection -Target "ping-db" }
    "ping-redis" { Test-Connection -Target "ping-redis" }
    "build" { Build-Services }
}
