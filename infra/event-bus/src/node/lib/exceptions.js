/**
 * 事件总线异常定义
 */

class EventBusError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EventBusError';
  }
}

class ConnectionError extends EventBusError {
  constructor(message) {
    super(message);
    this.name = 'ConnectionError';
  }
}

class PublishError extends EventBusError {
  constructor(message) {
    super(message);
    this.name = 'PublishError';
  }
}

class ConsumeError extends EventBusError {
  constructor(message) {
    super(message);
    this.name = 'ConsumeError';
  }
}

class ValidationError extends EventBusError {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class ConsumerGroupError extends EventBusError {
  constructor(message) {
    super(message);
    this.name = 'ConsumerGroupError';
  }
}

module.exports = {
  EventBusError,
  ConnectionError,
  PublishError,
  ConsumeError,
  ValidationError,
  ConsumerGroupError,
};
