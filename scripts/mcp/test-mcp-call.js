#!/usr/bin/env node
/**
 * MCP 工具调用测试
 */

const http = require('http');

const MCP_HOST = '192.168.110.146';
const MCP_PORT = 9420;

function mcpCall(toolName, args) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      },
      id: Date.now()
    });

    const options = {
      hostname: MCP_HOST,
      port: MCP_PORT,
      path: '/message',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve(responseData);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('=== MCP 工具调用测试 ===\n');

  try {
    // 测试 1: 获取工具列表
    console.log('[测试 1] 获取可用工具列表...');
    const tools = await mcpCall('tools/list', {});
    console.log('工具列表:', JSON.stringify(tools, null, 2));
  } catch (error) {
    console.error('获取工具列表失败:', error.message);
  }

  try {
    // 测试 2: 连接开发者工具
    console.log('\n[测试 2] 连接微信开发者工具...');
    const result = await mcpCall('connect_devtools_enhanced', {
      projectPath: 'D:\\BaiduSyncdisk\\MaHaoYuJavaLearning\\big_start\\stock-race\\miniprogram',
      mode: 'auto',
      verbose: true
    });
    console.log('连接结果:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('连接失败:', error.message);
  }
}

main();
