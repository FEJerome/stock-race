// 缓存管理工具类
// 支持内存缓存和本地存储缓存，考虑市场时间判断

class CacheManager {
  private memoryCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private readonly PREFIX = 'stock_race_';

  // 获取缓存数据
  get(key: string): any | null {
    // 1. 检查内存缓存
    const memoryItem = this.memoryCache.get(key);
    if (memoryItem && Date.now() - memoryItem.timestamp < memoryItem.ttl) {
      return memoryItem.data;
    }

    // 2. 检查本地存储缓存
    try {
      const stored = localStorage.getItem(`${this.PREFIX}${key}`);
      if (stored) {
        const item = JSON.parse(stored);
        if (Date.now() - item.timestamp < item.ttl) {
          // 同时更新到内存缓存
          this.memoryCache.set(key, item);
          return item.data;
        }
      }
    } catch (e) {
      console.warn('本地存储读取失败:', e);
    }

    return null;
  }

  // 设置缓存数据
  set(key: string, data: any, ttl: number = 300000): void {
    const item = {
      data,
      timestamp: Date.now(),
      ttl
    };

    // 1. 设置内存缓存
    this.memoryCache.set(key, item);

    // 2. 设置本地存储缓存
    try {
      localStorage.setItem(`${this.PREFIX}${key}`, JSON.stringify(item));
    } catch (e) {
      console.warn('本地存储写入失败:', e);
    }
  }

  // 清理过期缓存
  cleanup(): void {
    const now = Date.now();

    // 清理内存缓存
    for (const [key, item] of this.memoryCache.entries()) {
      if (now - item.timestamp >= item.ttl) {
        this.memoryCache.delete(key);
      }
    }

    // 清理本地存储缓存
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.PREFIX)) {
          try {
            const item = JSON.parse(localStorage.getItem(key)!);
            if (now - item.timestamp >= item.ttl) {
              localStorage.removeItem(key);
            }
          } catch (e) {
            // 解析失败，删除无效数据
            localStorage.removeItem(key);
          }
        }
      }
    } catch (e) {
      console.warn('本地存储清理失败:', e);
    }
  }

  // 获取缓存数据，带市场时间判断
  getWithMarketTime(key: string, isRealTime: boolean = false): any | null {
    const cached = this.get(key);
    if (!cached) return null;

    // 如果是实时数据，检查市场时间
    if (isRealTime) {
      const isTrading = this.isTradingTime();
      const cacheAge = Date.now() - cached.timestamp;

      // 交易时间：缓存5分钟内有效
      // 非交易时间：缓存30分钟内有效
      const maxAge = isTrading ? 300000 : 1800000;

      if (cacheAge < maxAge) {
        return cached.data;
      }
      return null;
    }

    return cached.data;
  }

  // 检查是否在交易时间内
  isTradingTime(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const day = now.getDay(); // 0=周日, 1=周一, ..., 6=周六

    // 周一至周五，9:30-11:30, 13:00-15:00
    if (day >= 1 && day <= 5) {
      const morningStart = 9 * 60 + 30; // 9:30
      const morningEnd = 11 * 60 + 30;  // 11:30
      const afternoonStart = 13 * 60;   // 13:00
      const afternoonEnd = 15 * 60;     // 15:00

      const currentMinutes = hour * 60 + minute;

      return (currentMinutes >= morningStart && currentMinutes <= morningEnd) ||
             (currentMinutes >= afternoonStart && currentMinutes <= afternoonEnd);
    }
    return false;
  }

  // 获取市场状态描述
  getMarketStatus(): { isTrading: boolean; description: string } {
    const isTrading = this.isTradingTime();
    const now = new Date();
    const day = now.getDay();

    if (day === 0 || day === 6) {
      return { isTrading: false, description: '周末休市' };
    }

    if (isTrading) {
      return { isTrading: true, description: '交易时间' };
    }

    const hour = now.getHours();
    if (hour < 9 || (hour === 9 && now.getMinutes() < 30)) {
      return { isTrading: false, description: '开盘前' };
    } else if (hour < 13) {
      return { isTrading: false, description: '午间休市' };
    } else {
      return { isTrading: false, description: '收盘后' };
    }
  }

  // 删除缓存
  delete(key: string): void {
    this.memoryCache.delete(key);
    try {
      localStorage.removeItem(`${this.PREFIX}${key}`);
    } catch (e) {
      console.warn('本地存储删除失败:', e);
    }
  }

  // 清理匹配模式的缓存
  clearByPattern(pattern: string): void {
    // 清理内存缓存
    for (const [key, _] of this.memoryCache.entries()) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
      }
    }

    // 清理本地存储缓存
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i);
        if (storageKey?.startsWith(this.PREFIX)) {
          const cacheKey = storageKey.substring(this.PREFIX.length);
          if (cacheKey.includes(pattern)) {
            localStorage.removeItem(storageKey);
          }
        }
      }
    } catch (e) {
      console.warn('本地存储模式清理失败:', e);
    }
  }

  // 清空所有缓存
  clearAll(): void {
    this.memoryCache.clear();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.PREFIX)) {
          localStorage.removeItem(key);
        }
      }
    } catch (e) {
      console.warn('本地存储清空失败:', e);
    }
  }

  // 获取缓存统计信息
  getStats(): {
    memoryCacheSize: number;
    localStorageSize: number;
    memoryCacheKeys: string[];
  } {
    const memoryCacheKeys = Array.from(this.memoryCache.keys());

    let localStorageSize = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.PREFIX)) {
          localStorageSize++;
        }
      }
    } catch (e) {
      console.warn('获取本地存储统计失败:', e);
    }

    return {
      memoryCacheSize: memoryCacheKeys.length,
      localStorageSize,
      memoryCacheKeys
    };
  }
}

// 导出单例实例
export const cacheManager = new CacheManager();

// 默认导出
export default cacheManager;