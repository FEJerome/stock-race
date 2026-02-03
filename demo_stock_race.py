#!/usr/bin/env python3
"""
AI股票竞赛平台 - 功能演示脚本

本脚本展示stock-race项目的核心功能，无需启动完整服务栈。
演示内容：
1. 股票数据模拟和获取
2. AI决策逻辑（模拟大模型API）
3. 虚拟交易执行
4. 持仓管理和收益计算
"""

import json
import random
from datetime import datetime, timedelta
from typing import Dict, List, Any
import sys

print("=" * 70)
print("AI股票竞赛平台 - 核心功能演示")
print("=" * 70)

# ============================================================================
# 1. 股票数据模拟
# ============================================================================

class StockDataSimulator:
    """模拟股票数据生成器"""

    def __init__(self):
        self.stocks = {
            "000001.SZ": {"name": "平安银行", "sector": "金融", "base_price": 16.85},
            "600036.SH": {"name": "招商银行", "sector": "金融", "base_price": 32.50},
            "000858.SZ": {"name": "五粮液", "sector": "消费", "base_price": 148.20},
            "600519.SH": {"name": "贵州茅台", "sector": "消费", "base_price": 1680.50},
            "300750.SZ": {"name": "宁德时代", "sector": "新能源", "base_price": 185.30},
        }

    def generate_realtime_data(self, symbol: str) -> Dict[str, Any]:
        """生成实时股票数据"""
        if symbol not in self.stocks:
            return None

        stock = self.stocks[symbol]
        base = stock["base_price"]

        # 模拟价格波动（-2% 到 +2%）
        change_percent = random.uniform(-2.0, 2.0)
        price = base * (1 + change_percent / 100)

        # 生成完整行情数据
        return {
            "symbol": symbol,
            "name": stock["name"],
            "price": round(price, 2),
            "open": round(base * (1 + random.uniform(-1.5, 1.5) / 100), 2),
            "high": round(price * (1 + random.uniform(0, 1.5) / 100), 2),
            "low": round(price * (1 - random.uniform(0, 1.5) / 100), 2),
            "volume": random.randint(100000, 5000000),
            "amount": round(random.uniform(10000000, 500000000), 2),
            "change": round(price - base, 2),
            "change_percent": round(change_percent, 2),
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "bid_price": round(price * 0.999, 2),
            "ask_price": round(price * 1.001, 2),
            "bid_volume": random.randint(100, 10000),
            "ask_volume": random.randint(100, 10000),
        }

    def generate_historical_data(self, symbol: str, days: int = 30) -> List[Dict[str, Any]]:
        """生成历史K线数据"""
        history = []
        base_date = datetime.now() - timedelta(days=days)

        if symbol not in self.stocks:
            return history

        stock = self.stocks[symbol]
        base_price = stock["base_price"]
        current_price = base_price

        for i in range(days):
            date = base_date + timedelta(days=i)

            # 模拟每日价格波动
            daily_change = random.uniform(-3.0, 3.0)
            open_price = current_price
            close_price = open_price * (1 + daily_change / 100)
            high_price = max(open_price, close_price) * (1 + random.uniform(0, 2) / 100)
            low_price = min(open_price, close_price) * (1 - random.uniform(0, 2) / 100)

            history.append({
                "date": date.strftime("%Y-%m-%d"),
                "open": round(open_price, 2),
                "high": round(high_price, 2),
                "low": round(low_price, 2),
                "close": round(close_price, 2),
                "volume": random.randint(500000, 5000000),
                "amount": round(random.uniform(50000000, 500000000), 2),
                "change": round(close_price - open_price, 2),
                "change_percent": round(daily_change, 2),
            })

            current_price = close_price

        return history

# ============================================================================
# 2. AI决策引擎
# ============================================================================

