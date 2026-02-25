#!/usr/bin/env node
/**
 * MCP 连通性测试脚本
 * 测试 Linux 虚拟机 → Windows 微信开发者工具 MCP 服务
 */

const MCP_SERVER_URL = 'http://192.168.110.146:9420';

async function testMCPConnection() {
  console.log('========================================');
  console.log(' MCP 连通性测试');
  console.log('========================================\n');

  // 测试 1: 健康检查
  console.log('[测试 1] 健康检查...');
  try {
    const response = await fetch(`${MCP_SERVER_URL}/health`);
    const data = await response.json();
    console.log('✅ 健康检查通过:', data);
  } catch (error) {
    console.error('❌ 健康检查失败:', error.message);
    process.exit(1);
  }

  // 测试 2: 服务状态
  console.log('\n[测试 2] 服务状态...');
  try {
    const response = await fetch(`${MCP_SERVER_URL}/status`);
    const data = await response.json();
    console.log('✅ 服务状态正常:');
    console.log('   - 状态:', data.status);
    console.log('   - 端口:', data.port);
    console.log('   - 项目路径:', data.projectPath);
    console.log('   - 启动时间:', data.startTime);
  } catch (error) {
    console.error('❌ 获取状态失败:', error.message);
    process.exit(1);
  }

  // 测试 3: MCP 端点列表
  console.log('\n[测试 3] MCP 端点...');
  try {
    const response = await fetch(MCP_SERVER_URL);
    const data = await response.json();
    console.log('✅ MCP 端点可用:');
    data.endpoints.forEach(endpoint => {
      console.log('   -', endpoint);
    });
  } catch (error) {
    console.error('❌ 获取端点失败:', error.message);
    process.exit(1);
  }

  console.log('\n========================================');
  console.log(' ✅ 所有测试通过！');
  console.log('========================================');
  console.log('\nMCP 服务配置:');
  console.log('  URL:', MCP_SERVER_URL);
  console.log('  SSE:', `${MCP_SERVER_URL}/sse`);
  console.log('\n可以在 Claude Code 中使用 MCP 工具控制微信开发者工具了！');
}

testMCPConnection().catch(console.error);
