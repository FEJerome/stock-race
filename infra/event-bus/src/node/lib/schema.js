/**
 * 事件Schema定义
 * 统一事件字段规范
 */

const { v4: uuidv4 } = require('uuid');

/**
 * 事件类型枚举
 */
const EventType = {
  // Market Data 事件
  MARKET_QUOTE_REALTIME: 'market:quote:realtime',
  MARKET_ALERT_PRICE_MOVE: 'market:alert:price_move',
  MARKET_INDICATOR_UPDATED: 'market:indicator:updated',

  // News Service 事件
  NEWS_INTELLIGENCE_EXTRACTED: 'news:intelligence:extracted',
  NEWS_SENTIMENT_CHANGED: 'news:sentiment:changed',

  // Trading AI 事件
  AI_DECISION_MADE: 'ai:decision:made',
  AI_PERFORMANCE_REPORT: 'ai:performance:report',

  // Backend 事件
  BACKEND_ACCOUNT_UPDATED: 'backend:account:updated',
  BACKEND_TRADE_EXECUTED: 'backend:trade:executed',
};

/**
 * 事件Schema类
 */
class EventSchema {
  /**
   * 创建事件Schema
   * @param {Object} params - 参数
   * @param {string} params.eventType - 事件类型
   * @param {string} params.source - 事件来源
   * @param {Object} params.payload - 事件负载
   * @param {string} [params.eventId] - 事件ID（默认自动生成）
   * @param {string} [params.timestamp] - 时间戳（默认当前时间）
   * @param {string} [params.correlationId] - 关联ID
   * @param {string} [params.version='1.0'] - 事件版本
   */
  constructor({
    eventType,
    source,
    payload,
    eventId = uuidv4(),
    timestamp = new Date().toISOString(),
    correlationId = null,
    version = '1.0',
  }) {
    this.eventType = eventType;
    this.source = source;
    this.payload = payload;
    this.eventId = eventId;
    this.timestamp = timestamp;
    this.correlationId = correlationId;
    this.version = version;
  }

  /**
   * 转换为普通对象
   * @returns {Object}
   */
  toObject() {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      timestamp: this.timestamp,
      source: this.source,
      payload: this.payload,
      correlationId: this.correlationId,
      version: this.version,
    };
  }

  /**
   * 转换为JSON字符串
   * @returns {string}
   */
  toJSON() {
    return JSON.stringify(this.toObject());
  }

  /**
   * 从对象创建
   * @param {Object} data - 数据对象
   * @returns {EventSchema}
   */
  static fromObject(data) {
    return new EventSchema({
      eventId: data.eventId,
      eventType: data.eventType,
      timestamp: data.timestamp,
      source: data.source,
      payload: data.payload,
      correlationId: data.correlationId,
      version: data.version || '1.0',
    });
  }

  /**
   * 从JSON字符串创建
   * @param {string} jsonStr - JSON字符串
   * @returns {EventSchema}
   */
  static fromJSON(jsonStr) {
    return EventSchema.fromObject(JSON.parse(jsonStr));
  }
}

/**
 * 事件负载Schema定义
 */
const EVENT_PAYLOAD_SCHEMAS = {
  [EventType.MARKET_QUOTE_REALTIME]: {
    symbol: 'string',
    price: 'number',
    change: 'number',
    volume: 'number',
    timestamp: 'string',
  },
  [EventType.MARKET_ALERT_PRICE_MOVE]: {
    symbol: 'string',
    alertType: 'string',
    severity: 'string',
    message: 'string',
  },
  [EventType.NEWS_INTELLIGENCE_EXTRACTED]: {
    stockCode: 'string',
    intelligence: 'string',
    sentiment: 'string',
    timestamp: 'string',
  },
  [EventType.AI_DECISION_MADE]: {
    accountId: 'string',
    decision: 'string',
    confidence: 'number',
    reasoning: 'string',
    timestamp: 'string',
  },
  [EventType.BACKEND_TRADE_EXECUTED]: {
    accountId: 'string',
    tradeId: 'string',
    symbol: 'string',
    action: 'string',
    quantity: 'number',
    price: 'number',
  },
};

/**
 * 验证事件负载
 * @param {string} eventType - 事件类型
 * @param {Object} payload - 事件负载
 * @returns {boolean}
 */
function validatePayload(eventType, payload) {
  const schema = EVENT_PAYLOAD_SCHEMAS[eventType];
  if (!schema) return true;

  for (const [fieldName, fieldType] of Object.entries(schema)) {
    if (!(fieldName in payload)) return false;
    if (typeof payload[fieldName] !== fieldType) return false;
  }
  return true;
}

module.exports = {
  EventType,
  EventSchema,
  validatePayload,
  EVENT_PAYLOAD_SCHEMAS,
};
