/**
 * [T-015] TradeValidator 单元测试
 *
 * 测试内容:
 * - 交易前综合校验
 * - 价格限制校验
 * - 资金/持仓校验
 * - 市场状态校验
 * - 错误信息聚合
 */

const { expect } = require('chai');
const sinon = require('sinon');
const TradeValidator = require('../../../src/services/TradeValidator');
const TradingRulesEngine = require('../../../src/services/TradingRulesEngine');

describe('TradeValidator', () => {
  let validator;
  let rulesEngineStub;
  let stockStateCacheStub;
  let portfolioServiceStub;

  beforeEach(() => {
    rulesEngineStub = {
      getTradingRestrictions: sinon.stub(),
      validateTradingTime: sinon.stub(),
      validateQuantity: sinon.stub()
    };

    stockStateCacheStub = {
      getStockState: sinon.stub()
    };

    portfolioServiceStub = {
      getBalance: sinon.stub(),
      getPosition: sinon.stub()
    };

    validator = new TradeValidator({
      rulesEngine: rulesEngineStub,
      stockStateCache: stockStateCacheStub,
      portfolioService: portfolioServiceStub
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('买入交易校验', () => {
    it('应该通过有效的买入交易', async () => {
      const decision = {
        action: 'buy',
        symbol: '000001',
        quantity: 100,
        price: 10.50
      };

      stockStateCacheStub.getStockState.resolves({
        symbol: '000001',
        market: 'SZ',
        isSuspended: false,
        isST: false,
        lastPrice: 10.00,
        priceLimits: { upper: 11.00, lower: 9.00 }
      });

      rulesEngineStub.getTradingRestrictions.returns({
        tradable: true,
        priceLimits: { upper: 11.00, lower: 9.00 },
        minQuantity: 100
      });

      rulesEngineStub.validateTradingTime.returns({ valid: true });
      rulesEngineStub.validateQuantity.returns({ valid: true });

      portfolioServiceStub.getBalance.resolves(10000);

      const result = await validator.validateTrade(decision, 'acc-123');

      expect(result.valid).to.be.true;
      expect(result.errors).to.have.length(0);
    });

    it('应该拒绝价格超出涨停限制的买入', async () => {
      const decision = {
        action: 'buy',
        symbol: '000001',
        quantity: 100,
        price: 12.00 // 超出11.00涨停价
      };

      stockStateCacheStub.getStockState.resolves({
        symbol: '000001',
        market: 'SZ',
        lastPrice: 10.00,
        priceLimits: { upper: 11.00, lower: 9.00 }
      });

      rulesEngineStub.getTradingRestrictions.returns({
        tradable: true,
        priceLimits: { upper: 11.00, lower: 9.00 },
        minQuantity: 100
      });

      portfolioServiceStub.getBalance.resolves(10000);

      const result = await validator.validateTrade(decision, 'acc-123');

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('买入价格超出涨停限制');
    });

    it('应该拒绝资金不足的买入', async () => {
      const decision = {
        action: 'buy',
        symbol: '000001',
        quantity: 1000,
        price: 10.00 // 需要10000元
      };

      stockStateCacheStub.getStockState.resolves({
        symbol: '000001',
        market: 'SZ',
        lastPrice: 10.00,
        priceLimits: { upper: 11.00, lower: 9.00 }
      });

      rulesEngineStub.getTradingRestrictions.returns({
        tradable: true,
        priceLimits: { upper: 11.00, lower: 9.00 },
        minQuantity: 100
      });

      portfolioServiceStub.getBalance.resolves(5000); // 只有5000元

      const result = await validator.validateTrade(decision, 'acc-123');

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('资金不足');
    });

    it('应该拒绝停牌股票的买入', async () => {
      const decision = {
        action: 'buy',
        symbol: '000001',
        quantity: 100,
        price: 10.00
      };

      stockStateCacheStub.getStockState.resolves({
        symbol: '000001',
        isSuspended: true
      });

      rulesEngineStub.getTradingRestrictions.returns({
        tradable: false,
        reason: '股票已停牌'
      });

      const result = await validator.validateTrade(decision, 'acc-123');

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('股票已停牌');
    });
  });

  describe('卖出交易校验', () => {
    it('应该通过有效的卖出交易', async () => {
      const decision = {
        action: 'sell',
        symbol: '000001',
        quantity: 100,
        price: 10.50
      };

      stockStateCacheStub.getStockState.resolves({
        symbol: '000001',
        market: 'SZ',
        isSuspended: false,
        lastPrice: 10.00,
        priceLimits: { upper: 11.00, lower: 9.00 }
      });

      rulesEngineStub.getTradingRestrictions.returns({
        tradable: true,
        priceLimits: { upper: 11.00, lower: 9.00 },
        minQuantity: 100
      });

      portfolioServiceStub.getPosition.resolves({ quantity: 500 }); // 持有500股

      const result = await validator.validateTrade(decision, 'acc-123');

      expect(result.valid).to.be.true;
    });

    it('应该拒绝持仓不足的卖出', async () => {
      const decision = {
        action: 'sell',
        symbol: '000001',
        quantity: 1000,
        price: 10.00
      };

      stockStateCacheStub.getStockState.resolves({
        symbol: '000001',
        market: 'SZ',
        isSuspended: false,
        lastPrice: 10.00,
        priceLimits: { upper: 11.00, lower: 9.00 }
      });

      rulesEngineStub.getTradingRestrictions.returns({
        tradable: true,
        priceLimits: { upper: 11.00, lower: 9.00 },
        minQuantity: 100
      });

      portfolioServiceStub.getPosition.resolves({ quantity: 500 }); // 只有500股

      const result = await validator.validateTrade(decision, 'acc-123');

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('持仓不足');
    });

    it('应该拒绝未持仓股票的卖出', async () => {
      const decision = {
        action: 'sell',
        symbol: '000001',
        quantity: 100,
        price: 10.00
      };

      stockStateCacheStub.getStockState.resolves({
        symbol: '000001',
        market: 'SZ',
        isSuspended: false,
        lastPrice: 10.00,
        priceLimits: { upper: 11.00, lower: 9.00 }
      });

      rulesEngineStub.getTradingRestrictions.returns({
        tradable: true,
        priceLimits: { upper: 11.00, lower: 9.00 },
        minQuantity: 100
      });

      portfolioServiceStub.getPosition.resolves(null); // 未持仓

      const result = await validator.validateTrade(decision, 'acc-123');

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('未持有该股票');
    });

    it('应该拒绝价格低于跌停限制的卖出', async () => {
      const decision = {
        action: 'sell',
        symbol: '000001',
        quantity: 100,
        price: 8.00 // 低于9.00跌停价
      };

      stockStateCacheStub.getStockState.resolves({
        symbol: '000001',
        market: 'SZ',
        lastPrice: 10.00,
        priceLimits: { upper: 11.00, lower: 9.00 }
      });

      rulesEngineStub.getTradingRestrictions.returns({
        tradable: true,
        priceLimits: { upper: 11.00, lower: 9.00 },
        minQuantity: 100
      });

      portfolioServiceStub.getPosition.resolves({ quantity: 500 });

      const result = await validator.validateTrade(decision, 'acc-123');

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('卖出价格低于跌停限制');
    });
  });

  describe('错误信息聚合', () => {
    it('应该返回所有校验错误', async () => {
      const decision = {
        action: 'buy',
        symbol: '000001',
        quantity: 50, // 数量不足
        price: 12.00  // 价格超限
      };

      stockStateCacheStub.getStockState.resolves({
        symbol: '000001',
        market: 'SZ',
        lastPrice: 10.00,
        priceLimits: { upper: 11.00, lower: 9.00 }
      });

      rulesEngineStub.getTradingRestrictions.returns({
        tradable: true,
        priceLimits: { upper: 11.00, lower: 9.00 },
        minQuantity: 100
      });

      rulesEngineStub.validateQuantity.returns({
        valid: false,
        error: '交易数量不足100股'
      });

      portfolioServiceStub.getBalance.resolves(10000);

      const result = await validator.validateTrade(decision, 'acc-123');

      expect(result.valid).to.be.false;
      expect(result.errors).to.have.length.at.least(2);
      expect(result.errors).to.include('交易数量不足100股');
      expect(result.errors).to.include('买入价格超出涨停限制');
    });
  });

  describe('持仓决策校验', () => {
    it('应该接受持仓决策（无需额外校验）', async () => {
      const decision = {
        action: 'hold',
        symbol: '000001',
        quantity: 0,
        price: 0
      };

      const result = await validator.validateTrade(decision, 'acc-123');

      expect(result.valid).to.be.true;
    });
  });
});
