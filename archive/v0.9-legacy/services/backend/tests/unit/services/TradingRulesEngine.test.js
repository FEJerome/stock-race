/**
 * [T-015] TradingRulesEngine 单元测试
 *
 * 测试内容:
 * - 各市场类型规则解析（主板/创业板/科创板/北交所）
 * - 特殊规则处理（ST/停牌/新股）
 * - 涨跌停价格计算
 * - 最小交易单位验证
 * - 交易时间验证
 */

import { jest, describe, it, expect } from '@jest/globals';
import { TradingRulesEngine } from '../../../src/services/TradingRulesEngine.js';

describe('TradingRulesEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new TradingRulesEngine();
  });

  describe('市场规则解析', () => {
    it('应该正确返回上海主板规则', () => {
      const rules = engine.getMarketRules('SH');

      expect(rules).toMatchObject({
        priceLimit: 0.10,
        minQuantity: 100,
        maxQuantityPerOrder: 1000000,
        tradingHours: [
          { start: '09:30', end: '11:30' },
          { start: '13:00', end: '15:00' }
        ]
      });
    });

    it('应该正确返回深圳主板规则', () => {
      const rules = engine.getMarketRules('SZ');

      expect(rules.priceLimit).toBe(0.10);
      expect(rules.minQuantity).toBe(100);
    });

    it('应该正确返回创业板规则（20%涨跌幅）', () => {
      const rules = engine.getMarketRules('CYB');

      expect(rules.priceLimit).toBe(0.20);
      expect(rules.minQuantity).toBe(100);
    });

    it('应该正确返回科创板规则（200股起）', () => {
      const rules = engine.getMarketRules('KCB');

      expect(rules.priceLimit).toBe(0.20);
      expect(rules.minQuantity).toBe(200);
    });

    it('应该正确返回北交所规则（30%涨跌幅）', () => {
      const rules = engine.getMarketRules('BJ');

      expect(rules.priceLimit).toBe(0.30);
      expect(rules.minQuantity).toBe(100);
    });

    it('对未知市场应该返回默认规则', () => {
      const rules = engine.getMarketRules('UNKNOWN');

      expect(rules).toHaveProperty('priceLimit');
      expect(rules).toHaveProperty('minQuantity');
    });
  });

  describe('特殊规则处理', () => {
    it('应该正确返回ST股票规则（5%涨跌停）', () => {
      const specialRules = engine.getSpecialRules('ST');

      expect(specialRules.priceLimit).toBe(0.05);
    });

    it('应该正确返回新股首日规则（无涨跌幅限制）', () => {
      const specialRules = engine.getSpecialRules('STAR');

      expect(specialRules.priceLimit).toBeNull();
    });

    it('应该正确返回停牌规则（不可交易）', () => {
      const specialRules = engine.getSpecialRules('SUSPENDED');

      expect(specialRules.tradable).toBe(false);
    });

    it('应该支持多种特殊规则组合', () => {
      const stockState = {
        market: 'SH',
        isST: true,
        isSuspended: false,
        isFirstDay: false
      };

      const effectiveRules = engine.getEffectiveRules(stockState);

      expect(effectiveRules.priceLimit).toBe(0.05); // ST规则覆盖
      expect(effectiveRules.minQuantity).toBe(100); // 主板规则
    });
  });

  describe('涨跌停价格计算', () => {
    it('应该正确计算主板10%涨跌停价格', () => {
      const limits = engine.calculatePriceLimits(10.00, 'SH', {});

      expect(limits.upper).toBeCloseTo(11.00, 0.01);
      expect(limits.lower).toBeCloseTo(9.00, 0.01);
    });

    it('应该正确计算创业板20%涨跌停价格', () => {
      const limits = engine.calculatePriceLimits(10.00, 'CYB', {});

      expect(limits.upper).toBeCloseTo(12.00, 0.01);
      expect(limits.lower).toBeCloseTo(8.00, 0.01);
    });

    it('应该正确计算ST股票5%涨跌停价格', () => {
      const limits = engine.calculatePriceLimits(10.00, 'SH', { isST: true });

      expect(limits.upper).toBeCloseTo(10.50, 0.01);
      expect(limits.lower).toBeCloseTo(9.50, 0.01);
    });

    it('新股首日应该无涨跌幅限制', () => {
      const limits = engine.calculatePriceLimits(10.00, 'SH', { isFirstDay: true });

      expect(limits.upper).toBeNull();
      expect(limits.lower).toBeNull();
    });

    it('应该正确处理价格四舍五入（分位）', () => {
      const limits = engine.calculatePriceLimits(10.05, 'SH', {});

      // 10.05 * 1.10 = 11.055 -> 11.06
      expect(limits.upper).toBe(11.06);
      // 10.05 * 0.90 = 9.045 -> 9.05 (四舍五入)
      expect(limits.lower).toBe(9.05);
    });
  });

  describe('交易数量验证', () => {
    it('应该验证主板最小100股', () => {
      const result = engine.validateQuantity(100, 'SH', {});

      expect(result.valid).toBe(true);
    });

    it('应该拒绝主板小于100股的交易', () => {
      const result = engine.validateQuantity(50, 'SH', {});

      expect(result.valid).toBe(false);
      expect(result.error).toContain('100');
    });

    it('应该验证科创板最小200股', () => {
      const result200 = engine.validateQuantity(200, 'KCB', {});
      const result100 = engine.validateQuantity(100, 'KCB', {});

      expect(result200.valid).toBe(true);
      expect(result100.valid).toBe(false);
    });

    it('应该验证科创板200股后递增100股', () => {
      const result300 = engine.validateQuantity(300, 'KCB', {});
      const result250 = engine.validateQuantity(250, 'KCB', {});

      expect(result300.valid).toBe(true);
      expect(result250.valid).toBe(false);
    });

    it('应该拒绝超过最大单笔数量的交易', () => {
      const result = engine.validateQuantity(2000000, 'SH', {});

      expect(result.valid).toBe(false);
      expect(result.error).toContain('不能超过');
    });
  });

  describe('交易时间验证', () => {
    it('应该接受开盘时间内的交易', () => {
      const result = engine.validateTradingTime('10:00', 'SH');

      expect(result.valid).toBe(true);
    });

    it('应该接受下午交易时间内的交易', () => {
      const result = engine.validateTradingTime('14:30', 'SH');

      expect(result.valid).toBe(true);
    });

    it('应该拒绝午休时间的交易', () => {
      const result = engine.validateTradingTime('12:00', 'SH');

      expect(result.valid).toBe(false);
    });

    it('应该拒绝开盘前的交易', () => {
      const result = engine.validateTradingTime('09:00', 'SH');

      expect(result.valid).toBe(false);
    });

    it('应该接受集合竞价时间（9:15-9:25）', () => {
      const result915 = engine.validateTradingTime('09:15', 'SH');
      const result920 = engine.validateTradingTime('09:20', 'SH');
      const result925 = engine.validateTradingTime('09:25', 'SH');

      expect(result915.valid && result915.phase).toBe('auction');
      expect(result920.valid && result920.phase).toBe('auction');
      expect(result925.valid && result925.phase).toBe('auction');
    });

    it('应该拒绝9:25-9:30的交易', () => {
      const result = engine.validateTradingTime('09:28', 'SH');

      expect(result.valid).toBe(false);
    });
  });

  describe('综合规则验证', () => {
    it('应该对正常股票返回完整的交易限制', () => {
      const stockState = {
        symbol: '000001',
        market: 'SZ',
        lastPrice: 10.50,
        isST: false,
        isSuspended: false,
        isFirstDay: false
      };

      const restrictions = engine.getTradingRestrictions(stockState);

      expect(restrictions).toHaveProperty('tradable', true);
      expect(restrictions).toHaveProperty('priceLimits');
      expect(restrictions.priceLimits.upper).toBeCloseTo(11.55, 0.01);
      expect(restrictions.priceLimits.lower).toBeCloseTo(9.45, 0.01);
      expect(restrictions).toHaveProperty('minQuantity', 100);
    });

    it('应该对停牌股票返回不可交易', () => {
      const stockState = {
        symbol: '000001',
        market: 'SZ',
        isSuspended: true
      };

      const restrictions = engine.getTradingRestrictions(stockState);

      expect(restrictions.tradable).toBe(false);
      expect(restrictions.reason).toContain('停牌');
    });
  });
});
