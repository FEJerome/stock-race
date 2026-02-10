#!/usr/bin/env python3
"""
AI Service Comprehensive Test Script
验证AI服务的所有功能模块
"""

import asyncio
import sys
import json
from datetime import datetime
from typing import Dict, Any, List

# 设置路径
sys.path.insert(0, '/home/fe-jerome/projects/stock-race/ai-service/src')

from ai_service.models.schemas import (
    DecisionAction, RiskLevel, AIProvider,
    StockData, Position, AccountInfo,
    DecisionRequest, DecisionResult
)
from ai_service.adapters.base import AdapterFactory, ModelRequest
from ai_service.prompts.trading_prompts import TradingPrompts
from ai_service.prompts.base_prompts import BasePrompts
from ai_service.core.config import settings
from ai_service.core.exceptions import ValidationError


class TestResult:
    def __init__(self, name: str, passed: bool, message: str = "", details: Dict = None):
        self.name = name
        self.passed = passed
        self.message = message
        self.details = details or {}
        self.timestamp = datetime.now()

    def __str__(self):
        status = "✅ PASS" if self.passed else "❌ FAIL"
        return f"{status} | {self.name} - {self.message}"


class AIServiceTester:
    def __init__(self):
        self.results: List[TestResult] = []
        self.test_count = 0
        self.pass_count = 0

    def add_result(self, result: TestResult):
        self.results.append(result)
        self.test_count += 1
        if result.passed:
            self.pass_count += 1

    def print_summary(self):
        print("\n" + "="*80)
        print("AI服务综合测试报告")
        print("="*80)
        print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"总测试数: {self.test_count}")
        print(f"通过: {self.pass_count}")
        print(f"失败: {self.test_count - self.pass_count}")
        print(f"通过率: {self.pass_count/self.test_count*100:.1f}%" if self.test_count > 0 else "N/A")
        print("="*80)

        print("\n详细结果:")
        for result in self.results:
            print(f"  {result}")
            if result.details:
                for key, value in result.details.items():
                    print(f"    - {key}: {value}")


# ============ 测试函数 ============

