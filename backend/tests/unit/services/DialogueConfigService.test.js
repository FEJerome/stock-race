/**
 * DialogueConfigService 单元测试
 * 动态配置服务测试
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { DialogueConfigService } from '../../../src/services/DialogueConfigService.js';

describe('DialogueConfigService', () => {
  let configService;
  let mockRedis;
  let mockDb;

  beforeEach(() => {
    mockRedis = {
      get: sinon.stub(),
      setEx: sinon.stub().resolves(),
      del: sinon.stub().resolves(),
      keys: sinon.stub().resolves([])
    };

    mockDb = {
      query: sinon.stub().resolves({ rows: [] })
    };

    configService = new DialogueConfigService({
      redis: mockRedis,
      db: mockDb
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('初始化', () => {
    it('应该成功初始化服务', async () => {
      await configService.initialize();
      expect(configService.redis).to.equal(mockRedis);
    });
  });

  describe('获取配置', () => {
    it('应该从默认配置返回值', async () => {
      const maxRounds = await configService.getConfig('max_rounds');
      expect(maxRounds).to.equal(10);
    });

    it('应该从Redis缓存返回值', async () => {
      mockRedis.get.withArgs('config:dialogue:max_rounds').resolves(JSON.stringify({ value: 15 }));

      const value = await configService.getConfig('max_rounds');
      expect(value).to.equal(15);
    });

    it('应该从数据库返回值', async () => {
      mockRedis.get.resolves(null);
      mockDb.query.resolves({
        rows: [{ config_value: { value: 20 } }]
      });

      const value = await configService.getConfig('max_rounds');
      expect(value).to.equal(20);
    });

    it('应该缓存数据库值到Redis', async () => {
      mockRedis.get.resolves(null);
      mockDb.query.resolves({
        rows: [{ config_value: { value: 25 } }]
      });

      await configService.getConfig('max_rounds');
      expect(mockRedis.setEx.calledOnce).to.be.true;
    });

    it('无效配置键应该返回undefined', async () => {
      const value = await configService.getConfig('invalid_key');
      expect(value).to.be.undefined;
    });
  });

  describe('批量获取配置', () => {
    it('应该获取所有配置', async () => {
      const configs = await configService.getAllConfigs();

      expect(configs).to.have.property('max_rounds', 10);
      expect(configs).to.have.property('max_tokens_per_message', 2000);
      expect(configs).to.have.property('total_token_budget', 10000);
      expect(configs).to.have.property('session_expiry_hours', 24);
      expect(configs).to.have.property('enable_content_audit', true);
    });
  });

  describe('更新配置', () => {
    it('应该更新配置值', async () => {
      // 第一个查询返回旧值，第二个查询执行更新
      mockDb.query.onFirstCall().resolves({
        rows: [{ config_value: { value: 10 } }]
      });
      mockDb.query.resolves({ rows: [{ config_key: 'max_rounds' }] });

      const result = await configService.updateConfig('max_rounds', 15, 1, '测试更新');

      expect(result.success).to.be.true;
      expect(result.key).to.equal('max_rounds');
      expect(result.oldValue).to.equal(10);
      expect(result.newValue).to.equal(15);
    });

    it('无效配置键应该抛出错误', async () => {
      try {
        await configService.updateConfig('invalid_key', 'value', 1);
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.equal('INVALID_CONFIG_KEY');
      }
    });

    it('应该验证数值范围', async () => {
      try {
        await configService.updateConfig('max_rounds', 100, 1);
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.include('between 1 and 50');
      }
    });

    it('应该记录变更历史', async () => {
      // 第一个查询返回旧值，第二个执行更新，第三个记录历史
      mockDb.query.onFirstCall().resolves({
        rows: [{ config_value: { value: 10 } }]
      });
      mockDb.query.resolves({ rows: [{ config_key: 'max_rounds' }] });

      await configService.updateConfig('max_rounds', 12, 1, '增加轮数');

      expect(mockDb.query.callCount).to.be.at.least(2);
    });
  });

  describe('配置验证', () => {
    it('应该验证max_rounds范围', async () => {
      mockDb.query.resolves({ rows: [] });

      try {
        await configService.updateConfig('max_rounds', 0, 1);
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.include('between 1 and 50');
      }
    });

    it('应该验证max_tokens_per_message范围', async () => {
      mockDb.query.resolves({ rows: [] });

      try {
        await configService.updateConfig('max_tokens_per_message', 100, 1);
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.include('between 500 and 8000');
      }
    });

    it('应该验证total_token_budget范围', async () => {
      mockDb.query.resolves({ rows: [] });

      try {
        await configService.updateConfig('total_token_budget', 500, 1);
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.include('between 1000 and 50000');
      }
    });
  });

  describe('缓存管理', () => {
    it('应该清除本地缓存', () => {
      configService.localCache.set('max_rounds', { value: 10, timestamp: Date.now() });

      configService.invalidateCache('max_rounds');

      expect(configService.localCache.has('max_rounds')).to.be.false;
    });

    it('应该清除Redis缓存', async () => {
      mockRedis.keys.resolves(['config:dialogue:max_rounds', 'config:dialogue:max_rounds:acc_123']);

      await configService.invalidateCache('max_rounds');

      expect(mockRedis.del.calledOnce).to.be.true;
    });
  });

  describe('管理员视图', () => {
    it('应该获取所有配置（管理员视图）', async () => {
      mockDb.query.resolves({
        rows: [
          { config_key: 'max_rounds', config_value: { value: 12 }, config_type: 'system', updated_by_name: 'admin' }
        ]
      });

      const configs = await configService.getAllConfigsForAdmin();

      expect(configs).to.be.an('array');
      expect(configs.length).to.be.at.least(6);

      const maxRounds = configs.find(c => c.config_key === 'max_rounds');
      expect(maxRounds.is_default).to.be.false;
    });
  });
});
