/**
 * Stock Race 统一事件总线 SDK (Node.js版)
 * 基于 Redis Streams 实现
 */

const EventBusClient = require('./lib/client');
const EventProducer = require('./lib/producer');
const EventConsumer = require('./lib/consumer');
const { EventType, EventSchema, validatePayload } = require('./lib/schema');
const {
  EventBusError,
  ConnectionError,
  PublishError,
  ConsumeError,
  ValidationError
} = require('./lib/exceptions');

module.exports = {
  EventBusClient,
  EventProducer,
  EventConsumer,
  EventType,
  EventSchema,
  validatePayload,
  EventBusError,
  ConnectionError,
  PublishError,
  ConsumeError,
  ValidationError,
};