class AIDecisionEngine:
    """AI决策引擎（模拟大模型API调用）"""

    def __init__(self):
        self.prompt_templates = {
            "conservative": """你是一个保守型AI投资顾问。分析以下股票数据：
股票: {symbol} ({name})
当前价格: {price}
涨跌幅: {change_percent}%
成交量: {volume}
近期趋势: {trend}

请基于以下原则给出投资建议：
1. 只投资基本面良好的蓝筹股
2. 避免高风险高波动股票
3. 设置严格的止损位（-5%）
4. 分散投资，单只股票不超过总资产的20%

请输出JSON格式：
{{
  "action": "BUY/SELL/HOLD",
  "quantity": 数量,
  "reason": "决策理由",
  "confidence": 置信度(0-100),
  "risk_level": "LOW/MEDIUM/HIGH"
}}""",
            "aggressive": """你是一个进取型AI投资顾问。分析以下股票数据：
股票: {symbol} ({name})
当前价格: {price}
涨跌幅: {change_percent}%
成交量: {volume}
近期趋势: {trend}

请基于以下原则给出投资建议：
1. 寻找高成长潜力股票
2. 可以承担较高风险
3. 技术分析为主，基本面为辅
4. 追求超额收益，接受较大波动

请输出JSON格式：
{{
  "action": "BUY/SELL/HOLD",
  "quantity": 数量,
  "reason": "决策理由",
  "confidence": 置信度(0-100),
  "risk_level": "LOW/MEDIUM/HIGH"
}}""",
        }

    def analyze_stock(self, stock_data: Dict[str, Any], strategy: str = "conservative") -> Dict[str, Any]:
        """分析股票并给出交易建议"""

        # 模拟AI分析逻辑
        price = stock_data["price"]
        change_percent = stock_data["change_percent"]
        volume = stock_data["volume"]

        # 简单决策逻辑（实际项目中会调用大模型API）
        action = "HOLD"
        confidence = 70
        risk_level = "MEDIUM"

        if change_percent < -1.5 and volume > 1000000:
            action = "BUY"
            reason = "价格回调且成交量放大，可能是买入机会"
            confidence = 75
            risk_level = "MEDIUM"
        elif change_percent > 3.0:
            action = "SELL"
            reason = "短期涨幅过大，建议获利了结"
            confidence = 80
            risk_level = "LOW"
        elif -0.5 <= change_percent <= 0.5:
            action = "HOLD"
            reason = "价格波动较小，建议观望"
            confidence = 85
            risk_level = "LOW"
        else:
            action = "HOLD"
            reason = "市场表现中性，建议保持现有持仓"
            confidence = 70
            risk_level = "MEDIUM"

        # 根据策略调整
        if strategy == "aggressive" and action == "BUY":
            confidence += 5
        elif strategy == "conservative" and action == "SELL":
            confidence += 10

        # 计算建议数量（基于虚拟资金100,000）
        if action == "BUY":
            quantity = min(int(10000 / price), 1000)  # 最多买入1000股或1万元
        elif action == "SELL":
            quantity = random.randint(100, 500)  # 假设已有持仓
        else:
            quantity = 0

        return {
            "symbol": stock_data["symbol"],
            "action": action,
            "quantity": quantity,
            "price": price,
            "reason": reason,
            "confidence": confidence,
            "risk_level": risk_level,
            "strategy": strategy,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

# ============================================================================
# 3. 虚拟交易系统
# ============================================================================

class VirtualTradingSystem:
    """虚拟交易系统"""

    def __init__(self, initial_capital: float = 100000.0):
        self.capital = initial_capital
        self.positions = {}  # symbol -> {"quantity": qty, "avg_cost": cost}
        self.trade_history = []
        self.portfolio_value = initial_capital

    def execute_trade(self, decision: Dict[str, Any], stock_data: Dict[str, Any]) -> Dict[str, Any]:
        """执行交易"""
        symbol = decision["symbol"]
        action = decision["action"]
        quantity = decision["quantity"]
        price = stock_data["price"]

        if action == "BUY":
            return self._execute_buy(symbol, quantity, price, decision)
        elif action == "SELL":
            return self._execute_sell(symbol, quantity, price, decision)
        else:
            return {"status": "SKIPPED", "reason": "HOLD action, no trade executed"}

    def _execute_buy(self, symbol: str, quantity: int, price: float, decision: Dict[str, Any]) -> Dict[str, Any]:
        """执行买入"""
        cost = quantity * price
        commission = max(cost * 0.001, 1.0)  # 0.1%佣金，最低1元

        total_cost = cost + commission

        if total_cost > self.capital:
            return {
                "status": "FAILED",
                "reason": f"资金不足。需要: ¥{total_cost:.2f}, 可用: ¥{self.capital:.2f}",
                "symbol": symbol,
                "action": "BUY",
                "quantity": quantity,
                "price": price,
            }

        # 更新资金和持仓
        self.capital -= total_cost

        if symbol in self.positions:
            pos = self.positions[symbol]
            total_qty = pos["quantity"] + quantity
            total_cost_val = (pos["avg_cost"] * pos["quantity"]) + cost
            new_avg_cost = total_cost_val / total_qty

            self.positions[symbol] = {
                "quantity": total_qty,
                "avg_cost": new_avg_cost,
                "total_cost": total_cost_val,
            }
        else:
            self.positions[symbol] = {
                "quantity": quantity,
                "avg_cost": price,
                "total_cost": cost,
            }

        trade_record = {
            "id": len(self.trade_history) + 1,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "symbol": symbol,
            "action": "BUY",
            "quantity": quantity,
            "price": price,
            "commission": commission,
            "total_cost": total_cost,
            "remaining_capital": self.capital,
            "ai_decision": decision,
            "status": "SUCCESS",
        }

        self.trade_history.append(trade_record)
        return trade_record

    def _execute_sell(self, symbol: str, quantity: int, price: float, decision: Dict[str, Any]) -> Dict[str, Any]:
        """执行卖出"""
        if symbol not in self.positions:
            return {
                "status": "FAILED",
                "reason": f"未持有{symbol}",
                "symbol": symbol,
                "action": "SELL",
                "quantity": quantity,
            }

        position = self.positions[symbol]
        if quantity > position["quantity"]:
            quantity = position["quantity"]  # 卖出全部持仓

        # 计算收益
        revenue = quantity * price
        commission = max(revenue * 0.001, 1.0)  # 0.1%佣金
        stamp_tax = revenue * 0.001  # 0.1%印花税

        net_revenue = revenue - commission - stamp_tax
        cost = quantity * position["avg_cost"]
        profit = net_revenue - cost
        profit_percent = (profit / cost) * 100 if cost > 0 else 0

        # 更新资金和持仓
        self.capital += net_revenue

        if quantity == position["quantity"]:
            del self.positions[symbol]  # 清仓
        else:
            self.positions[symbol]["quantity"] -= quantity
            # 平均成本不变，因为卖出的部分按平均成本计算

        trade_record = {
            "id": len(self.trade_history) + 1,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "symbol": symbol,
            "action": "SELL",
            "quantity": quantity,
            "price": price,
            "revenue": revenue,
            "commission": commission,
            "stamp_tax": stamp_tax,
            "net_revenue": net_revenue,
            "cost": cost,
            "profit": profit,
            "profit_percent": profit_percent,
            "remaining_capital": self.capital,
            "ai_decision": decision,
            "status": "SUCCESS",
        }

        self.trade_history.append(trade_record)
        return trade_record

    def calculate_portfolio_value(self, market_prices: Dict[str, float]) -> Dict[str, Any]:
        """计算投资组合价值"""
        positions_value = 0.0
        positions_detail = []

        for symbol, pos in self.positions.items():
            if symbol in market_prices:
                market_price = market_prices[symbol]
                market_value = pos["quantity"] * market_price
                cost_value = pos["quantity"] * pos["avg_cost"]
                unrealized_profit = market_value - cost_value
                unrealized_profit_percent = (unrealized_profit / cost_value) * 100 if cost_value > 0 else 0

                positions_value += market_value

                positions_detail.append({
                    "symbol": symbol,
                    "quantity": pos["quantity"],
                    "avg_cost": pos["avg_cost"],
                    "market_price": market_price,
                    "market_value": market_value,
                    "cost_value": cost_value,
                    "unrealized_profit": unrealized_profit,
                    "unrealized_profit_percent": unrealized_profit_percent,
                })

        total_value = self.capital + positions_value
        total_return = total_value - 100000.0  # 相对于初始资金
        total_return_percent = (total_return / 100000.0) * 100

        return {
            "cash": self.capital,
            "positions_value": positions_value,
            "total_value": total_value,
            "total_return": total_return,
            "total_return_percent": total_return_percent,
            "positions": positions_detail,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

# ============================================================================
# 4. 演示主流程
# ============================================================================

def main():
    print("\n📈 第1步：模拟股票数据生成")
    print("-" * 50)

    data_simulator = StockDataSimulator()

    # 生成几只股票的实时数据
    symbols = ["000001.SZ", "600036.SH", "000858.SZ", "600519.SH", "300750.SZ"]
    market_data = {}

    print("生成实时股票行情数据：")
    for symbol in symbols[:3]:  # 只显示前3只
        data = data_simulator.generate_realtime_data(symbol)
        if data:
            market_data[symbol] = data["price"]
            print(f"  {symbol} ({data['name']}): ¥{data['price']} "
                  f"({data['change_percent']:+}%) 成交量: {data['volume']:,}")

    print("\n🎯 第2步：AI决策分析")
    print("-" * 50)

    ai_engine = AIDecisionEngine()
    decisions = []

    # 为每只股票生成AI决策
    for symbol in symbols[:3]:
        if symbol in market_data:
            stock_data = data_simulator.generate_realtime_data(symbol)
            # 使用两种策略分析
            for strategy in ["conservative", "aggressive"]:
                decision = ai_engine.analyze_stock(stock_data, strategy)
                decisions.append(decision)

                print(f"\n  {symbol} - {strategy}策略:")
                print(f"    建议: {decision['action']} {decision['quantity']}股 @ ¥{decision['price']}")
                print(f"    理由: {decision['reason']}")
                print(f"    置信度: {decision['confidence']}%, 风险等级: {decision['risk_level']}")

    print("\n💰 第3步：虚拟交易执行")
    print("-" * 50)

    trading_system = VirtualTradingSystem(initial_capital=100000.0)

    # 执行前2个BUY建议（如果资金允许）
    buy_decisions = [d for d in decisions if d["action"] == "BUY"]

    if buy_decisions:
        print("执行买入交易：")
        for i, decision in enumerate(buy_decisions[:2]):  # 最多执行2笔买入
            symbol = decision["symbol"]
            stock_data = data_simulator.generate_realtime_data(symbol)

            print(f"\n  交易 #{i+1}: {symbol} - {decision['strategy']}策略")
            result = trading_system.execute_trade(decision, stock_data)

            if result["status"] == "SUCCESS":
                print(f"    ✅ 成功买入 {result['quantity']}股 @ ¥{result['price']}")
                print(f"    佣金: ¥{result['commission']:.2f}, 总成本: ¥{result['total_cost']:.2f}")
                print(f"    剩余资金: ¥{result['remaining_capital']:.2f}")
            else:
                print(f"    ❌ 交易失败: {result['reason']}")
    else:
        print("没有买入建议，跳过交易执行")

    print("\n📊 第4步：投资组合分析")
    print("-" * 50)

    # 计算投资组合价值
    portfolio = trading_system.calculate_portfolio_value(market_data)

    print(f"现金余额: ¥{portfolio['cash']:.2f}")
    print(f"持仓市值: ¥{portfolio['positions_value']:.2f}")
    print(f"总资产: ¥{portfolio['total_value']:.2f}")
    print(f"总收益: ¥{portfolio['total_return']:.2f} ({portfolio['total_return_percent']:.2f}%)")

    if portfolio["positions"]:
        print("\n持仓明细：")
        for pos in portfolio["positions"]:
            profit_color = "🟢" if pos["unrealized_profit"] >= 0 else "🔴"
            print(f"  {pos['symbol']}: {pos['quantity']}股 @ 成本¥{pos['avg_cost']:.2f}")
            print(f"    现价: ¥{pos['market_price']:.2f}, 市值: ¥{pos['market_value']:.2f}")
            print(f"    浮动盈亏: {profit_color}¥{pos['unrealized_profit']:.2f} "
                  f"({pos['unrealized_profit_percent']:.2f}%)")

    print("\n🔄 第5步：模拟下一个交易日")
    print("-" * 50)

    # 模拟价格变化
    print("模拟价格变化后重新评估：")
    new_market_data = {}
    for symbol in symbols[:3]:
        new_data = data_simulator.generate_realtime_data(symbol)
        new_market_data[symbol] = new_data["price"]

        old_price = market_data.get(symbol, 0)
        if old_price > 0:
            change = new_data["price"] - old_price
            change_percent = (change / old_price) * 100
            print(f"  {symbol}: ¥{old_price:.2f} → ¥{new_data['price']:.2f} "
                  f"({change_percent:+.2f}%)")

    # 重新计算投资组合价值
    new_portfolio = trading_system.calculate_portfolio_value(new_market_data)

    value_change = new_portfolio["total_value"] - portfolio["total_value"]
    value_change_percent = (value_change / portfolio["total_value"]) * 100

    print(f"\n资产变化: ¥{portfolio['total_value']:.2f} → ¥{new_portfolio['total_value']:.2f}")
    print(f"当日变动: {value_change:+.2f} ({value_change_percent:+.2f}%)")

    print("\n📋 第6步：交易历史记录")
    print("-" * 50)

    if trading_system.trade_history:
        print("今日交易记录：")
        for trade in trading_system.trade_history:
            action_symbol = "✅" if trade["status"] == "SUCCESS" else "❌"
            action_text = "买入" if trade["action"] == "BUY" else "卖出"
            print(f"  {action_symbol} #{trade['id']}: {action_text} {trade['symbol']} "
                  f"{trade['quantity']}股 @ ¥{trade['price']:.2f}")
            if trade["action"] == "SELL" and "profit" in trade:
                profit_color = "🟢" if trade["profit"] >= 0 else "🔴"
                print(f"     盈亏: {profit_color}¥{trade['profit']:.2f} "
                      f"({trade.get('profit_percent', 0):.2f}%)")
    else:
        print("今日无交易记录")

    print("\n" + "=" * 70)
    print("🎉 演示完成！")
    print("=" * 70)

    print("\n📝 项目功能总结：")
    print("  1. ✅ 实时股票数据采集（支持多数据源）")
    print("  2. ✅ AI智能决策（多策略、多模型支持）")
    print("  3. ✅ 虚拟交易执行（完整费用计算）")
    print("  4. ✅ 持仓管理和风险控制")
    print("  5. ✅ 实时监控和收益分析")
    print("  6. ✅ 排行榜和竞赛功能")

    print("\n🚀 完整项目启动方式：")
    print("  1. 使用Docker Compose一键启动：")
    print("     cd /home/fe-jerome/projects/stock-race")
    print("     docker-compose up -d")
    print("  2. 访问前端界面：http://localhost:3000")
    print("  3. 登录测试账号：demo@example.com / demo123")

    print("\n📁 项目文档位置：")
    print("  - 主文档：/home/fe-jerome/projects/stock-race/CLAUDE.md")
    print("  - 架构设计：docs/architecture/SYSTEM_ARCHITECTURE.md")
    print("  - API文档：http://localhost:3001/api-docs (启动后)")

    return 0

# ============================================================================
# 运行演示
# ============================================================================

if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\n演示被用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 演示出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)