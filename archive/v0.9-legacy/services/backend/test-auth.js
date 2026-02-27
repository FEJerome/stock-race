#!/usr/bin/env node

/**
 * 认证系统测试脚本
 * 用于验证后端认证功能是否正常工作
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';
let authToken = null;
let sessionId = null;

// 测试辅助函数
async function testEndpoint(method, endpoint, data = null, useAuth = false) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
  };

  if (useAuth && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  if (sessionId) {
    headers['X-Session-Id'] = sessionId;
  }

  const options = {
    method,
    headers,
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    console.log(`\n🔍 测试: ${method} ${endpoint}`);
    const response = await fetch(url, options);
    const result = await response.json();

    console.log(`📊 状态码: ${response.status}`);
    console.log(`📦 响应:`, JSON.stringify(result, null, 2));

    return { success: response.ok, data: result, status: response.status };
  } catch (error) {
    console.error(`❌ 请求失败:`, error.message);
    return { success: false, error };
  }
}

// 运行测试套件
async function runTests() {
  console.log('🚀 开始认证系统测试');
  console.log('=' .repeat(50));

  // 1. 测试健康检查
  console.log('\n1️⃣  健康检查测试');
  const healthResult = await testEndpoint('GET', '/health');
  if (!healthResult.success) {
    console.error('❌ 健康检查失败，服务器可能未启动');
    return;
  }

  // 2. 测试API信息
  console.log('\n2️⃣  API信息测试');
  await testEndpoint('GET', '/api-info');

  // 3. 测试无效登录
  console.log('\n3️⃣  无效登录测试');
  const invalidLogin = await testEndpoint('POST', '/auth/login', {
    password: 'wrongpassword'
  });

  // 4. 测试有效登录
  console.log('\n4️⃣  有效登录测试');
  const validLogin = await testEndpoint('POST', '/auth/login', {
    password: 'admin123'  // 默认密码
  });

  if (validLogin.success && validLogin.data.success) {
    authToken = validLogin.data.data.token;
    sessionId = validLogin.data.data.sessionId;
    console.log(`✅ 登录成功，获取到令牌和会话`);
    console.log(`  令牌: ${authToken?.substring(0, 20)}...`);
    console.log(`  会话ID: ${sessionId}`);
  } else {
    console.error('❌ 登录失败，无法继续测试');
    return;
  }

  // 5. 测试令牌验证
  console.log('\n5️⃣  令牌验证测试');
  await testEndpoint('GET', '/auth/validate', null, true);

  // 6. 测试获取当前用户信息
  console.log('\n6️⃣  获取当前用户信息测试');
  await testEndpoint('GET', '/auth/me', null, true);

  // 7. 测试更新用户设置
  console.log('\n7️⃣  更新用户设置测试');
  await testEndpoint('PUT', '/auth/settings', {
    theme: 'dark',
    language: 'zh_CN',
    notifications: {
      tradeExecuted: true,
      priceAlert: false
    }
  }, true);

  // 8. 测试获取用户会话
  console.log('\n8️⃣  获取用户会话测试');
  await testEndpoint('GET', '/auth/sessions', null, true);

  // 9. 测试刷新令牌
  console.log('\n9️⃣  刷新令牌测试');
  const refreshResult = await testEndpoint('POST', '/auth/refresh', null, true);
  if (refreshResult.success && refreshResult.data.success) {
    authToken = refreshResult.data.data.token;
    console.log(`✅ 令牌刷新成功，新令牌: ${authToken?.substring(0, 20)}...`);
  }

  // 10. 测试受保护端点
  console.log('\n🔟  受保护端点测试');
  await testEndpoint('GET', '/protected', null, true);

  // 11. 测试可选认证端点
  console.log('\n1️⃣1️⃣  可选认证端点测试');
  await testEndpoint('GET', '/public-or-private', null, false); // 无认证
  await testEndpoint('GET', '/public-or-private', null, true);  // 有认证

  // 12. 测试强制退出其他会话
  console.log('\n1️⃣2️⃣  强制退出其他会话测试');
  await testEndpoint('POST', '/auth/sessions/force-logout', {
    keepCurrent: true
  }, true);

  // 13. 测试获取认证统计（需要权限）
  console.log('\n1️⃣3️⃣  获取认证统计测试');
  await testEndpoint('GET', '/auth/stats', null, true);

  // 14. 测试退出登录
  console.log('\n1️⃣4️⃣  退出登录测试');
  await testEndpoint('POST', '/auth/logout', {
    sessionId: sessionId
  }, true);

  // 15. 测试退出后访问受保护端点
  console.log('\n1️⃣5️⃣  退出后访问测试');
  await testEndpoint('GET', '/auth/me', null, true);

  console.log('\n' + '=' .repeat(50));
  console.log('🎉 所有测试完成！');
}

// 错误处理
process.on('unhandledRejection', (error) => {
  console.error('❌ 未处理的Promise拒绝:', error);
  process.exit(1);
});

// 运行测试
runTests().catch(error => {
  console.error('❌ 测试运行失败:', error);
  process.exit(1);
});