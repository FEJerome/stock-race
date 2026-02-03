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

export {
  userRepository,
  aiAccountRepository,
  stockRepository,
  tradeRepository,
  portfolioRepository,
  decisionLogRepository,
  rankingRepository,
  watchlistRepository,
  systemLogRepository
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