def test_schemas_models():
    """测试数据模型"""
    results = []

    # 测试 DecisionAction 枚举
    try:
        assert DecisionAction.BUY.value == "buy"
        assert DecisionAction.SELL.value == "sell"
        assert DecisionAction.HOLD.value == "hold"
        assert DecisionAction.SELL_ALL.value == "sell_all"
        results.append(TestResult("DecisionAction枚举", True, "所有枚举值正确"))
    except Exception as e:
        results.append(TestResult("DecisionAction枚举", False, str(e)))

    # 测试 RiskLevel 枚举
    try:
        assert RiskLevel.LOW.value == "low"
        assert RiskLevel.MEDIUM.value == "medium"
        assert RiskLevel.HIGH.value == "high"
        assert RiskLevel.VERY_HIGH.value == "very_high"
        results.append(TestResult("RiskLevel枚举", True, "所有枚举值正确"))
    except Exception as e:
        results.append(TestResult("RiskLevel枚举", False, str(e)))

    # 测试 AIProvider 枚举
    try:
        providers = [p.value for p in AIProvider]
        assert "openai" in providers
        assert "claude" in providers
        assert "deepseek" in providers
        assert "glm" in providers
        results.append(TestResult("AIProvider枚举", True, f"支持 {len(providers)} 个提供商"))
    except Exception as e:
        results.append(TestResult("AIProvider枚举", False, str(e)))

    # 测试 StockData 模型
    try:
        stock = StockData(
            symbol="AAPL",
            name="Apple Inc.",
            current_price=175.50,
            volume=1000000,
            change=2.5,
            change_percent=1.45
        )
        assert stock.symbol == "AAPL"
        assert stock.current_price == 175.50
        results.append(TestResult("StockData模型", True, "基本字段验证通过"))
    except Exception as e:
        results.append(TestResult("StockData模型", False, str(e)))

    # 测试 StockData 带技术指标
    try:
        stock = StockData(
            symbol="MSFT",
            current_price=380.0,
            ma_5=375.0,
            ma_20=370.0,
            rsi=65.5,
            macd=2.5
        )
        assert stock.ma_5 == 375.0
        assert stock.rsi == 65.5
        results.append(TestResult("StockData技术指标", True, "技术指标字段正确"))
    except Exception as e:
        results.append(TestResult("StockData技术指标", False, str(e)))

    # 测试 Position 模型
    try:
        position = Position(
            symbol="AAPL",
            quantity=100,
            avg_cost=150.0,
            current_price=175.50,
            market_value=17550.0,
            unrealized_pnl=2550.0,
            unrealized_pnl_percent=17.0
        )
        assert position.symbol == "AAPL"
        assert position.market_value == 17550.0
        results.append(TestResult("Position模型", True, "持仓数据验证通过"))
    except Exception as e:
        results.append(TestResult("Position模型", False, str(e)))

    # 测试 AccountInfo 模型
    try:
        account = AccountInfo(
            account_id="acc_123",
            user_id="user_456",
            total_balance=100000.0,
            available_cash=50000.0,
            total_market_value=50000.0,
            total_unrealized_pnl=5000.0,
            total_unrealized_pnl_percent=10.0,
            risk_tolerance="medium",
            trading_strategy="balanced"
        )
        assert account.account_id == "acc_123"
        assert account.available_cash == 50000.0
        results.append(TestResult("AccountInfo模型", True, "账户信息验证通过"))
    except Exception as e:
        results.append(TestResult("AccountInfo模型", False, str(e)))

    # 测试 DecisionRequest 模型
    try:
        request = DecisionRequest(
            account_info=account,
            positions=[position],
            stock_data=[stock],
            ai_provider=AIProvider.OPENAI,
            model_name="gpt-4-turbo-preview"
        )
        assert request.ai_provider == AIProvider.OPENAI
        assert len(request.positions) == 1
        results.append(TestResult("DecisionRequest模型", True, "决策请求验证通过"))
    except Exception as e:
        results.append(TestResult("DecisionRequest模型", False, str(e)))

    return results


