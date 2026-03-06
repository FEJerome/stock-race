/**
 * Jest 配置文件
 */

module.exports = {
  testEnvironment: 'node',
  verbose: true,
  collectCoverage: false,
  testMatch: [
    '**/tests/**/*.test.js',
  ],
  testTimeout: 30000,
  setupFilesAfterEnv: [],
};
