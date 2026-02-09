// 数据格式化工具

/**
 * 格式化金额
 * @param value 金额数值
 * @param decimals 小数位数
 * @param prefix 前缀（如 ¥）
 */
export function formatMoney(value: number | string, decimals = 2, prefix = '¥'): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return `${prefix}0.00`

  const formatted = num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `${prefix}${formatted}`
}

/**
 * 格式化百分比
 * @param value 百分比数值（如 0.15 表示 15%）
 * @param decimals 小数位数
 * @param showSign 是否显示正负号
 */
export function formatPercent(value: number | string, decimals = 2, showSign = true): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0.00%'

  const percent = (num * 100).toFixed(decimals)
  if (showSign && num > 0) {
    return `+${percent}%`
  }
  return `${percent}%`
}

/**
 * 格式化涨跌额
 * @param value 涨跌数值
 * @param decimals 小数位数
 */
export function formatChange(value: number | string, decimals = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0.00'

  const formatted = num.toFixed(decimals)
  if (num > 0) {
    return `+${formatted}`
  }
  return formatted
}

/**
 * 格式化数量（大数字简化）
 * @param value 数量值
 */
export function formatVolume(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0'

  if (num >= 100000000) {
    return (num / 100000000).toFixed(2) + '亿'
  } else if (num >= 10000) {
    return (num / 10000).toFixed(2) + '万'
  }
  return num.toLocaleString()
}

/**
 * 格式化日期
 * @param date 日期字符串或Date对象
 * @param format 格式模板
 */
export function formatDate(date: string | Date | number, format = 'YYYY-MM-DD'): string {
  const d = typeof date === 'string' ? new Date(date) :
             typeof date === 'number' ? new Date(date) : date

  if (isNaN(d.getTime())) return ''

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  const second = String(d.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hour)
    .replace('mm', minute)
    .replace('ss', second)
}

/**
 * 格式化时间（相对时间）
 * @param date 日期字符串或Date对象
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) {
    return '刚刚'
  } else if (diff < hour) {
    return `${Math.floor(diff / minute)}分钟前`
  } else if (diff < day) {
    return `${Math.floor(diff / hour)}小时前`
  } else if (diff < 7 * day) {
    return `${Math.floor(diff / day)}天前`
  } else {
    return formatDate(d, 'MM-DD')
  }
}

/**
 * 格式化股票代码
 * @param code 股票代码
 */
export function formatStockCode(code: string): string {
  if (!code) return ''
  // 移除空格并转为大写
  return code.trim().toUpperCase()
}

/**
 * 获取涨跌颜色
 * @param value 涨跌数值
 */
export function getTrendColor(value: number): string {
  if (value > 0) return '#FF4D4F'  // 涨 - 红色
  if (value < 0) return '#52C41A'  // 跌 - 绿色
  return '#8C8C8C'  // 平 - 灰色
}

/**
 * 格式化数字（千分位）
 * @param value 数值
 * @param decimals 小数位数
 */
export function formatNumber(value: number | string, decimals = 0): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0'

  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * 截断文本
 * @param text 文本内容
 * @param maxLength 最大长度
 * @param suffix 后缀
 */
export function truncateText(text: string, maxLength: number, suffix = '...'): string {
  if (!text || text.length <= maxLength) return text
  return text.substring(0, maxLength) + suffix
}