def test_prompts():
    """测试提示词模板"""
    results = []

    # 测试 BasePrompts 格式化方法
    try:
        stock = StockData(
            symbol="AAPL",
            name="Apple Inc.",
            current_price=175.50,
            volume=1000000,
            change=2.5,
            change_percent=1.45,
            pe_ratio=28.5
        )
        formatted = BasePrompts.format_stock_data(stock)
        assert "AAPL" in formatted
        assert "175.50" in formatted
        results.append(TestResult("BasePrompts.format_stock_data", True, "股票数据格式化正确"))
    except Exception as e:
        results.append(TestResult("BasePrompts.format_stock_data", False, str(e)))

    # 测试持仓格式化
    try:
        position = Position(
            symbol="AAPL",
            quantity=100,
            avg_cost=150.0,
            current_price=175.50,
            market_value=17550.0,
            unrealized_pnl=2550.0,
            unrealized_pnl_percent=17.0
        )
        formatted = BasePrompts.format_position(position)
        assert "AAPL" in formatted
        assert "100" in formatted
        results.append(TestResult("BasePrompts.format_position", True, "持仓数据格式化正确"))
    except Exception as e:
        results.append(TestResult("BasePrompts.format_position", False, str(e)))

    # 测试账户信息格式化
    try:
        account = AccountInfo(
            account_id="acc_123",
            user_id="user_456",
            total_balance=100000.0,
            available_cash=50000.0,
            total_market_value=50000.0,
            total_unrealized_pnl=5000.0,
            total_unrealized_pnl_percent=10.0
        )
        formatted = BasePrompts.format_account_info(account)
        assert "100000" in formatted or "100,000" in formatted
        results.append(TestResult("BasePrompts.format_account_info", True, "账户信息格式化正确"))
    except Exception as e:
        results.append(TestResult("BasePrompts.format_account_info", False, str(e)))

    # 测试系统提示词
    try:
        system_prompt = BasePrompts.get_system_prompt()
        assert len(system_prompt) > 0
        assert "股票交易" in system_prompt or "交易" in system_prompt
        results.append(TestResult("BasePrompts.get_system_prompt", True, "系统提示词生成正确"))
    except Exception as e:
        results.append(TestResult("BasePrompts.get_system_prompt", False, str(e)))

    # 测试交易约束提示词
    try:
        constraints = {"max_position_size": 100000, "min_trade_amount": 1000}
        constraints_prompt = BasePrompts.get_trading_constraints_prompt(constraints)
        assert len(constraints_prompt) > 0
        results.append(TestResult("BasePrompts.get_trading_constraints_prompt", True, "约束提示词生成正确"))
    except Exception as e:
        results.append(TestResult("BasePrompts.get_trading_constraints_prompt", False, str(e)))

    # 测试交易决策提示词生成
    try:
        request = DecisionRequest(
            account_info=account,
            positions=[position],
            stock_data=[stock],
            ai_provider=AIProvider.OPENAI
        )
        decision_prompt = TradingPrompts.create_decision_prompt(request)
        assert len(decision_prompt) > 100
        assert "账户信息" in decision_prompt or "Account" in decision_prompt
        results.append(TestResult("TradingPrompts.create_decision_prompt", True, "决策提示词生成正确"))
    except Exception as e:
        results.append(TestResult("TradingPrompts.create_decision_prompt", False, str(e)))

    # 测试股票分析提示词
    try:
        analysis_prompt = TradingPrompts.create_analysis_prompt(stock)
        assert len(analysis_prompt) > 50
        results.append(TestResult("TradingPrompts.create_analysis_prompt", True, "分析提示词生成正确"))
    except Exception as e:
        results.append(TestResult("TradingPrompts.create_analysis_prompt", False, str(e)))

    # 测试风险评估提示词
    try:
        risk_prompt = TradingPrompts.create_risk_assessment_prompt(account, [position], [stock])
        assert len(risk_prompt) > 50
        results.append(TestResult("TradingPrompts.create_risk_assessment_prompt", True, "风险评估提示词生成正确"))
    except Exception as e:
        results.append(TestResult("TradingPrompts.create_risk_assessment_prompt", False, str(e)))

    return results


def test_config():
    """测试配置"""
    results = []

    # 测试基本配置加载
    try:
        assert settings.HOST is not None
        assert settings.PORT is not None
        assert settings.DEFAULT_MODEL is not None
        results.append(TestResult("Settings基本配置", True, f"HOST={settings.HOST}, PORT={settings.PORT}"))
    except Exception as e:
        results.append(TestResult("Settings基本配置", False, str(e)))

    # 测试AI提供商配置
    try:
        providers_configured = []
        if settings.OPENAI_API_KEY:
            providers_configured.append("OpenAI")
        if settings.DEEPSEEK_API_KEY:
            providers_configured.append("DeepSeek")
        if settings.ANTHROPIC_API_KEY:
            providers_configured.append("Claude")
        if settings.GLM_API_KEY:
            providers_configured.append("GLM")
        if settings.QWEN_API_KEY:
            providers_configured.append("Qwen")

        results.append(TestResult("AI提供商配置", True, f"已配置: {', '.join(providers_configured) or '无'}"))
    except Exception as e:
        results.append(TestResult("AI提供商配置", False, str(e)))

    # 测试交易参数配置
    try:
        assert settings.MAX_POSITION_SIZE > 0
        assert settings.MIN_TRADE_AMOUNT > 0
        results.append(TestResult("交易参数配置", True,
            f"MAX_POSITION_SIZE={settings.MAX_POSITION_SIZE}, MIN_TRADE_AMOUNT={settings.MIN_TRADE_AMOUNT}"))
    except Exception as e:
        results.append(TestResult("交易参数配置", False, str(e)))

    return results


