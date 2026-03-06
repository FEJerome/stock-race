#!/usr/bin/env node

/**
 * 前端功能验证脚本
 * 用于验证React前端应用的基本功能
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 开始验证前端功能...\n');

// 检查关键文件是否存在
const requiredFiles = [
  'src/main.tsx',
  'src/App.tsx',
  'src/types/api.types.ts',
  'src/store/auth.store.ts',
  'src/services/api.ts',
  'src/services/auth.service.ts',
  'src/services/trading.service.ts',
  'src/services/market.service.ts',
  'src/services/ai.service.ts',
  'src/hooks/useWebSocket.ts',
  'src/utils/formatters.ts',
  'src/components/common/ProtectedRoute.tsx',
  'src/components/layout/MainLayout.tsx',
  'src/components/charts/ProfitChart.tsx',
  'src/components/market/RealTimeQuotes.tsx',
  'src/components/portfolio/PortfolioSummary.tsx',
  'src/components/ai/AIDecisionLog.tsx',
  'src/pages/Login.tsx',
  'src/pages/Dashboard.tsx',
  'src/pages/Competition.tsx',
  'src/pages/AIAccounts.tsx',
  'src/pages/Trading.tsx',
  'src/pages/Analytics.tsx',
  'src/pages/Settings.tsx',
  'src/pages/TestAPI.tsx',
];

console.log('📁 检查关键文件是否存在:');
let allFilesExist = true;
requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  const exists = fs.existsSync(filePath);
  const status = exists ? '✅' : '❌';
  console.log(`  ${status} ${file}`);
  if (!exists) allFilesExist = false;
});

console.log('\n📦 检查package.json依赖:');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const requiredDeps = [
  'react', 'react-dom', 'typescript', 'vite',
  'antd', 'zustand', 'axios', 'react-query',
  'react-router-dom', 'recharts'
];

requiredDeps.forEach(dep => {
  const hasDep = packageJson.dependencies && packageJson.dependencies[dep] ||
                 packageJson.devDependencies && packageJson.devDependencies[dep];
  const status = hasDep ? '✅' : '❌';
  console.log(`  ${status} ${dep}`);
});

console.log('\n🔧 检查TypeScript配置:');
const tsConfigPath = path.join(__dirname, 'tsconfig.json');
if (fs.existsSync(tsConfigPath)) {
  console.log('  ✅ tsconfig.json 存在');
  try {
    const tsConfig = JSON.parse(fs.readFileSync(tsConfigPath, 'utf8'));
    if (tsConfig.compilerOptions?.strict) {
      console.log('  ✅ TypeScript严格模式已启用');
    }
  } catch (error) {
    console.log('  ⚠️  无法解析tsconfig.json');
  }
} else {
  console.log('  ❌ tsconfig.json 不存在');
}

console.log('\n📝 检查路由配置:');
const appContent = fs.readFileSync(path.join(__dirname, 'src/App.tsx'), 'utf8');
const routes = [
  '/login',
  '/dashboard',
  '/competition',
  '/ai-accounts',
  '/trading',
  '/analytics',
  '/settings',
  '/test-api'
];

routes.forEach(route => {
  const hasRoute = appContent.includes(`path="${route}"`) || appContent.includes(`path='${route}'`);
  const status = hasRoute ? '✅' : '❌';
  console.log(`  ${status} ${route} 路由`);
});

console.log('\n🔌 检查API服务集成:');
const services = ['auth.service.ts', 'trading.service.ts', 'market.service.ts', 'ai.service.ts'];
services.forEach(service => {
  const servicePath = path.join(__dirname, 'src/services', service);
  if (fs.existsSync(servicePath)) {
    const content = fs.readFileSync(servicePath, 'utf8');
    const hasMockData = content.includes('模拟API调用');
    const hasRealApi = content.includes('实际API调用');
    console.log(`  ${hasMockData ? '✅' : '❌'} ${service} - 模拟API`);
    console.log(`  ${hasRealApi ? '✅' : '⚠️'} ${service} - 真实API占位符`);
  }
});

console.log('\n🎨 检查UI组件:');
const components = [
  'MainLayout.tsx',
  'ProfitChart.tsx',
  'RealTimeQuotes.tsx',
  'PortfolioSummary.tsx',
  'AIDecisionLog.tsx'
];

components.forEach(component => {
  const componentPath = path.join(__dirname, 'src/components', component.includes('/') ? component : `**/${component}`);
  const files = globSync(componentPath);
  const status = files.length > 0 ? '✅' : '❌';
  console.log(`  ${status} ${component}`);
});

console.log('\n📊 验证结果汇总:');
console.log('='.repeat(50));
if (allFilesExist) {
  console.log('✅ 所有关键文件都存在');
} else {
  console.log('❌ 部分关键文件缺失');
}

// 简单的glob函数
function globSync(pattern) {
  const parts = pattern.split('/');
  let currentDir = __dirname;
  for (const part of parts) {
    if (part === '**') {
      // 简化处理，只检查一级目录
      const subdirs = fs.readdirSync(currentDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
      return subdirs;
    } else if (fs.existsSync(path.join(currentDir, part))) {
      currentDir = path.join(currentDir, part);
    } else {
      return [];
    }
  }
  return [currentDir];
}

console.log('\n🚀 前端验证完成！');
console.log('\n下一步：');
console.log('1. 运行 npm install 安装依赖');
console.log('2. 运行 npm run dev 启动开发服务器');
console.log('3. 访问 http://localhost:3000 查看应用');
console.log('4. 使用 demo@example.com / demo123 登录');
console.log('5. 访问 /test-api 页面测试所有API服务');