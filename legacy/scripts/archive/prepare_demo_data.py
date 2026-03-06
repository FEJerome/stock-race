#!/usr/bin/env python3
"""
演示数据准备脚本
用于为Stock Race平台准备演示用的股票数据和AI账户数据
"""

import json
import random
from datetime import datetime, timedelta
import requests
import sys
import os

# 添加项目路径
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend', 'src'))

# 演示股票列表（中国A股）
DEMO_STOCKS = [
    {"symbol": "000001.SZ", "name": "平安银行", "exchange": "SZ", "sector": "financial"},
    {"symbol": "000002.SZ", "name": "万科A", "exchange": "SZ", "sector": "real_estate"},
    {"symbol": "600036.SH", "name": "招商银行", "exchange": "SH", "sector": "financial"},
    {"symbol": "600519.SH", "name": "贵州茅台", "exchange": "SH", "sector": "consumer"},
    {"symbol": "000858.SZ", "name": "五粮液", "exchange": "SZ", "sector": "consumer"},
    {"symbol": "300750.SZ", "name": "宁德时代", "exchange": "SZ", "sector": "energy"},
    {"symbol": "601318.SH", "name": "中国平安", "exchange": "SH", "sector": "financial"},
    {"symbol": "000333.SZ", "name": "美的集团", "exchange": "SZ", "sector": "consumer"},
    {"symbol": "002415.SZ", "name": "海康威视", "exchange": "SZ", "sector": "technology"},
    {"symbol": "601888.SH", "name": "中国中免", "exchange": "SH", "sector": "consumer"},
]

# 演示AI账户
DEMO_AI_ACCOUNTS = [
    {
        "name": "GPT-4交易专家",
        "description": "基于GPT-4的AI交易员，擅长基本面分析和趋势跟踪",
        "model": "gpt-4",
        "initial_balance": 1000000,
        "risk_level": "medium",
        "strategy": "momentum_trading"
    },
    {
        "name": "Claude量化策略师",
        "description": "使用Claude模型进行量化分析和统计套利",
        "model": "claude-3-opus",
        "initial_balance": 1500000,
        "risk_level": "low",
        "strategy": "statistical_arbitrage"
    },
    {
        "name": "DeepSeek技术分析师",
        "description": "专注于技术分析和市场情绪预测",
        "model": "deepseek-chat",
        "initial_balance": 800000,
        "risk_level": "high",
        "strategy": "technical_analysis"
    },
    {
        "name": "Qwen多因子模型",
        "description": "基于Qwen模型的多因子选股和风险管理",
        "model": "qwen-max",
        "initial_balance": 1200000,
        "risk_level": "medium",
        "strategy": "multi_factor"
    }
]

def generate_stock_price_history(symbol, days=30):
    """生成股票价格历史数据"""
    history = []
    base_price = random.uniform(10, 500)  # 基础价格
    current_price = base_price

    for i in range(days):
        date = datetime.now() - timedelta(days=days - i - 1)

        # 生成每日价格变动
        change_percent = random.uniform(-0.05, 0.05)
        open_price = current_price
        close_price = current_price * (1 + change_percent)
        high_price = max(open_price, close_price) * (1 + random.uniform(0, 0.03))
        low_price = min(open_price, close_price) * (1 - random.uniform(0, 0.03))
        volume = random.randint(100000, 10000000)

        history.append({
            "symbol": symbol,
            "date": date.strftime("%Y-%m-%d"),
            "open": round(open_price, 2),
            "high": round(high_price, 2),
            "low": round(low_price, 2),
            "close": round(close_price, 2),
            "volume": volume,
            "change": round(close_price - open_price, 2),
            "change_percent": round(change_percent * 100, 2)
        })

        current_price = close_price

    return history

def generate_realtime_quotes():
    """生成实时报价数据"""
    quotes = []
    for stock in DEMO_STOCKS:
        price = random.uniform(5, 600)
        change = random.uniform(-10, 10)
        change_percent = random.uniform(-5, 5)

        quotes.append({
            "symbol": stock["symbol"],
            "name": stock["name"],
            "price": round(price, 2),
            "change": round(change, 2),
            "change_percent": round(change_percent, 2),
            "volume": random.randint(100000, 5000000),
            "amount": round(price * random.randint(100000, 5000000), 2),
            "open": round(price * (1 - random.uniform(0, 0.05)), 2),
            "high": round(price * (1 + random.uniform(0, 0.03)), 2),
            "low": round(price * (1 - random.uniform(0, 0.03)), 2),
            "prev_close": round(price * (1 - random.uniform(-0.02, 0.02)), 2),
            "timestamp": datetime.now().isoformat()
        })

    return quotes

def generate_market_indices():
    """生成市场指数数据"""
    indices = [
        {"symbol": "000001.SH", "name": "上证指数", "price": 3200.12, "change": 15.67, "change_percent": 0.49},
        {"symbol": "399001.SZ", "name": "深证成指", "price": 10850.23, "change": 42.89, "change_percent": 0.40},
        {"symbol": "399006.SZ", "name": "创业板指", "price": 2150.45, "change": 8.76, "change_percent": 0.41},
        {"symbol": "000300.SH", "name": "沪深300", "price": 3800.34, "change": 18.23, "change_percent": 0.48},
        {"symbol": "000016.SH", "name": "上证50", "price": 2500.56, "change": 12.45, "change_percent": 0.50},
    ]

    # 添加一些随机变动
    for idx in indices:
        idx["price"] += random.uniform(-5, 5)
        idx["change"] += random.uniform(-2, 2)
        idx["change_percent"] += random.uniform(-0.1, 0.1)
        idx["price"] = round(idx["price"], 2)
        idx["change"] = round(idx["change"], 2)
        idx["change_percent"] = round(idx["change_percent"], 2)
        idx["timestamp"] = datetime.now().isoformat()

    return indices

