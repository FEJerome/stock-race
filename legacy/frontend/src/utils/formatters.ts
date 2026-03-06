/**
 * 数据格式化工具函数
 */

/**
 * 格式化货币金额
 * @param value 金额数值
 * @param currency 货币符号，默认为¥
 * @param decimals 小数位数，默认为2
 * @returns 格式化后的货币字符串
 */
export const formatCurrency = (
  value: number,
  currency: string = '¥',
  decimals: number = 2
): string => {
  if (value === null || value === undefined) return `${currency}0.00`;

  const formattedValue = Math.abs(value).toFixed(decimals);
  const sign = value < 0 ? '-' : '';

  // 添加千位分隔符
  const parts = formattedValue.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${sign}${currency}${parts.join('.')}`;
};

/**
 * 格式化百分比
 * @param value 百分比数值（0-1或0-100）
 * @param decimals 小数位数，默认为2
 * @param isDecimal 输入值是否为小数形式（0-1），默认为false
 * @returns 格式化后的百分比字符串
 */
export const formatPercent = (
  value: number,
  decimals: number = 2,
  isDecimal: boolean = false
): string => {
  if (value === null || value === undefined) return '0.00%';

  const percentValue = isDecimal ? value * 100 : value;
  const sign = percentValue > 0 ? '+' : '';

  return `${sign}${percentValue.toFixed(decimals)}%`;
};

/**
 * 格式化股票价格
 * @param price 股票价格
 * @param decimals 小数位数，默认为2
 * @returns 格式化后的价格字符串
 */
export const formatStockPrice = (price: number, decimals: number = 2): string => {
  return formatCurrency(price, '¥', decimals);
};

/**
 * 格式化涨跌额
 * @param change 涨跌额
 * @param decimals 小数位数，默认为2
 * @returns 格式化后的涨跌额字符串
 */
export const formatChange = (change: number, decimals: number = 2): string => {
  if (change === null || change === undefined) return '0.00';

  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(decimals)}`;
};

/**
 * 格式化涨跌幅
 * @param changePercent 涨跌幅（百分比）
 * @param decimals 小数位数，默认为2
 * @returns 格式化后的涨跌幅字符串
 */
export const formatChangePercent = (changePercent: number, decimals: number = 2): string => {
  return formatPercent(changePercent, decimals, false);
};

/**
 * 格式化成交量
 * @param volume 成交量
 * @returns 格式化后的成交量字符串
 */
export const formatVolume = (volume: number): string => {
  if (volume === null || volume === undefined) return '0';

  if (volume >= 100000000) {
    return `${(volume / 100000000).toFixed(2)}亿`;
  } else if (volume >= 10000) {
    return `${(volume / 10000).toFixed(2)}万`;
  } else {
    return volume.toLocaleString();
  }
};

/**
 * 格式化市值
 * @param marketCap 市值
 * @returns 格式化后的市值字符串
 */
export const formatMarketCap = (marketCap: number): string => {
  if (marketCap === null || marketCap === undefined) return '-';

  if (marketCap >= 1000000000000) {
    return `¥${(marketCap / 1000000000000).toFixed(2)}万亿`;
  } else if (marketCap >= 100000000) {
    return `¥${(marketCap / 100000000).toFixed(2)}亿`;
  } else if (marketCap >= 10000) {
    return `¥${(marketCap / 10000).toFixed(2)}万`;
  } else {
    return `¥${marketCap.toLocaleString()}`;
  }
};

/**
 * 格式化日期时间
 * @param date 日期对象或字符串
 * @param format 格式字符串，默认为'YYYY-MM-DD HH:mm:ss'
 * @returns 格式化后的日期时间字符串
 */
export const formatDateTime = (
  date: Date | string,
  format: string = 'YYYY-MM-DD HH:mm:ss'
): string => {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) return '';

  const pad = (n: number) => n.toString().padStart(2, '0');

  const replacements: Record<string, string> = {
    'YYYY': d.getFullYear().toString(),
    'MM': pad(d.getMonth() + 1),
    'DD': pad(d.getDate()),
    'HH': pad(d.getHours()),
    'mm': pad(d.getMinutes()),
    'ss': pad(d.getSeconds()),
  };

  return format.replace(
    /YYYY|MM|DD|HH|mm|ss/g,
    (match) => replacements[match]
  );
};

/**
 * 格式化相对时间
 * @param date 日期对象或字符串
 * @returns 相对时间字符串
 */
export const formatRelativeTime = (date: Date | string): string => {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return '刚刚';
  } else if (diffMin < 60) {
    return `${diffMin}分钟前`;
  } else if (diffHour < 24) {
    return `${diffHour}小时前`;
  } else if (diffDay < 7) {
    return `${diffDay}天前`;
  } else {
    return formatDateTime(d, 'YYYY-MM-DD');
  }
};

/**
 * 格式化数字为缩写形式
 * @param num 数字
 * @param decimals 小数位数，默认为1
 * @returns 缩写形式的字符串
 */
export const formatNumberAbbr = (num: number, decimals: number = 1): string => {
  if (num === null || num === undefined) return '0';

  if (num >= 1000000000) {
    return `${(num / 1000000000).toFixed(decimals)}B`;
  } else if (num >= 1000000) {
    return `${(num / 1000000).toFixed(decimals)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(decimals)}K`;
  } else {
    return num.toString();
  }
};

/**
 * 获取涨跌颜色
 * @param value 数值
 * @returns 颜色类名或颜色值
 */
export const getChangeColor = (value: number): string => {
  if (value > 0) return '#52c41a'; // 绿色
  if (value < 0) return '#ff4d4f'; // 红色
  return '#999'; // 灰色
};

/**
 * 获取涨跌图标
 * @param value 数值
 * @returns 图标名称
 */
export const getChangeIcon = (value: number): 'rise' | 'fall' | '' => {
  if (value > 0) return 'rise';
  if (value < 0) return 'fall';
  return '';
};