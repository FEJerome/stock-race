import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import routes from './routes/index.js';
import { requestLogger } from './middleware/auth.js';
import { sessionService } from './services/SessionService.js';
import { webSocketService } from './services/WebSocketService.js';
import { responseFormatterMiddleware } from './utils/responseFormatter.js';
import {
  globalErrorHandler,
  notFoundHandler,
  handleUncaughtExceptions
} from './middleware/errorHandler.js';

// 创建Express应用
const app = express();

// 环境变量配置
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3001;
const API_PREFIX = process.env.API_PREFIX || '/api';

// Swagger配置
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Stock Race API',
      version: '1.0.0',
      description: '股票竞赛平台API文档',
      contact: {
        name: 'API支持',
        email: 'support@stockrace.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: `http://localhost:${PORT}${API_PREFIX}`,
        description: '开发服务器'
      },
      {
        url: 'https://api.stockrace.com',
        description: '生产服务器'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:']
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS配置 - 允许局域网访问
const corsOptions = {
  origin: function (origin, callback) {
    // 允许所有局域网访问（开发环境）
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://192.168.110.147:3000'
    ];

    // 允许所有本地网络请求（开发环境）
    if (!origin || allowedOrigins.includes(origin) || origin.includes('192.168.110.')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Id']
};

app.use(cors(corsOptions));

// 请求限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP限制100个请求
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: '请求过于频繁，请稍后再试'
    },
    message: '请求频率限制'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 应用请求限制到API路由
app.use(`${API_PREFIX}/`, limiter);

// 日志中间件
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// 自定义请求日志
app.use(requestLogger);

// 响应格式化中间件
app.use(responseFormatterMiddleware);

// 压缩中间件
app.use(compression());

// 解析请求体
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务
app.use('/uploads', express.static('uploads'));

// Swagger文档
app.use(`${API_PREFIX}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Stock Race API文档'
}));

// API路由
app.use(API_PREFIX, routes);

// 404处理
app.use(notFoundHandler);

// 全局错误处理中间件
app.use(globalErrorHandler);

// 处理未捕获的异常
handleUncaughtExceptions();

// 启动服务器
const startServer = async () => {
  try {
    // 初始化会话服务
    await sessionService.init();
    console.log('✅ 会话服务初始化完成');

    // 启动服务器
    const server = app.listen(PORT, () => {
      console.log(`🚀 服务器启动成功`);
      console.log(`📡 环境: ${NODE_ENV}`);
      console.log(`🌐 地址: http://localhost:${PORT}`);
      console.log(`📚 API文档: http://localhost:${PORT}${API_PREFIX}/docs`);
      console.log(`🔐 API前缀: ${API_PREFIX}`);
      console.log(`📊 健康检查: http://localhost:${PORT}${API_PREFIX}/health`);
      console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    });

    // 初始化WebSocket服务
    webSocketService.initialize(server);

    // 优雅关闭
    const gracefulShutdown = async () => {
      console.log('🛑 收到关闭信号，正在优雅关闭...');

      // 关闭WebSocket服务
      webSocketService.close();
      console.log('✅ WebSocket服务已关闭');

      // 关闭会话服务
      await sessionService.close();
      console.log('✅ 会话服务已关闭');

      // 关闭服务器
      server.close(() => {
        console.log('✅ HTTP服务器已关闭');
        process.exit(0);
      });

      // 强制关闭超时
      setTimeout(() => {
        console.error('❌ 强制关闭服务器');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    return server;
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
};

// 导出应用和启动函数
export { app, startServer };

// 如果直接运行此文件，则启动服务器
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}