async def test_adapters():
    """测试适配器"""
    results = []

    # 测试适配器工厂 - OpenAI
    try:
        adapter = await AdapterFactory.get_adapter(AIProvider.OPENAI)
        assert adapter is not None
        assert adapter.provider == AIProvider.OPENAI
        assert adapter.is_initialized
        results.append(TestResult("AdapterFactory.get_adapter(OPENAI)", True, "OpenAI适配器初始化成功"))
    except Exception as e:
        results.append(TestResult("AdapterFactory.get_adapter(OPENAI)", False, str(e)))

    # 测试适配器工厂 - DeepSeek
    try:
        adapter = await AdapterFactory.get_adapter(AIProvider.DEEPSEEK)
        assert adapter is not None
        assert adapter.provider == AIProvider.DEEPSEEK
        assert adapter.is_initialized
        results.append(TestResult("AdapterFactory.get_adapter(DEEPSEEK)", True, "DeepSeek适配器初始化成功"))
    except Exception as e:
        results.append(TestResult("AdapterFactory.get_adapter(DEEPSEEK)", False, str(e)))

    # 测试适配器工厂 - Claude
    try:
        adapter = await AdapterFactory.get_adapter(AIProvider.CLAUDE)
        assert adapter is not None
        assert adapter.provider == AIProvider.CLAUDE
        assert adapter.is_initialized
        results.append(TestResult("AdapterFactory.get_adapter(CLAUDE)", True, "Claude适配器初始化成功"))
    except Exception as e:
        results.append(TestResult("AdapterFactory.get_adapter(CLAUDE)", False, str(e)))

    # 测试适配器工厂 - GLM
    try:
        adapter = await AdapterFactory.get_adapter(AIProvider.GLM)
        assert adapter is not None
        assert adapter.provider == AIProvider.GLM
        assert adapter.is_initialized
        results.append(TestResult("AdapterFactory.get_adapter(GLM)", True, "GLM适配器初始化成功"))
    except Exception as e:
        results.append(TestResult("AdapterFactory.get_adapter(GLM)", False, str(e)))

    # 测试模型信息获取
    try:
        adapter = await AdapterFactory.get_adapter(AIProvider.OPENAI)
        model_info = adapter.get_model_info("gpt-4-turbo-preview")
        assert model_info["supported"] == True
        results.append(TestResult("Adapter.get_model_info", True, "模型信息获取正确"))
    except Exception as e:
        results.append(TestResult("Adapter.get_model_info", False, str(e)))

    # 测试成本计算
    try:
        adapter = await AdapterFactory.get_adapter(AIProvider.OPENAI)
        cost = adapter.calculate_cost(1000, "gpt-4-turbo-preview")
        assert cost is not None
        assert cost > 0
        results.append(TestResult("Adapter.calculate_cost", True, f"成本计算正确: ${cost:.6f}"))
    except Exception as e:
        results.append(TestResult("Adapter.calculate_cost", False, str(e)))

    return results


def test_exceptions():
    """测试异常处理"""
    results = []

    from ai_service.core.exceptions import (
        AIError, ModelError, ProviderError, ValidationError,
        RateLimitError, CacheError, DecisionError
    )

    # 测试基础异常
    try:
        error = AIError("Test error", "TEST_CODE")
        assert error.message == "Test error"
        assert error.error_code == "TEST_CODE"
        results.append(TestResult("AIError基础异常", True, "异常创建正确"))
    except Exception as e:
        results.append(TestResult("AIError基础异常", False, str(e)))

    # 测试ModelError
    try:
        error = ModelError("Model failed", "MODEL_FAIL")
        assert isinstance(error, AIError)
        results.append(TestResult("ModelError", True, "模型错误继承正确"))
    except Exception as e:
        results.append(TestResult("ModelError", False, str(e)))

    # 测试ValidationError
    try:
        error = ValidationError("Invalid data", "INVALID_DATA", {"field": "value"})
        assert error.details == {"field": "value"}
        results.append(TestResult("ValidationError", True, "验证错误详情正确"))
    except Exception as e:
        results.append(TestResult("ValidationError", False, str(e)))

    return results


