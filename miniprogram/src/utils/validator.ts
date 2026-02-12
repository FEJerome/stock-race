// 数据验证工具

/**
 * 验证用户名
 * @param username 用户名
 * @returns 验证结果
 */
export function validateUsername(username: string): { valid: boolean; message?: string } {
  if (!username) {
    return { valid: false, message: '用户名不能为空' }
  }
  if (username.length < 4 || username.length > 20) {
    return { valid: false, message: '用户名长度应为4-20个字符' }
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { valid: false, message: '用户名只能包含字母、数字和下划线' }
  }
  return { valid: true }
}

/**
 * 验证密码
 * @param password 密码
 * @returns 验证结果
 */
export function validatePassword(password: string): { valid: boolean; message?: string } {
  if (!password) {
    return { valid: false, message: '密码不能为空' }
  }
  if (password.length < 8 || password.length > 20) {
    return { valid: false, message: '密码长度应为8-20个字符' }
  }
  if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
    return { valid: false, message: '密码必须包含字母和数字' }
  }
  return { valid: true }
}

/**
 * 验证确认密码
 * @param password 密码
 * @param confirmPassword 确认密码
 * @returns 验证结果
 */
export function validateConfirmPassword(password: string, confirmPassword: string): { valid: boolean; message?: string } {
  if (!confirmPassword) {
    return { valid: false, message: '请确认密码' }
  }
  if (password !== confirmPassword) {
    return { valid: false, message: '两次输入的密码不一致' }
  }
  return { valid: true }
}

/**
 * 验证邮箱
 * @param email 邮箱地址
 * @returns 验证结果
 */
export function validateEmail(email: string): { valid: boolean; message?: string } {
  if (!email) {
    return { valid: false, message: '邮箱不能为空' }
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { valid: false, message: '邮箱格式不正确' }
  }
  return { valid: true }
}

/**
 * 验证手机号
 * @param phone 手机号
 * @returns 验证结果
 */
export function validatePhone(phone: string): { valid: boolean; message?: string } {
  if (!phone) {
    return { valid: false, message: '手机号不能为空' }
  }
  const phoneRegex = /^1[3-9]\d{9}$/
  if (!phoneRegex.test(phone)) {
    return { valid: false, message: '手机号格式不正确' }
  }
  return { valid: true }
}

/**
 * 验证金额
 * @param amount 金额
 * @param min 最小值
 * @param max 最大值
 * @returns 验证结果
 */
export function validateAmount(amount: number | string, min = 0, max?: number): { valid: boolean; message?: string } {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) {
    return { valid: false, message: '请输入有效的金额' }
  }
  if (num < min) {
    return { valid: false, message: `金额不能小于${min}` }
  }
  if (max !== undefined && num > max) {
    return { valid: false, message: `金额不能大于${max}` }
  }
  return { valid: true }
}

/**
 * 验证股票代码
 * @param code 股票代码
 * @returns 验证结果
 */
export function validateStockCode(code: string): { valid: boolean; message?: string } {
  if (!code) {
    return { valid: false, message: '股票代码不能为空' }
  }
  // A股代码格式：6位数字，或以sh/sz开头
  const codeRegex = /^(sh|sz)?\d{6}$/i
  if (!codeRegex.test(code)) {
    return { valid: false, message: '股票代码格式不正确' }
  }
  return { valid: true }
}

/**
 * 验证基金经理名称
 * @param name 名称
 * @returns 验证结果
 */
export function validateManagerName(name: string): { valid: boolean; message?: string } {
  if (!name) {
    return { valid: false, message: '基金经理名称不能为空' }
  }
  if (name.length < 2 || name.length > 20) {
    return { valid: false, message: '名称长度应为2-20个字符' }
  }
  return { valid: true }
}

/**
 * 验证初始资金
 * @param balance 资金
 * @param maxBalance 最大可用资金
 * @returns 验证结果
 */
export function validateInitialBalance(balance: number | string, maxBalance?: number): { valid: boolean; message?: string } {
  const num = typeof balance === 'string' ? parseFloat(balance) : balance
  if (isNaN(num) || num <= 0) {
    return { valid: false, message: '初始资金必须大于0' }
  }
  if (maxBalance !== undefined && num > maxBalance) {
    return { valid: false, message: `初始资金不能超过可用资金${maxBalance}` }
  }
  return { valid: true }
}

/**
 * 验证API密钥
 * @param apiKey API密钥
 * @returns 验证结果
 */
export function validateApiKey(apiKey: string): { valid: boolean; message?: string } {
  if (!apiKey) {
    return { valid: false, message: 'API密钥不能为空' }
  }
  if (apiKey.length < 10) {
    return { valid: false, message: 'API密钥格式不正确' }
  }
  return { valid: true }
}
