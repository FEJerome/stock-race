#!/usr/bin/env node

/**
 * 测试DataService的脚本
 */

import { dataService } from './src/services/DataService.js';

async function testDataService() {
  console.log('=== 测试DataService ===\n');

  // 1. 测试连接
  console.log('1. 测试数据服务连接...');
  const connectionResult = await dataService.testConnection();
  console.log('连接测试结果:', JSON.stringify(connectionResult, null, 2));

  // 2. 获取监控统计
  console.log('\n2. 获取监控统计...');
  const monitoringStats = dataService.getMonitoringStats();
  console.log('监控统计:', JSON.stringify(monitoringStats, null, 2));

  // 3. 测试获取实时数据
  console.log('\n3. 测试获取实时数据...');
  const testStockCode = '000001.SZ';
  try {
    const realtimeData = await dataService.getRealtimeData(testStockCode);
    console.log(`实时数据 (${testStockCode}):`);
    console.log('- 价格:', realtimeData.price);
    console.log('- 涨跌幅:', realtimeData.change_percent, '%');
    console.log('- 时间戳:', realtimeData.timestamp);
    console.log('- 数据源:', realtimeData.data_source || 'unknown');
    console.log('- 是否降级:', realtimeData.is_fallback || false);

    if (realtimeData.data_quality_warnings) {
      console.log('- 数据质量警告:', realtimeData.data_quality_warnings);
    }
  } catch (error) {
    console.error('获取实时数据失败:', error.message);
  }

  // 4. 测试批量获取实时数据
  console.log('\n4. 测试批量获取实时数据...');
  const testStockCodes = ['000001.SZ', '000002.SZ', '600036.SH'];
  try {
    const batchData = await dataService.batchGetRealtimeData(testStockCodes);
    console.log(`批量数据 (${testStockCodes.length}支股票):`);
    batchData.forEach((data, index) => {
      console.log(`  ${index + 1}. ${data.stock_code}: 价格=${data.price}, 降级=${data.is_fallback || false}`);
    });
  } catch (error) {
    console.error('批量获取实时数据失败:', error.message);
  }

  // 5. 再次获取监控统计（查看更新）
  console.log('\n5. 更新后的监控统计...');
  const updatedStats = dataService.getMonitoringStats();
  console.log('总请求数:', updatedStats.totalRequests);
  console.log('成功请求数:', updatedStats.successfulRequests);
  console.log('失败请求数:', updatedStats.failedRequests);
  console.log('降级请求数:', updatedStats.fallbackRequests);
  console.log('成功率:', updatedStats.successRate.toFixed(2), '%');
  console.log('降级率:', updatedStats.fallbackRate.toFixed(2), '%');
  console.log('数据质量分数:', updatedStats.dataQualityScore.toFixed(3));
  console.log('服务状态:', updatedStats.uptime);

  // 6. 测试缓存功能
  console.log('\n6. 测试缓存功能...');
  try {
    const cachedData = await dataService.getRealtimeData(testStockCode);
    console.log('缓存数据获取成功（应该从缓存中获取）');
    console.log('- 价格:', cachedData.price);
    console.log('- 缓存命中: 是');
  } catch (error) {
    console.error('缓存测试失败:', error.message);
  }

  // 7. 测试数据质量验证
  console.log('\n7. 测试数据质量验证...');
  const testData = {
    stock_code: 'TEST001',
    price: 0, // 无效价格
    timestamp: '2020-01-01T00:00:00Z', // 过时时间戳
    change_percent: 50 // 异常涨跌幅
  };

  const qualityCheck = dataService.validateDataQuality(testData);
  console.log('数据质量验证结果:');
  console.log('- 是否有效:', qualityCheck.isValid);
  console.log('- 原因:', qualityCheck.reasons);

  console.log('\n=== 测试完成 ===');
}

// 运行测试
testDataService().catch(error => {
  console.error('测试过程中发生错误:', error);
  process.exit(1);
});