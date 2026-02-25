#!/usr/bin/env node
/**
 * MCP WebSocket 测试
 */

const WebSocket = require('ws');

const MCP_URL = 'ws://192.168.110.146:9420';

console.log('=== MCP WebSocket 测试 ===');
console.log('连接:', MCP_URL);
console.log('');

const ws = new WebSocket(MCP_URL);

ws.on('open', () => {
  console.log('✅ WebSocket 连接成功');

  // 发送初始化请求
  const initRequest = {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'stock-race-test',
        version: '1.0.0'
      }
    },
    id: 1
  };

  console.log('[发送] 初始化请求');
  ws.send(JSON.stringify(initRequest));
});

ws.on('message', (data) => {
  console.log('[接收]:', data.toString());

  const response = JSON.parse(data.toString());

  if (response.id === 1) {
    // 初始化成功，获取工具列表
    console.log('[发送] 获取工具列表');
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 2
    }));
  }

  if (response.id === 2) {
    console.log('\n✅ MCP 协议测试成功！');
    console.log('可用工具:', response.result?.tools?.length || 0);
    ws.close();
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket 错误:', error.message);
});

ws.on('close', () => {
  console.log('WebSocket 连接关闭');
});
