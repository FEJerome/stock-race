# Stock Race Trading AI Service

AI-powered trading decision service for AI accounts in the Stock Race platform.

## Overview

The AI Service provides intelligent trading decisions by analyzing stock data, portfolio positions, and market conditions using various AI models (OpenAI, DeepSeek, Claude, etc.). It's built with FastAPI and follows a modular, extensible architecture.

## Features

- **Multi-model AI Integration**: Support for OpenAI GPT, DeepSeek, Claude, and other AI providers
- **Intelligent Decision Making**: Generate buy/sell/hold recommendations with detailed reasoning
- **Risk Assessment**: Built-in risk analysis and confidence scoring
- **Caching System**: Redis-based caching for improved performance and cost reduction
- **Rate Limiting**: Configurable rate limiting per account
- **Comprehensive Logging**: Structured logging with Loguru
- **Health Monitoring**: Health checks and readiness/liveness probes
- **API Documentation**: Auto-generated OpenAPI documentation

## Architecture

```
ai-service/
├── src/ai_service/
│   ├── api/                    # API endpoints and routes
│   │   ├── endpoints/         # Endpoint modules
│   │   │   ├── health.py      # Health check endpoints
│   │   │   └── decision.py    # Decision endpoints
│   │   ├── dependencies.py    # Dependency injection
│   │   └── routes.py          # Main router
│   ├── core/                  # Core functionality
│   │   ├── config.py          # Configuration management
│   │   ├── database.py        # Database connection
│   │   ├── redis.py           # Redis connection
│   │   ├── security.py        # Authentication and authorization
│   │   └── exceptions.py      # Custom exceptions
│   ├── models/                # Data models
│   │   └── schemas.py         # Pydantic schemas
│   ├── services/              # Business logic
│   │   └── decision_service.py # Decision generation service
│   ├── adapters/              # AI model adapters
│   │   ├── base.py            # Base adapter interface
│   │   ├── openai_adapter.py  # OpenAI adapter
│   │   ├── deepseek_adapter.py # DeepSeek adapter
│   │   ├── claude_adapter.py  # Claude adapter
│   │   ├── qwen_adapter.py    # Qwen adapter (placeholder)
│   │   └── wenxin_adapter.py  # Wenxin adapter (placeholder)
│   ├── prompts/               # Prompt templates
│   │   ├── base_prompts.py    # Base prompt utilities
│   │   └── trading_prompts.py # Trading-specific prompts
│   ├── utils/                 # Utility functions
│   │   ├── logger.py          # Logging utilities
│   │   └── cache.py           # Cache utilities
│   └── main.py                # Application entry point
├── tests/                     # Test suite
│   ├── unit/                  # Unit tests
│   ├── integration/           # Integration tests
│   ├── fixtures/              # Test fixtures
│   └── conftest.py            # Pytest configuration
├── requirements.txt           # Python dependencies
├── pyproject.toml            # Project configuration
├── .env.example              # Environment variables template
└── README.md                 # This file
```

## Installation

### Prerequisites

- Python 3.9+
- Redis 6.0+
- PostgreSQL 13+ (optional, for decision logging)

### Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd stock-race/ai-service
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

5. Edit `.env` file with your configuration:
   ```bash
   # API Keys
   OPENAI_API_KEY=your-openai-api-key
   DEEPSEEK_API_KEY=your-deepseek-api-key
   ANTHROPIC_API_KEY=your-anthropic-api-key

   # Redis
   REDIS_URL=redis://localhost:6379

   # Database (optional)
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=stock_race
   DB_USER=postgres
   DB_PASSWORD=postgres
   ```

## Usage

### Running the Service

Development mode (auto-reload):
```bash
python -m ai_service.main
```

Production mode (using uvicorn directly):
```bash
uvicorn ai_service.main:app --host 0.0.0.0 --port 8000
```

### API Documentation

Once the service is running, access the API documentation:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Making API Calls

#### Generate a Trading Decision

```bash
curl -X POST "http://localhost:8000/api/v1/decision/generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "account_info": {
      "account_id": "acc_123456",
      "user_id": "user_789",
      "total_balance": 50000.00,
      "available_cash": 32475.00,
      "total_market_value": 17525.00,
      "total_unrealized_pnl": 475.00,
      "total_unrealized_pnl_percent": 2.79,
      "risk_tolerance": "medium",
      "trading_strategy": "growth"
    },
    "positions": [
      {
        "symbol": "AAPL",
        "quantity": 100,
        "avg_cost": 170.50,
        "current_price": 175.25
      }
    ],
    "stock_data": [
      {
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "current_price": 175.25,
        "open_price": 174.50,
        "high_price": 176.80,
        "low_price": 173.20,
        "volume": 50000000,
        "change": 0.75,
        "change_percent": 0.43,
        "market_cap": 2750000000000.00,
        "pe_ratio": 28.5,
        "dividend_yield": 0.0055,
        "ma_5": 174.80,
        "ma_20": 172.50,
        "ma_60": 168.75,
        "rsi": 58.5,
        "macd": 0.25
      }
    ],
    "ai_provider": "openai",
    "model_name": "gpt-3.5-turbo",
    "temperature": 0.7,
    "max_tokens": 2000
  }'
```

