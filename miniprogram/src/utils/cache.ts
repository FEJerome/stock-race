// 缓存管理工具
import { TRADING_HOURS } from './constants'

class CacheManager {
  private static instance: CacheManager
  private prefix = 'stock-race:'

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager()
    }
    return CacheManager.instance
  }

  // 设置缓存
  set(key: string, value: any, ttl?: number): void {
    const item = {
      value,
      expire: ttl ? Date.now() + ttl * 1000 : null,
      createdAt: Date.now(),
    }
    try {
      uni.setStorageSync(this.prefix + key, JSON.stringify(item))
    } catch (e) {
      console.error('Cache set error:', e)
    }
  }

  // 获取缓存
  get(key: string): any {
    try {
      const data = uni.getStorageSync(this.prefix + key)
      if (!data) return null

      const item = JSON.parse(data)
      if (item.expire && Date.now() > item.expire) {
        this.remove(key)
        return null
      }
      return item.value
    } catch (e) {
      console.error('Cache get error:', e)
      return null
    }
  }

  // 移除缓存
  remove(key: string): void {
    try {
      uni.removeStorageSync(this.prefix + key)
    } catch (e) {
      console.error('Cache remove error:', e)
    }
  }

  // 清除所有缓存
  clear(): void {
    try {
      const keys = uni.getStorageInfoSync().keys
      keys.forEach((key: string) => {
        if (key.startsWith(this.prefix)) {
          uni.removeStorageSync(key)
        }
      })
    } catch (e) {
      console.error('Cache clear error:', e)
    }
  }

  // 清除指定模式的缓存
  clearByPattern(pattern: string): void {
    try {
      const keys = uni.getStorageInfoSync().keys
      keys.forEach((key: string) => {
        if (key.startsWith(this.prefix) && key.includes(pattern)) {
          uni.removeStorageSync(key)
        }
      })
    } catch (e) {
      console.error('Cache clearByPattern error:', e)
    }
  }

  // 判断是否为A股交易时间
  isTradingTime(): boolean {
    const now = new Date()
    const day = now.getDay()

    // 周末不交易
    if (day === 0 || day === 6) return false

    const hour = now.getHours()
    const minute = now.getMinutes()
    const time = hour * 60 + minute

    const morningStart = TRADING_HOURS.MORNING_START.hour * 60 + TRADING_HOURS.MORNING_START.minute
    const morningEnd = TRADING_HOURS.MORNING_END.hour * 60 + TRADING_HOURS.MORNING_END.minute
    const afternoonStart = TRADING_HOURS.AFTERNOON_START.hour * 60 + TRADING_HOURS.AFTERNOON_START.minute
    const afternoonEnd = TRADING_HOURS.AFTERNOON_END.hour * 60 + TRADING_HOURS.AFTERNOON_END.minute

    return (time >= morningStart && time <= morningEnd) ||
           (time >= afternoonStart && time <= afternoonEnd)
  }

  // 根据交易时间获取缓存TTL
  getTTL(defaultTTL: number, offlineTTL?: number): number {
    return this.isTradingTime() ? defaultTTL : (offlineTTL || defaultTTL * 2)
  }

  // 获取缓存信息
  getInfo(): { keys: string[]; currentSize: number; limitSize: number } {
    try {
      return uni.getStorageInfoSync()
    } catch (e) {
      console.error('Cache getInfo error:', e)
      return { keys: [], currentSize: 0, limitSize: 0 }
    }
  }
}

export const cache = CacheManager.getInstance()