async def test_api_endpoints():
    """测试API端点 (通过HTTP请求)"""
    results = []

    import httpx

    base_url = "http://localhost:8000"

    # 测试健康检查
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{base_url}/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            results.append(TestResult("API /health", True, "健康检查通过"))
    except Exception as e:
        results.append(TestResult("API /health", False, str(e)))

    # 测试API根路径
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{base_url}/api/v1/")
            assert response.status_code == 200
            data = response.json()
            assert "service" in data
            results.append(TestResult("API /api/v1/", True, "API根路径正常"))
    except Exception as e:
        results.append(TestResult("API /api/v1/", False, str(e)))

    # 测试提供商列表
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{base_url}/api/v1/decision/providers")
            assert response.status_code == 200
            data = response.json()
            assert "providers" in data
            assert len(data["providers"]) > 0
            enabled_providers = [p for p in data["providers"] if p["enabled"]]
            results.append(TestResult("API /decision/providers", True,
                f"提供商列表正常，已启用: {len(enabled_providers)}个"))
    except Exception as e:
        results.append(TestResult("API /decision/providers", False, str(e)))

    # 测试决策服务健康检查
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{base_url}/api/v1/decision/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] in ["healthy", "degraded"]
            results.append(TestResult("API /decision/health", True, f"决策服务状态: {data['status']}"))
    except Exception as e:
        results.append(TestResult("API /decision/health", False, str(e)))

    return results


async def main():
    """主测试函数"""
    print("="*80)
    print("AI Service 综合功能测试")
    print("="*80)
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    tester = AIServiceTester()

    # 1. 测试数据模型
    print("\n📋 测试1: 数据模型 (Schemas)")
    print("-" * 40)
    results = test_schemas_models()
    for result in results:
        tester.add_result(result)
        print(f"  {result}")

    # 2. 测试提示词模板
    print("\n📝 测试2: 提示词模板 (Prompts)")
    print("-" * 40)
    results = test_prompts()
    for result in results:
        tester.add_result(result)
        print(f"  {result}")

    # 3. 测试配置
    print("\n⚙️ 测试3: 配置 (Config)")
    print("-" * 40)
    results = test_config()
    for result in results:
        tester.add_result(result)
        print(f"  {result}")

    # 4. 测试适配器
    print("\n🔌 测试4: AI适配器 (Adapters)")
    print("-" * 40)
    results = await test_adapters()
    for result in results:
        tester.add_result(result)
        print(f"  {result}")

    # 5. 测试异常
    print("\n⚠️ 测试5: 异常处理 (Exceptions)")
    print("-" * 40)
    results = test_exceptions()
    for result in results:
        tester.add_result(result)
        print(f"  {result}")

    # 6. 测试API端点
    print("\n🌐 测试6: API端点 (API Endpoints)")
    print("-" * 40)
    results = await test_api_endpoints()
    for result in results:
        tester.add_result(result)
        print(f"  {result}")

    # 打印总结
    tester.print_summary()

    # 保存测试报告
    report = {
        "timestamp": datetime.now().isoformat(),
        "total_tests": tester.test_count,
        "passed": tester.pass_count,
        "failed": tester.test_count - tester.pass_count,
        "pass_rate": tester.pass_count / tester.test_count * 100 if tester.test_count > 0 else 0,
        "results": [
            {
                "name": r.name,
                "passed": r.passed,
                "message": r.message,
                "details": r.details
            }
            for r in tester.results
        ]
    }

    with open("/home/fe-jerome/projects/stock-race/ai-service/test_report_comprehensive.json", "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print("\n📄 测试报告已保存到: test_report_comprehensive.json")

    return tester.pass_count == tester.test_count


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
