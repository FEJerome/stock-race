/**
 * 读取必需的环境变量；缺失即显式报错。
 * 用于密钥、口令等敏感配置——禁止在源码中提供弱口令默认值。
 *
 * @param {string} name - 环境变量名
 * @returns {string} 环境变量值
 * @throws {Error} 当环境变量未设置或为空字符串时
 */
export function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} environment variable is required (no default provided)`);
  }
  return value;
}

export default requireEnv;
