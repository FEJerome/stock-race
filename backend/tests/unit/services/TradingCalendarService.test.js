/**
 * [T-014] TradingCalendarService 单元测试
 *
 * 测试内容:
 * - 交易日判断
 * - 下一个交易日计算
 * - 节假日处理
 * - 调休处理
 * - 半日市处理
 * - 日历数据导入
 */

import { expect, jest, describe, it, beforeEach, afterEach } from '@jest/globals';
import TradingCalendarService from '../../../src/services/TradingCalendarService.js';

describe('TradingCalendarService', () => {
  let service;
  let dbStub;
  let fsStub;

  const mockCalendar2026 = {
    year: 2026,
    tradingDays: [
      '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
      '2026-02-05', '2026-02-06', // 春节后
      '2026-02-14', '2026-02-15'  // 春节调休周末
    ],
    holidays: [
      { date: '2026-01-01', name: '元旦' },
      { date: '2026-01-02', name: '元旦' },
      { date: '2026-02-16', name: '春节', tradingDays: ['2026-02-14', '2026-02-15'] },
      { date: '2026-02-17', name: '春节' },
      { date: '2026-02-18', name: '春节' },
      { date: '2026-02-19', name: '春节' },
      { date: '2026-02-20', name: '春节' }
    ],
    halfDays: [
      { date: '2026-12-31', closeTime: '12:00' }
    ]
  };

  beforeEach(() => {
    dbStub = {
      query: jest.fn()
    };

    service = new TradingCalendarService({ db: dbStub });
    service.calendarData = mockCalendar2026;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('交易日判断', () => {
    it('应该正确识别交易日', async () => {
      const result = await service.isTradingDay('2026-01-05');
      expect(result).toBe(true);
    });

    it('应该正确识别非交易日（周末）', async () => {
      // 2026-01-03 是周六
      const result = await service.isTradingDay('2026-01-03');
      expect(result).toBe(false);
    });

    it('应该正确识别节假日', async () => {
      const result = await service.isTradingDay('2026-01-01'); // 元旦
      expect(result).toBe(false);
    });

    it('应该正确识别春节休市', async () => {
      const result = await service.isTradingDay('2026-02-17'); // 春节
      expect(result).toBe(false);
    });

    it('应该正确识别调休交易日（周末上班）', async () => {
      // 2026-02-14 是周六，但春节调休上班
      const result = await service.isTradingDay('2026-02-14');
      expect(result).toBe(true);
    });
  });

  describe('下一个交易日计算', () => {
    it('应该返回下一个交易日', async () => {
      const nextDay = await service.getNextTradingDay('2026-01-05');
      expect(nextDay).toBe('2026-01-06');
    });

    it('应该跳过周末', async () => {
      // 2026-01-09 是周五
      const nextDay = await service.getNextTradingDay('2026-01-09');
      // 跳过周末，返回下周一
      expect(nextDay).toBe('2026-01-12');
    });

    it('应该跳过节假日', async () => {
      // 2026-02-05 是春节后第一个交易日
      const nextDay = await service.getNextTradingDay('2026-02-05');
      expect(nextDay).toBe('2026-02-06');
    });

    it('应该处理跨节假日的情况', async () => {
      // 2026-02-04 是春节前最后一个交易日
      const nextDay = await service.getNextTradingDay('2026-02-04');
      // 跳过春节假期，返回 2026-02-05
      expect(nextDay).toBe('2026-02-05');
    });

    it('应该支持获取第N个交易日', async () => {
      const fifthDay = await service.getNextTradingDay('2026-01-05', 5);
      // 1/5, 1/6, 1/7, 1/8, 1/9 -> 第5个交易日是 1/12 (跳过周末)
      expect(fifthDay).toBe('2026-01-12');
    });
  });

  describe('交易时间判断', () => {
    it('应该正确识别交易时间（上午）', async () => {
      const result = await service.isTradingTime('2026-01-05', '10:30');
      expect(result.valid).toBe(true);
      expect(result.phase).toBe('continuous');
    });

    it('应该正确识别交易时间（下午）', async () => {
      const result = await service.isTradingTime('2026-01-05', '14:30');
      expect(result.valid).toBe(true);
    });

    it('应该拒绝午休时间', async () => {
      const result = await service.isTradingTime('2026-01-05', '12:00');
      expect(result.valid).toBe(false);
    });

    it('应该拒绝非交易日的时间', async () => {
      const result = await service.isTradingTime('2026-01-01', '10:00');
      expect(result.valid).toBe(false);
      expect(result.reason).to.include('非交易日');
    });

    it('应该识别集合竞价时间', async () => {
      const result = await service.isTradingTime('2026-01-05', '09:20');
      expect(result.valid).toBe(true);
      expect(result.phase).toBe('auction');
    });

    it('应该识别半日市的提前收盘', async () => {
      const result = await service.isTradingTime('2026-12-31', '13:00');
      expect(result.valid).toBe(false);
      expect(result.reason).to.include('半日市');
    });
  });

  describe('月度交易日查询', () => {
    it('应该返回指定月份的所有交易日', async () => {
      const days = await service.getTradingDaysOfMonth(2026, 1);

      expect(days).to.be.an('array');
      expect(days.length).toBeGreaterThan(15); // 1月通常有20+交易日
      expect(days).to.include('2026-01-05');
      expect(days).to.not.include('2026-01-01'); // 元旦
      expect(days).to.not.include('2026-01-03'); // 周末
    });

    it('应该正确处理有春节的2月', async () => {
      const days = await service.getTradingDaysOfMonth(2026, 2);

      expect(days).to.include('2026-02-05'); // 春节后
      expect(days).to.include('2026-02-14'); // 调休
      expect(days).to.include('2026-02-15'); // 调休
      expect(days).to.not.include('2026-02-16'); // 春节
      expect(days).to.not.include('2026-02-17'); // 春节
    });
  });

  describe('日历数据管理', () => {
    it('应该从文件加载日历数据', async () => {
      const loadCalendar = sinon.stub(service, 'loadCalendarFromFile').resolves(mockCalendar2026);

      await service.loadCalendar(2026);

      expect(loadCalendar.toHaveBeenCalledWith(2026)).toBe(true);
      expect(service.calendarData).toEqual(mockCalendar2026);
    });

    it('应该从数据库加载日历数据', async () => {
      dbStub.query.resolves({
        rows: [
          { trade_date: '2026-01-05', is_trading_day: true },
          { trade_date: '2026-01-01', is_trading_day: false, description: '元旦' }
        ]
      });

      const result = await service.loadCalendarFromDB(2026);

      expect(result.tradingDays).to.include('2026-01-05');
      expect(result.holidays).to.have.length.greaterThan(0);
    });
  });

  describe('管理员导入功能', () => {
    it('应该支持CSV格式导入', async () => {
      const csvData = `date,is_trading_day,open_time,close_time,description
2026-01-01,false,,,元旦
2026-01-05,true,09:30,15:00,
2026-02-14,true,09:30,15:00,春节调休
2026-02-16,false,,,春节`;

      const result = await service.importCalendarFromCSV(csvData, 2026);

      expect(result.success).toBe(true);
      expect(result.imported).toBe(4);
      expect(dbStub.query.callCount).toBeGreaterThan(0);
    });

    it('应该验证导入数据的日期格式', async () => {
      const invalidCSV = `date,is_trading_day
invalid-date,true`;

      try {
        await service.importCalendarFromCSV(invalidCSV, 2026);
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.include('日期格式');
      }
    });

    it('应该支持预览模式（不实际导入）', async () => {
      const csvData = `date,is_trading_day,description
2026-01-01,false,元旦`;

      const result = await service.importCalendarFromCSV(csvData, 2026, { preview: true });

      expect(result.preview).toBe(true);
      expect(result.wouldImport).toBe(1);
      expect(dbStub.query.toHaveBeenCalled()).toBe(false); // 不应该写入数据库
    });

    it('应该处理重复导入的情况', async () => {
      dbStub.query.rejects(new Error('duplicate key value'));

      const csvData = `date,is_trading_day
2026-01-01,false`;

      const result = await service.importCalendarFromCSV(csvData, 2026, { onDuplicate: 'skip' });

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(1);
    });
  });

  describe('缓存机制', () => {
    it('应该缓存日历查询结果', async () => {
      // 第一次查询
      await service.isTradingDay('2026-01-05');

      // 第二次查询应该使用缓存
      const result = await service.isTradingDay('2026-01-05');

      expect(result).toBe(true);
    });

    it('应该在导入新数据后清除缓存', async () => {
      // 先查询一次建立缓存
      await service.isTradingDay('2026-01-05');

      // 导入新数据
      await service.importCalendarFromCSV('...', 2026);

      // 缓存应该被清除
      expect(service.cache).to.be.empty;
    });
  });
});
