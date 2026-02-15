import { UserRepository } from './UserRepository.js';
import { AIAccountRepository } from './AIAccountRepository.js';
import { StockRepository } from './StockRepository.js';
import { TradeRepository } from './TradeRepository.js';
import { PortfolioRepository } from './PortfolioRepository.js';
import { DecisionLogRepository } from './DecisionLogRepository.js';
import { RankingRepository } from './RankingRepository.js';
import { WatchlistRepository } from './WatchlistRepository.js';
import { SystemLogRepository } from './SystemLogRepository.js';

// 创建单例实例
const userRepository = new UserRepository();
const aiAccountRepository = new AIAccountRepository();
const stockRepository = new StockRepository();
const tradeRepository = new TradeRepository();
const portfolioRepository = new PortfolioRepository();
const decisionLogRepository = new DecisionLogRepository();
const rankingRepository = new RankingRepository();
const watchlistRepository = new WatchlistRepository();
const systemLogRepository = new SystemLogRepository();

// 联调阶段：禁止使用Mock Repository
// 所有数据操作必须使用真实的PostgreSQL连接
// 如需测试，请在测试环境中使用独立的mock文件

let competitionRepository;
let prisma;

// 检查是否配置了真实数据库
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL 未配置。联调阶段必须使用真实数据库。\n' +
    '请检查: 1) .env文件是否存在 2) 数据库连接字符串是否正确'
  );
}

// 实际repository将在app.js中初始化时注入
// 这里先导出占位符，确保模块加载不报错
competitionRepository = {
  paginate: async () => {
    throw new Error('competitionRepository 未正确初始化。请检查数据库连接。');
  },
  findOne: async () => {
    throw new Error('competitionRepository 未正确初始化。请检查数据库连接。');
  },
  create: async () => {
    throw new Error('competitionRepository 未正确初始化。请检查数据库连接。');
  },
  update: async () => {
    throw new Error('competitionRepository 未正确初始化。请检查数据库连接。');
  },
};

prisma = {
  $queryRaw: async () => {
    throw new Error('Prisma 未正确初始化。请检查数据库连接。');
  },
  $transaction: async () => {
    throw new Error('Prisma 未正确初始化。请检查数据库连接。');
  },
};

export {
  userRepository,
  aiAccountRepository,
  stockRepository,
  tradeRepository,
  portfolioRepository,
  decisionLogRepository,
  rankingRepository,
  watchlistRepository,
  systemLogRepository,
  competitionRepository,
  prisma
};

// 导出类以便需要时创建新实例
export {
  UserRepository,
  AIAccountRepository,
  StockRepository,
  TradeRepository,
  PortfolioRepository,
  DecisionLogRepository,
  RankingRepository,
  WatchlistRepository,
  SystemLogRepository
};