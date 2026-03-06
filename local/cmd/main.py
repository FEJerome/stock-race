"""
CLI入口

Local模式命令行交互界面
"""

import sys
from decimal import Decimal
from uuid import UUID

from adapters.storage.sqlite import SQLiteStorage
from adapters.datasource.csv import CSVDataSource
from core.engine.agent import AgentEngine
from core.engine.trading import TradingEngine
from core.domain.models import Strategy
from core.domain.enums import RiskLevel, HoldingPeriod


def main():
    """主入口"""
    if len(sys.argv) < 2:
        print_help()
        return
    
    command = sys.argv[1]
    
    # 初始化存储和数据源
    storage = SQLiteStorage()
    storage.init_schema()
    data_source = CSVDataSource()
    
    agent_engine = AgentEngine(storage)
    trading_engine = TradingEngine(storage, data_source)
    
    if command == "create-agent":
        cmd_create_agent(agent_engine)
    elif command == "list-agents":
        cmd_list_agents(agent_engine)
    elif command == "trade":
        cmd_trade(trading_engine)
    elif command == "portfolio":
        cmd_portfolio(trading_engine)
    elif command == "history":
        cmd_history(trading_engine)
    elif command == "help":
        print_help()
    else:
        print(f"未知命令: {command}")
        print_help()


def print_help():
    """打印帮助信息"""
    print("""
AI股票竞赛平台 - Local模式

使用方法: python -m local.cmd.main <命令>

命令：
  create-agent    创建AI交易员
  list-agents     列出所有AI交易员
  trade          执行交易
  portfolio      查看账户组合
  history        查看交易历史
  help           显示帮助

示例：
  # 创建AI交易员
  python -m local.cmd.main create-agent

  # 执行买入
  python -m local.cmd.main trade --agent-id <id> --symbol sh000001 --action buy --quantity 100
    """)


def cmd_create_agent(engine: AgentEngine):
    """创建AI交易员"""
    print("=== 创建AI交易员 ===")
    
    name = input("AI名称: ")
    
    print("\n风险等级: conservative, moderate, aggressive, extreme")
    risk = input("风险等级 [moderate]: ") or "moderate"
    
    print("\n持仓周期: ultra_short, short, medium, long")
    period = input("持仓周期 [medium]: ") or "medium"
    
    capital = input("初始资金 [100000]: ") or "100000"
    
    strategy = Strategy(
        risk_level=RiskLevel(risk),
        holding_period=HoldingPeriod(period),
        focus_sectors=[],
        max_position_per_stock=Decimal("0.3"),
        stop_loss_discipline="strict",
        market_scope="main_board"
    )
    
    agent = engine.create_agent(
        name=name,
        initial_capital=Decimal(capital),
        strategy=strategy
    )
    
    print(f"\n✓ AI交易员创建成功")
    print(f"  ID: {agent.id}")
    print(f"  名称: {agent.name}")
    print(f"  初始资金: {agent.initial_capital}")


def cmd_list_agents(engine: AgentEngine):
    """列出AI交易员"""
    agents = engine.list_agents()
    
    if not agents:
        print("暂无AI交易员")
        return
    
    print("=== AI交易员列表 ===")
    for agent in agents:
        print(f"\n  ID: {agent.id}")
        print(f"  名称: {agent.name}")
        print(f"  资金: {agent.current_capital} / {agent.initial_capital}")
        print(f"  交易次数: {agent.total_trades}")
        print(f"  胜率: {agent.winning_trades}/{agent.total_trades} " + 
              (f"({agent.winning_trades/agent.total_trades*100:.1f}%)" if agent.total_trades > 0 else "N/A"))
        print(f"  状态: {agent.status.value}")


def cmd_trade(engine: TradingEngine):
    """执行交易"""
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent-id", required=True)
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--action", choices=["buy", "sell"], required=True)
    parser.add_argument("--quantity", type=int, required=True)
    
    args = parser.parse_args(sys.argv[2:])
    
    from core.domain.enums import DecisionAction
    
    action = DecisionAction.BUY if args.action == "buy" else DecisionAction.SELL
    
    success, message = engine.execute_trade(
        agent_id=UUID(args.agent_id),
        symbol=args.symbol,
        action=action,
        quantity=args.quantity
    )
    
    if success:
        print(f"✓ {message}")
    else:
        print(f"✗ 交易失败: {message}")


def cmd_portfolio(engine: TradingEngine):
    """查看账户组合"""
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent-id", required=True)
    
    args = parser.parse_args(sys.argv[2:])
    
    portfolio = engine.get_portfolio(UUID(args.agent_id))
    
    if not portfolio:
        print("未找到账户信息")
        return
    
    print("=== 账户组合 ===")
    print(f"现金: {portfolio.cash:.2f}")
    print(f"持仓市值: {sum(p.market_value for p in portfolio.positions):.2f}")
    print(f"总资产: {portfolio.total_value:.2f}")
    
    if portfolio.positions:
        print("\n持仓明细:")
        for pos in portfolio.positions:
            print(f"  {pos.symbol}: {pos.quantity}股 @ {pos.avg_cost} " +
                  f"(市值: {pos.market_value:.2f}, 盈亏: {pos.unrealized_pnl:+.2f})")


def cmd_history(engine: TradingEngine):
    """查看交易历史"""
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent-id", required=True)
    
    args = parser.parse_args(sys.argv[2:])
    
    trades = engine.get_trade_history(UUID(args.agent_id))
    
    if not trades:
        print("暂无交易记录")
        return
    
    print("=== 交易历史 ===")
    for trade in trades:
        pnl_str = f"  盈亏: {trade.realized_pnl:+.2f}" if trade.realized_pnl else ""
        print(f"  {trade.timestamp.strftime('%Y-%m-%d %H:%M')} " +
              f"{trade.action.value.upper()} {trade.symbol} " +
              f"{trade.quantity}股 @ {trade.price}" + pnl_str)


if __name__ == "__main__":
    main()
