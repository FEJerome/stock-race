import axios from 'axios';
import { cacheManager } from '../utils/cache';

/**
 * 市场状态服务
 * 提供市场状态信息的获取和管理功能
 */
export class MarketStatusService {
  private apiClient;
  private baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

  constructor() {
    this.apiClient = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * 获取市场状态信息
   * @returns {Promise<MarketStatus>} 市场状态信息
   */
  async getMarketStatus(): Promise<MarketStatus> {
    const cacheKey = 'market_status';

    try {
      // 尝试从缓存获取（缓存60秒）
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        console.log('使用缓存的市场状态数据');
        return cached;
      }

      // 从API获取数据
      const response = await this.apiClient.get('/market/status');

      if (response.data.success && response.data.data) {
        const marketStatus = {
          isTrading: response.data.data.is_trading,
          status: response.data.data.status,
          description: response.data.data.description,
          nextTradingTime: response.data.data.next_trading_time,
          currentTime: response.data.data.current_time,
          recommendedInterval: response.data.data.recommended_interval,
          dataServiceStatus: response.data.data.data_service_status,
          dataQuality: response.data.data.data_quality,
          dataStatus: response.data.data.data_status,
          activeSources: response.data.data.active_sources,
          successRate: response.data.data.success_rate,
          timestamp: response.data.data.timestamp
        };

        // 根据市场状态设置不同的缓存时间
        let ttl = 60000; // 默认60秒

        if (marketStatus.status === 'open') {
          ttl = 30000; // 交易时间30秒
        } else if (marketStatus.status === 'after_hours' || marketStatus.status === 'closed') {
          ttl = 180000; // 休市时间3分钟
        } else if (marketStatus.status === 'weekend') {
          ttl = 300000; // 周末5分钟
        }

        // 缓存数据（包含市场状态元数据）
        cacheManager.set(cacheKey, marketStatus, ttl);

        return marketStatus;
      } else {
        throw new Error('API返回格式错误');
      }
    } catch (error) {
      console.error('获取市场状态失败:', error);

      // 降级方案：根据当前时间判断市场状态
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const day = now.getDay(); // 0=周日, 1=周一, ..., 6=周六

      let status = 'unknown';
      let description = '未知状态';
      let isTrading = false;

      // 判断是否周末
      if (day === 0 || day === 6) {
        status = 'weekend';
        description = '周末休市';
      } else {
        // 判断交易时间
        const isMorningTrading = (hour === 9 && minute >= 30) || (hour > 9 && hour < 11) || (hour === 11 && minute < 30);
        const isAfternoonTrading = (hour === 13 && minute >= 0) || (hour > 13 && hour < 15) || (hour === 15 && minute === 0);
        const isLunchBreak = (hour === 11 && minute >= 30) || (hour === 12) || (hour === 13 && minute < 0);

        if (isMorningTrading || isAfternoonTrading) {
          status = 'open';
          description = '交易中';
          isTrading = true;
        } else if (isLunchBreak) {
          status = 'lunch_break';
          description = '午间休市';
        } else if (hour < 9 || (hour === 9 && minute < 30)) {
          status = 'pre_open';
          description = '开盘前';
        } else if (hour >= 15 || (hour === 15 && minute > 0)) {
          status = 'after_hours';
          description = '收盘后';
        } else {
          status = 'closed';
          description = '已收盘';
        }
      }

      // 计算下次交易时间
      const nextTradingTime = this.calculateNextTradingTime(now);

      const fallbackStatus: MarketStatus = {
        isTrading,
        status,
        description: `${description}（降级数据）`,
        nextTradingTime,
        currentTime: now.toISOString(),
        recommendedInterval: '5m',
        dataServiceStatus: 'degraded',
        dataQuality: 0.0,
        dataStatus: 'historical',
        activeSources: [],
        successRate: 0.0,
        isFallback: true
      };

      // 缓存降级数据（1分钟）
      cacheManager.set(cacheKey, fallbackStatus, 60000);

      return fallbackStatus;
    }
  }

  /**
   * 计算下次交易时间
   * @param {Date} currentTime - 当前时间
   * @returns {string} 下次交易时间（ISO格式）
   */
  private calculateNextTradingTime(currentTime: Date): string {
    const nextTime = new Date(currentTime);
    const hour = nextTime.getHours();
    const day = nextTime.getDay(); // 0=周日, 1=周一, ..., 6=周六

    // 如果是周末，计算到下周一的9:30
    if (day === 0 || day === 6) {
      const daysToMonday = day === 0 ? 1 : 2;
      nextTime.setDate(nextTime.getDate() + daysToMonday);
      nextTime.setHours(9, 30, 0, 0);
    } else {
      // 工作日判断当前时间
      if (hour < 9 || (hour === 9 && nextTime.getMinutes() < 30)) {
        // 开盘前，当天9:30
        nextTime.setHours(9, 30, 0, 0);
      } else if (hour < 11 || (hour === 11 && nextTime.getMinutes() < 30)) {
        // 上午交易时间，下次是13:00
        nextTime.setHours(13, 0, 0, 0);
      } else if (hour < 13) {
        // 午间休市，当天13:00
        nextTime.setHours(13, 0, 0, 0);
      } else if (hour < 15) {
        // 下午交易时间，明天9:30
        nextTime.setDate(nextTime.getDate() + 1);
        nextTime.setHours(9, 30, 0, 0);
      } else {
        // 收盘后，明天9:30
        nextTime.setDate(nextTime.getDate() + 1);
        nextTime.setHours(9, 30, 0, 0);
      }
    }

    return nextTime.toISOString();
  }

  /**
   * 判断市场是否开放
   * @returns {Promise<boolean>} 是否开放
   */
  async isMarketOpen(): Promise<boolean> {
    const status = await this.getMarketStatus();
    return status.isTrading;
  }

  /**
   * 获取数据服务状态
   * @returns {Promise<'healthy' | 'degraded' | 'unavailable'>} 数据服务状态
   */
  async getDataServiceStatus(): Promise<'healthy' | 'degraded' | 'unavailable'> {
    const status = await this.getMarketStatus();
    return status.dataServiceStatus;
  }

  /**
   * 获取数据状态
   * @returns {Promise<'realtime' | 'historical' | 'fallback'>} 数据状态
   */
  async getDataStatus(): Promise<'realtime' | 'historical' | 'fallback'> {
    const status = await this.getMarketStatus();
    return status.dataStatus;
  }
}

/**
 * 市场状态接口
 */
export interface MarketStatus {
  isTrading: boolean;
  status: 'open' | 'closed' | 'pre_open' | 'lunch_break' | 'after_hours' | 'weekend' | 'unknown';
  description: string;
  nextTradingTime: string;
  currentTime: string;
  recommendedInterval: string;
  dataServiceStatus: 'healthy' | 'degraded' | 'unavailable';
  dataQuality: number; // 0-1
  dataStatus: 'realtime' | 'historical' | 'fallback';
  activeSources: string[];
  successRate: number;
  isFallback?: boolean;
}

// 创建服务实例
export const marketStatusService = new MarketStatusService();