#### Health Check

```bash
curl "http://localhost:8000/api/v1/health/"
```

#### List Available AI Providers

```bash
curl "http://localhost:8000/api/v1/decision/providers"
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST` | Server host | `0.0.0.0` |
| `PORT` | Server port | `8000` |
| `DEBUG` | Debug mode | `False` |
| `CORS_ORIGINS` | CORS allowed origins | `http://localhost:3000` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `DEEPSEEK_API_KEY` | DeepSeek API key | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `QWEN_API_KEY` | Alibaba Qwen API key | - |
| `RATE_LIMIT_REQUESTS` | Rate limit requests per period | `100` |
| `RATE_LIMIT_PERIOD` | Rate limit period in seconds | `60` |
| `MAX_POSITION_SIZE` | Maximum position size | `100000.0` |
| `MIN_TRADE_AMOUNT` | Minimum trade amount | `1000.0` |
| `DEFAULT_TRADING_FEE` | Default trading fee | `0.001` |
| `BACKEND_URL` | Backend service URL | `http://localhost:3001` |
| `DATA_SERVICE_URL` | Data service URL | `http://localhost:8001` |
| `LOG_LEVEL` | Logging level | `INFO` |
| `LOG_FILE` | Log file path | `logs/ai_service.log` |
| `DEFAULT_MODEL` | Default AI model | `gpt-4-turbo-preview` |
| `DEFAULT_TEMPERATURE` | Default model temperature | `0.7` |
| `DEFAULT_MAX_TOKENS` | Default max tokens | `2000` |

### AI Providers

The service supports multiple AI providers:

1. **OpenAI** (`openai`): GPT-3.5, GPT-4 models
2. **DeepSeek** (`deepseek`): DeepSeek Chat, DeepSeek Coder
3. **Claude** (`claude`): Claude 3 models
4. **Qwen** (`qwen`): Alibaba Qwen models (placeholder)
5. **Wenxin** (`wenxin`): Baidu Wenxin models (placeholder)

Configure API keys in the `.env` file to enable providers.

## Development

### Running Tests

```bash
# Run all tests
pytest

# Run unit tests only
pytest tests/unit/

# Run integration tests only
pytest tests/integration/

# Run with coverage
pytest --cov=ai_service --cov-report=html
```

### Code Style

The project uses:
- **Black** for code formatting
- **isort** for import sorting
- **mypy** for type checking

```bash
# Format code
black src/ tests/

# Sort imports
isort src/ tests/

# Type checking
mypy src/
```

### Adding New AI Providers

1. Create a new adapter in `src/ai_service/adapters/`:
   ```python
   from .base import BaseAdapter, ModelRequest, ModelResponse

   class NewProviderAdapter(BaseAdapter):
       def __init__(self):
           super().__init__(provider=AIProvider.NEW_PROVIDER)
           self.default_model = "default-model"
           self.supported_models = ["model1", "model2"]

       async def initialize(self):
           # Initialize client
           pass

       async def generate(self, request: ModelRequest) -> ModelResponse:
           # Implement generation logic
           pass
   ```

2. Add provider to `AIProvider` enum in `schemas.py`

3. Update `AdapterFactory._create_adapter()` to include new provider

### Adding New Prompt Templates

1. Create new prompt templates in `src/ai_service/prompts/`:
   ```python
   from .base_prompts import BasePrompts

   class NewPrompts(BasePrompts):
       @classmethod
       def create_custom_prompt(cls, data):
           # Create custom prompt
           pass
   ```

2. Import and use in services

## Deployment

### Docker

Build Docker image:
```bash
docker build -t stock-race-ai-service .
```

Run with Docker Compose:
```bash
docker-compose up
```

### Kubernetes

Example deployment configuration:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ai-service
  template:
    metadata:
      labels:
        app: ai-service
    spec:
      containers:
      - name: ai-service
        image: stock-race-ai-service:latest
        ports:
        - containerPort: 8000
        envFrom:
        - secretRef:
            name: ai-service-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
```

## Monitoring

### Logs

Logs are written to `logs/ai_service.log` with rotation (500MB) and retention (10 days).

### Metrics

The service exposes Prometheus metrics at `/metrics` (if enabled).

### Health Checks

- `/health/` - Overall health status
- `/health/ready` - Readiness probe
- `/health/live` - Liveness probe
- `/health/detailed` - Detailed health information (requires API key)

## API Reference

### Decision Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/decision/generate` | POST | Generate trading decision |
| `/decision/batch-generate` | POST | Generate multiple decisions |
| `/decision/history` | GET | Get decision history |
| `/decision/providers` | GET | List AI providers |

### Health Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health/` | GET | Health check |
| `/health/ready` | GET | Readiness probe |
| `/health/live` | GET | Liveness probe |
| `/health/detailed` | GET | Detailed health (requires auth) |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run tests and ensure they pass
5. Submit a pull request

## License

[Add license information]

## Support

For issues and questions:
- Create an issue in the repository
- Contact the development team

---

*Last updated: February 2026*