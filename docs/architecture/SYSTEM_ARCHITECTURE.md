# AI Stock Competition Platform - System Architecture Design

*Translated from the Chinese original on 2026-11-15.*

## 1. Overall Architecture Overview

### 1.1 Architecture Principles
- **Hybrid architecture**: Node.js + React + Python, each playing to its strengths
- **Modular design**: clear module boundaries, supporting independent development and deployment
- **Real-time first**: WebSocket push with low-latency data updates
- **Scalability**: headroom reserved for multi-user, multi-AI-model, and advanced features
- **Security and compliance**: aligned with Chinese cybersecurity law and financial compliance requirements

### 1.2 Architecture Diagram
```
┌─────────────────────────────────────────────────────────────────────────┐
│                              UI Layer                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  React frontend app (Vite + TypeScript + Ant Design)                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │ Login/      │ │ Real-time   │ │ Trade       │ │ Leaderboard │        │
│  │ Register    │ │ Market      │ │ Monitor     │ │             │        │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                        │
│  │ Position    │ │ Analysis    │ │ System      │                        │
│  │ Management  │ │ Reports     │ │ Settings    │                        │
│  └─────────────┘ └─────────────┘ └─────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ HTTP/HTTPS + WebSocket
┌─────────────────────────────────────────────────────────────────────────┐
│                         API Gateway Layer                                │
├─────────────────────────────────────────────────────────────────────────┤
│  Node.js backend service (Express.js + TypeScript)                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                        API Route Layer                          │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │    │
│  │  │ User     │ │ Trading  │ │ Data     │ │ Realtime │          │    │
│  │  │ Auth     │ │ Ops      │ │ Query    │ │ Push     │          │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────────┐   │    │
│  │  │                 Business Logic Layer                    │   │    │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │    │
│  │  │  │ User     │ │ Trading  │ │ Data     │ │ Monitor  │   │   │    │
│  │  │  │ Service  │ │ Service  │ │ Service  │ │ Service  │   │   │    │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │    │
│  │  └─────────────────────────────────────────────────────────┘   │    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────────┐   │    │
│  │  │                  Data Access Layer                      │   │    │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │    │
│  │  │  │ User     │ │ Trade    │ │ Stock    │ │ Log      │   │   │    │
│  │  │  │ Model    │ │ Model    │ │ Model    │ │ Model    │   │   │    │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │    │
│  │  └─────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ HTTP/REST API
┌─────────────────────────────────────────────────────────────────────────┐
│                         AI Service Layer                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  Python AI service (FastAPI + asyncio)                                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      AI Decision Engine                         │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │    │
│  │  │ Data     │ │ Model    │ │ Decision │ │ Risk     │          │    │
│  │  │ Prep     │ │ Call     │ │ Generate │ │ Assess   │          │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────────┐   │    │
│  │  │                   AI Model Adapters                     │   │    │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │    │
│  │  │  │ OpenAI   │ │ Claude   │ │ Wenxin   │ │ Qwen     │   │   │    │
│  │  │  │ Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter  │   │   │    │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │    │
│  │  └─────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Message queue / scheduled tasks
┌─────────────────────────────────────────────────────────────────────────┐
│                        Data Service Layer                                │
├─────────────────────────────────────────────────────────────────────────┤
│  Data collection and processing service                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Data Collectors                          │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │    │
│  │  │ Sina     │ │ Tencent  │ │ Eastmoney│ │ JoinQuant│          │    │
│  │  │ Finance  │ │ Finance  │ │          │ │ API      │          │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────────┐   │    │
│  │  │                  Data Processing Pipeline               │   │    │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │    │
│  │  │  │ Clean    │ │ Validate │ │ Transform│ │ Store    │   │   │    │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │    │
│  │  └─────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Database connections
┌─────────────────────────────────────────────────────────────────────────┐
│                        Data Storage Layer                                │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                    │
│  │ PostgreSQL   │ │   Redis      │ │ TimescaleDB  │                    │
│  │ (primary DB) │ │ (cache/      │ │ (time series)│                    │
│  │              │ │  sessions)   │ │              │                    │
│  │ - User data  │ │ - Sessions   │ │ - Quotes     │                    │
│  │ - Trade logs │ │ - Real-time  │ │ - Historical │                    │
│  │ - AI acct    │ │   quotes     │ │   data       │                    │
│  │   info       │ │ - API rate   │ │ - Technical  │                    │
│  │ - System     │ │   limiting   │ │   indicators │                    │
│  │   config     │ │ - Job queue  │ │              │                    │
│  └──────────────┘ └──────────────┘ └──────────────┘                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. Frontend React Application Architecture

### 2.1 Tech Stack
- **Framework**: React 18 + TypeScript
- **Build tool**: Vite
- **State management**: Redux Toolkit (global state) + React Context (local state)
- **UI component library**: Ant Design 5.x
- **Data visualization**: ECharts for React
- **HTTP client**: Axios
- **WebSocket**: Socket.io-client
- **Routing**: React Router v6
- **Styling**: CSS Modules + Ant Design style system

### 2.2 Application Structure
```
frontend/
├── src/
│   ├── api/                    # API client wrappers
│   │   ├── auth.ts            # Authentication APIs
│   │   ├── trading.ts         # Trading APIs
│   │   ├── market.ts          # Market data APIs
│   │   ├── ai.ts              # AI-related APIs
│   │   └── websocket.ts       # WebSocket connection management
│   ├── components/            # Shared components
│   │   ├── common/           # Basic components (buttons, inputs, etc.)
│   │   ├── layout/           # Layout components
│   │   ├── charts/           # Chart components
│   │   └── modals/           # Modal components
│   ├── features/             # Feature modules
│   │   ├── auth/             # Authentication module
│   │   ├── dashboard/        # Dashboard module
│   │   ├── trading/          # Trading module
│   │   ├── market/           # Market data module
│   │   ├── portfolio/        # Position management module
│   │   ├── ranking/          # Leaderboard module
│   │   └── settings/         # Settings module
│   ├── store/                # Redux state management
│   │   ├── slices/           # Redux slices
│   │   │   ├── authSlice.ts
│   │   │   ├── marketSlice.ts
│   │   │   ├── portfolioSlice.ts
│   │   │   └── uiSlice.ts
│   │   └── store.ts          # Store configuration
│   ├── hooks/                # Custom hooks
│   │   ├── useAuth.ts        # Authentication hook
│   │   ├── useMarketData.ts  # Market data hook
│   │   └── useWebSocket.ts   # WebSocket hook
│   ├── utils/                # Utility functions
│   │   ├── formatters.ts     # Data formatting
│   │   ├── validators.ts     # Form validation
│   │   ├── constants.ts      # Constants
│   │   └── helpers.ts        # Helper functions
│   ├── types/                # TypeScript type definitions
│   │   ├── api.types.ts      # API types
│   │   ├── market.types.ts   # Market data types
│   │   └── trading.types.ts  # Trading types
│   ├── styles/               # Style files
│   │   ├── global.css        # Global styles
│   │   └── variables.less    # Ant Design variables
│   ├── App.tsx               # Root component
│   ├── main.tsx              # Application entry
│   └── routes.tsx            # Route configuration
├── public/                   # Static assets
├── index.html                # HTML template
├── package.json              # Dependency configuration
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite configuration
└── README.md                 # Frontend documentation
```

### 2.3 Core Feature Modules
1. **Authentication module**: login/registration, password management, session persistence
2. **Dashboard module**: overview page, key metric display
3. **Trading module**: buy/sell operations, order management, trade history
4. **Market data module**: real-time quotes, K-line charts, watchlists
5. **Position management module**: current positions, P&L calculation, asset distribution
6. **Leaderboard module**: return-rate ranking, strategy comparison
7. **Settings module**: AI configuration, notification settings, account management

## 3. Backend Node.js Service Architecture

### 3.1 Tech Stack
- **Runtime**: Node.js 20.x LTS
- **Web framework**: Express.js 4.x + TypeScript
- **Database ORM**: Prisma (PostgreSQL) + Redis client
- **Authentication**: JWT + bcrypt (password hashing)
- **Real-time communication**: Socket.io
- **Job queue**: Bull (Redis-based)
- **API documentation**: Swagger/OpenAPI 3.0
- **Logging**: Winston + Morgan
- **Monitoring**: Prometheus client
- **Testing**: Jest + Supertest

### 3.2 Service Structure
```
backend/
├── src/
│   ├── config/               # Configuration files
│   │   ├── index.ts          # Main configuration
│   │   ├── database.ts       # Database configuration
│   │   ├── redis.ts          # Redis configuration
│   │   ├── auth.ts           # Authentication configuration
│   │   └── server.ts         # Server configuration
│   ├── middleware/           # Middleware
│   │   ├── auth.middleware.ts # Authentication middleware
│   │   ├── validation.middleware.ts # Validation middleware
│   │   ├── error.middleware.ts # Error handling middleware
│   │   ├── logging.middleware.ts # Logging middleware
│   │   └── rate-limit.middleware.ts # Rate limiting middleware
│   ├── controllers/          # Controllers
│   │   ├── auth.controller.ts # Authentication controller
│   │   ├── user.controller.ts # User controller
│   │   ├── trading.controller.ts # Trading controller
│   │   ├── market.controller.ts # Market data controller
│   │   ├── ai.controller.ts  # AI controller
│   │   └── ranking.controller.ts # Leaderboard controller
│   ├── services/             # Business services
│   │   ├── auth.service.ts   # Authentication service
│   │   ├── user.service.ts   # User service
│   │   ├── trading.service.ts # Trading service
│   │   ├── market.service.ts # Market data service
│   │   ├── ai.service.ts     # AI service (communicates with Python service)
│   │   ├── portfolio.service.ts # Position service
│   │   ├── ranking.service.ts # Leaderboard service
│   │   └── notification.service.ts # Notification service
│   ├── models/               # Data models
│   │   ├── user.model.ts     # User model
│   │   ├── ai-account.model.ts # AI account model
│   │   ├── stock.model.ts    # Stock model
│   │   ├── trade.model.ts    # Trade model
│   │   ├── portfolio.model.ts # Position model
│   │   └── decision-log.model.ts # Decision log model
│   ├── routes/               # API routes
│   │   ├── auth.routes.ts    # Authentication routes
│   │   ├── user.routes.ts    # User routes
│   │   ├── trading.routes.ts # Trading routes
│   │   ├── market.routes.ts  # Market data routes
│   │   ├── ai.routes.ts      # AI routes
│   │   └── ranking.routes.ts # Leaderboard routes
│   ├── utils/                # Utility functions
│   │   ├── logger.ts         # Logging utilities
│   │   ├── validators.ts     # Validation utilities
│   │   ├── formatters.ts     # Formatting utilities
│   │   ├── crypto.ts         # Crypto utilities
│   │   ├── date.ts           # Date utilities
│   │   └── math.ts           # Math utilities
│   ├── types/                # TypeScript types
│   │   ├── express.d.ts      # Express type extensions
│   │   ├── api.types.ts      # API type definitions
│   │   └── database.types.ts # Database type definitions
│   ├── prisma/               # Prisma configuration
│   │   ├── schema.prisma     # Database schema
│   │   └── migrations/       # Database migrations
│   ├── tasks/                # Scheduled tasks
│   │   ├── market-data.task.ts # Market data update task
│   │   ├── ai-decision.task.ts # AI decision task
│   │   ├── portfolio-sync.task.ts # Position sync task
│   │   └── ranking-update.task.ts # Leaderboard update task
│   ├── websocket/            # WebSocket handling
│   │   ├── server.ts         # WebSocket server
│   │   ├── handlers/         # Message handlers
│   │   └── events/           # Event definitions
│   ├── app.ts                # Express application configuration
│   └── server.ts             # Server entry point
├── tests/                    # Test files
├── package.json              # Dependency configuration
├── tsconfig.json             # TypeScript configuration
├── prisma/                   # Prisma configuration (symlink)
└── README.md                 # Backend documentation
```

### 3.3 Core Service Modules
1. **Authentication service**: user registration, login, JWT token management
2. **User service**: user profile management, preference settings
3. **Trading service**: buy/sell order processing, position calculation, trade validation
4. **Market data service**: quote data retrieval, caching, push
5. **AI service**: communicates with the Python AI service, forwards decision requests
6. **Position service**: position calculation, P&L analysis, risk assessment
7. **Leaderboard service**: return-rate calculation, ranking updates
8. **Notification service**: trade notifications, system message push

## 4. Python AI Service Architecture

### 4.1 Tech Stack
- **Web framework**: FastAPI + Uvicorn
- **Async framework**: asyncio + aiohttp
- **AI SDKs**: OpenAI SDK, Anthropic SDK, domestic LLM SDKs
- **Data processing**: pandas, numpy, scipy
- **Caching**: Redis client
- **Job queue**: Celery (optional, for async tasks)
- **Monitoring**: Prometheus client
- **Logging**: structlog

### 4.2 Service Structure
```
ai-service/
├── src/
│   ├── api/                  # API endpoints
│   │   ├── endpoints/        # FastAPI endpoints
│   │   │   ├── health.py     # Health check
│   │   │   ├── decision.py   # Decision endpoint
│   │   │   ├── analysis.py   # Analysis endpoint
│   │   │   └── models.py     # Model management endpoint
│   │   └── dependencies.py   # Dependency injection
│   ├── core/                 # Core logic
│   │   ├── config.py         # Configuration management
│   │   ├── security.py       # Security and authentication
│   │   └── exceptions.py     # Exception handling
│   ├── services/             # Business services
│   │   ├── decision_service.py # Decision service
│   │   ├── data_service.py   # Data service
│   │   ├── model_service.py  # Model service
│   │   └── risk_service.py   # Risk assessment service
│   ├── models/               # Data models
│   │   ├── schemas.py        # Pydantic models
│   │   ├── decision.py       # Decision model
│   │   └── market.py         # Market data model
│   ├── adapters/             # AI model adapters
│   │   ├── base.py           # Base adapter
│   │   ├── openai_adapter.py # OpenAI adapter
│   │   ├── claude_adapter.py # Claude adapter
│   │   ├── wenxin_adapter.py # Wenxin (ERNIE Bot) adapter
│   │   └── qwen_adapter.py   # Qwen (Tongyi Qianwen) adapter
│   ├── prompts/              # Prompt templates
│   │   ├── base_prompts.py   # Base prompts
│   │   ├── trading_prompts.py # Trading prompts
│   │   ├── analysis_prompts.py # Analysis prompts
│   │   └── risk_prompts.py   # Risk prompts
│   ├── utils/                # Utility functions
│   │   ├── logger.py         # Logging utilities
│   │   ├── cache.py          # Caching utilities
│   │   ├── formatters.py     # Data formatting
│   │   └── validators.py     # Data validation
│   └── main.py               # Application entry
├── tests/                    # Test files
├── requirements.txt          # Python dependencies
├── pyproject.toml           # Project configuration
├── Dockerfile               # Docker configuration
└── README.md                # AI service documentation
```

### 4.3 Core Feature Modules
1. **Decision engine**: integrates market data, position information, and user strategy to generate trading decisions
2. **Model adapters**: unified interface to different AI model providers
3. **Prompt engineering**: optimized prompt templates to improve decision quality
4. **Risk assessment**: evaluates the risk level of trading decisions
5. **Cache management**: caches similar decision requests to reduce API costs

## 5. Data Service Architecture

### 5.1 Data Collection Service
```
data-service/
├── src/
│   ├── collectors/           # Data collectors
│   │   ├── base_collector.py # Base collector
│   │   ├── sina_collector.py # Sina Finance collector
│   │   ├── tencent_collector.py # Tencent Finance collector
│   │   ├── eastmoney_collector.py # Eastmoney collector
│   │   └── joinquant_collector.py # JoinQuant collector
│   ├── processors/           # Data processors
│   │   ├── cleaner.py        # Data cleaning
│   │   ├── validator.py      # Data validation
│   │   ├── transformer.py    # Data transformation
│   │   └── normalizer.py     # Data normalization
│   ├── storage/              # Data storage
│   │   ├── postgres_store.py # PostgreSQL storage
│   │   ├── timescale_store.py # TimescaleDB storage
│   │   └── redis_store.py    # Redis storage
│   ├── scheduler/            # Task scheduling
│   │   ├── scheduler.py      # Scheduler
│   │   └── tasks.py          # Scheduled tasks
│   └── main.py               # Service entry
└── requirements.txt          # Dependency configuration
```

### 5.2 Data Processing Pipeline
1. **Data collection**: periodically collects stock quote data from multiple sources
2. **Data cleaning**: handles missing values, outliers, format conversion
3. **Data validation**: validates data completeness and consistency
4. **Data storage**: stores to TimescaleDB (time series) and PostgreSQL (basic info)
5. **Data push**: pushes real-time updates to the frontend via WebSocket

## 6. Inter-Service Communication

### 6.1 REST API Communication
- **Frontend ↔ Backend**: HTTP/HTTPS, JSON format
- **Backend ↔ Python AI service**: HTTP/HTTPS, JSON format
- **Authentication**: JWT tokens, API keys

### 6.2 WebSocket Real-time Communication
- **Connection establishment**: frontend connects to the backend via Socket.io
- **Event types**:
  - `market:update`: quote data update
  - `trade:executed`: trade execution notification
  - `ai:decision`: AI decision notification
  - `portfolio:update`: position update
  - `system:notification`: system notification
- **Heartbeat**: 30-second heartbeat packets to keep the connection alive

### 6.3 Message Queue Communication
- **Technology selection**: Redis + Bull (Node.js) or Redis + Celery (Python)
- **Use cases**:
  - Async processing of AI decision requests
  - Batch market data updates
  - Scheduled leaderboard calculation
  - System notification delivery

### 6.4 Database Synchronization
- **Primary-replica replication**: PostgreSQL primary-replica replication for read performance
- **Caching strategy**: Redis caches hot data to reduce database load
- **Data consistency**: transactions guarantee consistency for critical operations

## 7. Deployment Architecture

### 7.1 Development Environment
```
Development environment (Docker Compose)
├── Frontend container (React + Vite)
├── Backend container (Node.js + Express)
├── AI service container (Python + FastAPI)
├── Data service container (Python)
├── PostgreSQL container
├── Redis container
├── TimescaleDB container
└── Nginx container (reverse proxy)
```

### 7.2 Production Environment
```
Production environment (Kubernetes)
├── Namespace: stock-race
│   ├── Deployments:
│   │   ├── frontend-deployment (frontend)
│   │   ├── backend-deployment (backend)
│   │   ├── ai-service-deployment (AI service)
│   │   └── data-service-deployment (data service)
│   ├── Services:
│   │   ├── frontend-service (LoadBalancer)
│   │   ├── backend-service (ClusterIP)
│   │   ├── ai-service-service (ClusterIP)
│   │   └── data-service-service (ClusterIP)
│   ├── ConfigMaps/Secrets:
│   │   ├── Application configuration
│   │   ├── Database connections
│   │   └── API keys
│   ├── PersistentVolumes:
│   │   ├── postgres-pv (PostgreSQL data)
│   │   ├── redis-pv (Redis data)
│   │   └── timescale-pv (TimescaleDB data)
│   └── Monitoring:
│       ├── Prometheus
│       ├── Grafana
│       └── Application log collection
```

### 7.3 Scaling Plan
1. **Horizontal scaling**: stateless services (frontend, backend, AI service) can scale horizontally
2. **Database scaling**: PostgreSQL read/write splitting, Redis cluster
3. **CDN acceleration**: frontend static assets served via CDN
4. **Load balancing**: Nginx or cloud provider load balancers

## 8. Security Architecture

### 8.1 Network Security
- **HTTPS/TLS**: full-site HTTPS with Let's Encrypt certificates
- **WSS**: WebSocket Secure encrypted communication
- **Firewall**: cloud security groups, restricting unnecessary port access
- **DDoS protection**: cloud provider DDoS protection service

### 8.2 Application Security
- **Input validation**: all user input validated and sanitized
- **SQL injection prevention**: ORM parameterized queries
- **XSS prevention**: output encoding, CSP policy
- **CSRF prevention**: SameSite cookies, CSRF tokens

### 8.3 Data Security
- **Password encryption**: bcrypt salted hashing at rest
- **Sensitive data encryption**: database field encryption
- **API key management**: key rotation, least-privilege principle
- **Audit logging**: complete operation logs, tamper-proof

### 8.4 Financial Security
- **Trade validation**: prevents duplicate trades, overselling, price manipulation
- **Risk control**: maximum position limits, daily trade limits
- **Compliance checks**: trading-hours validation, trading-halt checks

## 9. Monitoring and Operations

### 9.1 Monitoring Metrics
- **Application performance**: response time, error rate, throughput
- **System resources**: CPU, memory, disk, network
- **Business metrics**: active users, trade volume, AI decision success rate
- **Data quality**: data latency, data completeness

### 9.2 Logging System
- **Structured logging**: JSON format for easy analysis
- **Log levels**: DEBUG, INFO, WARN, ERROR
- **Log collection**: ELK Stack or cloud logging service
- **Log retention**: business logs kept for 90 days, audit logs for 1 year

### 9.3 Alerting Mechanism
- **Threshold alerts**: automatic alerts when key metrics exceed thresholds
- **Anomaly detection**: machine-learning-based anomaly detection
- **Notification channels**: email, SMS, DingTalk, WeCom (Enterprise WeChat)
- **Alert escalation**: multi-level alerts, automatic escalation if unhandled

---

*Document version: v1.0*
*Created: 2026-02-02*
*Last updated: 2026-02-02*
*Maintainer: Architecture Design Agent*
