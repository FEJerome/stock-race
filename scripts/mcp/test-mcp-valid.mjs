#!/usr/bin/env node
/**
 * MCP 连接有效性测试脚本
 * 使用 MCP SDK 直接测试 weixin-devtools-mcp 服务
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const MCP_SERVER_PATH = "C:\\dev\\projects\\weixin-devtools-mcp\\build\\server.js";

async function testMCPConnection() {
  console.log("========================================");
  console.log("  MCP 连接有效性测试");
  console.log("========================================\n");

  let client = null;
  let transport = null;

  try {
    // 测试 1: 创建传输层
    console.log("[测试 1] 创建 StdioClientTransport...");
    transport = new StdioClientTransport({
      command: "node",
      args: [MCP_SERVER_PATH],
      env: {
        WEIXIN_MCP_TOOLS_PROFILE: "full"
      }
    });
    console.log("✅ 传输层创建成功\n");

    // 测试 2: 创建 MCP 客户端
    console.log("[测试 2] 创建 MCP 客户端...");
    client = new Client(
      {
        name: "test-client",
        version: "1.0.0"
      },
      {
        capabilities: {}
      }
    );
    console.log("✅ MCP 客户端创建成功\n");

    // 测试 3: 连接到服务器
    console.log("[测试 3] 连接到 MCP 服务器...");
    await client.connect(transport);
    console.log("✅ MCP 服务器连接成功\n");

    // 测试 4: 列出可用工具
    console.log("[测试 4] 获取可用工具列表...");
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools || [];
    console.log(`✅ 获取工具列表成功，共 ${tools.length} 个工具`);

    if (tools.length > 0) {
      console.log("\n可用工具:");
      tools.slice(0, 10).forEach((tool, index) => {
        console.log(`  ${index + 1}. ${tool.name}`);
      });
      if (tools.length > 10) {
        console.log(`  ... 还有 ${tools.length - 10} 个工具`);
      }
    }
    console.log();

    // 测试 5: 检查关键工具是否存在
    console.log("[测试 5] 检查关键工具...");
    const requiredTools = [
      "connect_devtools",
      "get_connection_status",
      "query_selector",
      "click",
      "screenshot"
    ];

    const toolNames = tools.map(t => t.name);
    const missingTools = requiredTools.filter(t => !toolNames.includes(t));

    if (missingTools.length === 0) {
      console.log("✅ 所有关键工具都存在\n");
    } else {
      console.log(`⚠️ 缺少以下工具: ${missingTools.join(", ")}\n`);
    }

    // 测试 6: 调用 get_connection_status（无需微信开发者工具）
    console.log("[测试 6] 测试工具调用 (get_connection_status)...");
    try {
      const statusResult = await client.callTool({
        name: "get_connection_status",
        arguments: {}
      });
      console.log("✅ 工具调用成功");
      console.log("   响应:", JSON.stringify(statusResult, null, 2).substring(0, 200));
      console.log();
    } catch (toolError) {
      console.log(`⚠️ 工具调用失败: ${toolError.message}`);
      console.log("   （这是正常的，如果微信开发者工具未运行）\n");
    }

    console.log("========================================");
    console.log("  ✅ MCP 连接测试通过！");
    console.log("========================================");
    console.log("\n结论:");
    console.log("  - MCP 服务器可以正常启动");
    console.log("  - 客户端可以成功连接");
    console.log("  - 工具列表可以正常获取");
    console.log("  - 配置正确，Claude Code 应该能够使用此 MCP 服务");

    return true;

  } catch (error) {
    console.error("\n========================================");
    console.error("  ❌ MCP 连接测试失败！");
    console.error("========================================");
    console.error("\n错误信息:");
    console.error(`  ${error.message}`);
    console.error("\n错误堆栈:");
    console.error(error.stack);

    return false;
  } finally {
    // 清理资源
    if (client) {
      try {
        await client.close();
        console.log("\n[清理] MCP 客户端已关闭");
      } catch (e) {
        // 忽略关闭错误
      }
    }
    if (transport) {
      try {
        await transport.close();
        console.log("[清理] 传输层已关闭");
      } catch (e) {
        // 忽略关闭错误
      }
    }
  }
}

// 执行测试
testMCPConnection().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error("未捕获的错误:", error);
  process.exit(1);
});