def create_demo_user():
    """创建演示用户"""
    return {
        "username": "demo_user",
        "email": "demo@stock-race.com",
        "display_name": "演示用户",
        "initial_balance": 10000000,
        "created_at": datetime.now().isoformat(),
        "is_demo": True
    }

def save_to_file(data, filename):
    """保存数据到文件"""
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ 已保存数据到: {filename}")

def main():
    """主函数"""
    print("🚀 开始准备Stock Race演示数据...")

    # 创建输出目录
    output_dir = os.path.join(os.path.dirname(__file__), "demo_data")
    os.makedirs(output_dir, exist_ok=True)

    # 1. 生成演示股票列表
    print("📊 生成演示股票列表...")
    save_to_file(DEMO_STOCKS, os.path.join(output_dir, "demo_stocks.json"))

    # 2. 生成AI账户数据
    print("🤖 生成AI账户数据...")
    save_to_file(DEMO_AI_ACCOUNTS, os.path.join(output_dir, "demo_ai_accounts.json"))

    # 3. 生成股票历史数据（示例：前3只股票）
    print("📈 生成股票历史数据...")
    stock_history = {}
    for stock in DEMO_STOCKS[:3]:
        history = generate_stock_price_history(stock["symbol"])
        stock_history[stock["symbol"]] = history
    save_to_file(stock_history, os.path.join(output_dir, "demo_stock_history.json"))

    # 4. 生成实时报价
    print("💹 生成实时报价数据...")
    quotes = generate_realtime_quotes()
    save_to_file(quotes, os.path.join(output_dir, "demo_realtime_quotes.json"))

    # 5. 生成市场指数
    print("📉 生成市场指数数据...")
    indices = generate_market_indices()
    save_to_file(indices, os.path.join(output_dir, "demo_market_indices.json"))

    # 6. 生成演示用户
    print("👤 生成演示用户数据...")
    demo_user = create_demo_user()
    save_to_file(demo_user, os.path.join(output_dir, "demo_user.json"))

    # 7. 生成演示配置
    demo_config = {
        "version": "1.0.0",
        "created_at": datetime.now().isoformat(),
        "stock_count": len(DEMO_STOCKS),
        "ai_account_count": len(DEMO_AI_ACCOUNTS),
        "data_days": 30,
        "description": "Stock Race演示数据包"
    }
    save_to_file(demo_config, os.path.join(output_dir, "demo_config.json"))

    print("\n🎉 演示数据准备完成！")
    print(f"📁 数据保存在: {output_dir}")
    print("\n📋 包含的数据：")
    print(f"  • 股票列表: {len(DEMO_STOCKS)} 只股票")
    print(f"  • AI账户: {len(DEMO_AI_ACCOUNTS)} 个AI交易员")
    print(f"  • 股票历史数据: 3只股票30天数据")
    print(f"  • 实时报价: {len(quotes)} 个报价")
    print(f"  • 市场指数: {len(indices)} 个指数")
    print(f"  • 演示用户: 1个")

    # 生成导入脚本
    print("\n🚀 生成数据导入脚本...")
    generate_import_script(output_dir)

    print("\n✅ 所有演示数据准备完成！")

def generate_import_script(output_dir):
    """生成数据导入脚本"""
    script_content = """#!/bin/bash
# Stock Race演示数据导入脚本

echo "🚀 开始导入演示数据..."

# 设置后端API地址
BACKEND_URL="http://localhost:3001/api"
AI_SERVICE_URL="http://localhost:8000/api/v1"
DATA_SERVICE_URL="http://localhost:8001"

echo "📊 导入股票数据..."
# 这里可以添加实际导入逻辑
# curl -X POST $DATA_SERVICE_URL/stocks/batch -H "Content-Type: application/json" -d @demo_stocks.json

echo "🤖 导入AI账户..."
# 这里可以添加实际导入逻辑

echo "👤 创建演示用户..."
# 这里可以添加实际导入逻辑

echo "🎉 演示数据导入完成！"
echo ""
echo "📋 访问地址："
echo "  • 前端界面: http://localhost:3000"
echo "  • 后端API: http://localhost:3001/api"
echo "  • AI服务: http://localhost:8000/docs"
echo "  • 数据服务: http://localhost:8001/docs"
echo ""
echo "🔧 默认登录凭证："
echo "  • 用户名: demo_user"
echo "  • 密码: demo123"
"""

    script_path = os.path.join(output_dir, "import_demo_data.sh")
    with open(script_path, 'w', encoding='utf-8') as f:
        f.write(script_content)

    # 添加执行权限
    os.chmod(script_path, 0o755)

    print(f"📜 导入脚本已生成: {script_path}")

if __name__ == "__main__":
    main()