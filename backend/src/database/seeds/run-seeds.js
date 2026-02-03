import { getPrismaClient } from '../../config/database.js';
import bcrypt from 'bcryptjs';

/**
 * 运行数据库种子
 */
async function runSeeds() {
  const prisma = getPrismaClient();

  try {
    console.log('🌱 开始执行数据库种子...');

    // 连接到数据库
    await prisma.$connect();
    console.log('✅ 数据库连接成功');

    // 检查是否已存在种子数据
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log('⚠️  数据库已有数据，跳过种子执行');
      return;
    }

    // 执行种子
    await seedUsers(prisma);
    await seedStocks(prisma);
    await seedAIAccounts(prisma);
    await seedWatchlist(prisma);

    console.log('✅ 数据库种子完成');
  } catch (error) {
    console.error('❌ 数据库种子失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 种子用户数据
 * @param {PrismaClient} prisma - Prisma客户端
 */
async function seedUsers(prisma) {
  console.log('👤 创建用户数据...');

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('admin123', salt);

  const user = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@stockrace.com',
      passwordHash,
      salt,
      status: 'active',
      userSettings: {
        create: {
          theme: 'light',
          language: 'zh_CN',
          timezone: 'Asia/Shanghai',
          currency: 'CNY',
          notifications: {
            tradeExecuted: true,
            aiDecision: true,
            priceAlert: false,
            systemMaintenance: true,
            marketing: false
          },
          chartSettings: {
            defaultPeriod: '1d',
            showVolume: true,
            showMA: true,
            theme: 'light'
          }
        }
      }
    }
  });

  console.log(`✅ 创建用户: ${user.username}`);
}

/**
 * 种子股票数据
 * @param {PrismaClient} prisma - Prisma客户端
 */
async function seedStocks(prisma) {
  console.log('📈 创建股票数据...');

  const shanghai50Stocks = [
    { code: '000001', name: '平安银行', market: 'sz', industry: '银行' },
    { code: '000002', name: '万科A', market: 'sz', industry: '房地产' },
    { code: '000858', name: '五粮液', market: 'sz', industry: '食品饮料' },
    { code: '000333', name: '美的集团', market: 'sz', industry: '家用电器' },
    { code: '000651', name: '格力电器', market: 'sz', industry: '家用电器' },
    { code: '000725', name: '京东方A', market: 'sz', industry: '电子' },
    { code: '000776', name: '广发证券', market: 'sz', industry: '非银金融' },
    { code: '000895', name: '双汇发展', market: 'sz', industry: '食品饮料' },
    { code: '000938', name: '紫光股份', market: 'sz', industry: '计算机' },
    { code: '000963', name: '华东医药', market: 'sz', industry: '医药生物' },
    { code: '600000', name: '浦发银行', market: 'sh', industry: '银行' },
    { code: '600009', name: '上海机场', market: 'sh', industry: '交通运输' },
    { code: '600010', name: '包钢股份', market: 'sh', industry: '钢铁' },
    { code: '600011', name: '华能国际', market: 'sh', industry: '公用事业' },
    { code: '600015', name: '华夏银行', market: 'sh', industry: '银行' },
    { code: '600016', name: '民生银行', market: 'sh', industry: '银行' },
    { code: '600018', name: '上港集团', market: 'sh', industry: '交通运输' },
    { code: '600019', name: '宝钢股份', market: 'sh', industry: '钢铁' },
    { code: '600028', name: '中国石化', market: 'sh', industry: '化工' },
    { code: '600029', name: '南方航空', market: 'sh', industry: '交通运输' },
    { code: '600030', name: '中信证券', market: 'sh', industry: '非银金融' },
    { code: '600031', name: '三一重工', market: 'sh', industry: '机械设备' },
    { code: '600036', name: '招商银行', market: 'sh', industry: '银行' },
    { code: '600048', name: '保利发展', market: 'sh', industry: '房地产' },
    { code: '600050', name: '中国联通', market: 'sh', industry: '通信' },
    { code: '600104', name: '上汽集团', market: 'sh', industry: '汽车' },
    { code: '600109', name: '国金证券', market: 'sh', industry: '非银金融' },
    { code: '600111', name: '北方稀土', market: 'sh', industry: '有色金属' },
    { code: '600115', name: '东方航空', market: 'sh', industry: '交通运输' },
    { code: '600118', name: '中国卫星', market: 'sh', industry: '国防军工' },
    { code: '600150', name: '中国船舶', market: 'sh', industry: '国防军工' },
    { code: '600176', name: '中国巨石', market: 'sh', industry: '建筑材料' },
    { code: '600188', name: '兖矿能源', market: 'sh', industry: '煤炭' },
    { code: '600196', name: '复星医药', market: 'sh', industry: '医药生物' },
    { code: '600276', name: '恒瑞医药', market: 'sh', industry: '医药生物' },
    { code: '600309', name: '万华化学', market: 'sh', industry: '化工' },
    { code: '600340', name: '华夏幸福', market: 'sh', industry: '房地产' },
    { code: '600346', name: '恒力石化', market: 'sh', industry: '化工' },
    { code: '600362', name: '江西铜业', market: 'sh', industry: '有色金属' },
    { code: '600383', name: '金地集团', market: 'sh', industry: '房地产' },
    { code: '600406', name: '国电南瑞', market: 'sh', industry: '电气设备' },
    { code: '600436', name: '片仔癀', market: 'sh', industry: '医药生物' },
    { code: '600438', name: '通威股份', market: 'sh', industry: '电气设备' },
    { code: '600489', name: '中金黄金', market: 'sh', industry: '有色金属' },
    { code: '600519', name: '贵州茅台', market: 'sh', industry: '食品饮料' },
    { code: '600547', name: '山东黄金', market: 'sh', industry: '有色金属' },
    { code: '600570', name: '恒生电子', market: 'sh', industry: '计算机' },
    { code: '600585', name: '海螺水泥', market: 'sh', industry: '建筑材料' },
    { code: '600588', name: '用友网络', market: 'sh', industry: '计算机' },
    { code: '600606', name: '绿地控股', market: 'sh', industry: '房地产' },
    { code: '600637', name: '东方明珠', market: 'sh', industry: '传媒' },
    { code: '600660', name: '福耀玻璃', market: 'sh', industry: '汽车' },
    { code: '600690', name: '海尔智家', market: 'sh', industry: '家用电器' },
    { code: '600703', name: '三安光电', market: 'sh', industry: '电子' },
    { code: '600705', name: '中航资本', market: 'sh', industry: '非银金融' },
    { code: '600741', name: '华域汽车', market: 'sh', industry: '汽车' },
    { code: '600745', name: '闻泰科技', market: 'sh', industry: '电子' },
    { code: '600809', name: '山西汾酒', market: 'sh', industry: '食品饮料' },
    { code: '600837', name: '海通证券', market: 'sh', industry: '非银金融' },
    { code: '600887', name: '伊利股份', market: 'sh', industry: '食品饮料' },
    { code: '600893', name: '航发动力', market: 'sh', industry: '国防军工' },
    { code: '600900', name: '长江电力', market: 'sh', industry: '公用事业' },
    { code: '600958', name: '东方证券', market: 'sh', industry: '非银金融' },
    { code: '600999', name: '招商证券', market: 'sh', industry: '非银金融' },
    { code: '601006', name: '大秦铁路', market: 'sh', industry: '交通运输' },
    { code: '601012', name: '隆基绿能', market: 'sh', industry: '电气设备' },
    { code: '601018', name: '宁波港', market: 'sh', industry: '交通运输' },
    { code: '601088', name: '中国神华', market: 'sh', industry: '煤炭' },
    { code: '601111', name: '中国国航', market: 'sh', industry: '交通运输' },
    { code: '601138', name: '工业富联', market: 'sh', industry: '电子' },
    { code: '601166', name: '兴业银行', market: 'sh', industry: '银行' },
    { code: '601169', name: '北京银行', market: 'sh', industry: '银行' },
    { code: '601186', name: '中国铁建', market: 'sh', industry: '建筑装饰' },
    { code: '601198', name: '东兴证券', market: 'sh', industry: '非银金融' },
    { code: '601211', name: '国泰君安', market: 'sh', industry: '非银金融' },
    { code: '601216', name: '君正集团', market: 'sh', industry: '化工' },
    { code: '601225', name: '陕西煤业', market: 'sh', industry: '煤炭' },
    { code: '601229', name: '上海银行', market: 'sh', industry: '银行' },
    { code: '601288', name: '农业银行', market: 'sh', industry: '银行' },
    { code: '601318', name: '中国平安', market: 'sh', industry: '非银金融' },
    { code: '601328', name: '交通银行', market: 'sh', industry: '银行' },
    { code: '601336', name: '新华保险', market: 'sh', industry: '非银金融' },
    { code: '601360', name: '三六零', market: 'sh', industry: '计算机' },
    { code: '601398', name: '工商银行', market: 'sh', industry: '银行' },
    { code: '601601', name: '中国太保', market: 'sh', industry: '非银金融' },
    { code: '601628', name: '中国人寿', market: 'sh', industry: '非银金融' },
    { code: '601668', name: '中国建筑', market: 'sh', industry: '建筑装饰' },
    { code: '601669', name: '中国电建', market: 'sh', industry: '建筑装饰' },
    { code: '601688', name: '华泰证券', market: 'sh', industry: '非银金融' },
    { code: '601766', name: '中国中车', market: 'sh', industry: '机械设备' },
    { code: '601800', name: '中国交建', market: 'sh', industry: '建筑装饰' },
    { code: '601818', name: '光大银行', market: 'sh', industry: '银行' },
    { code: '601857', name: '中国石油', market: 'sh', industry: '化工' },
    { code: '601878', name: '浙商证券', market: 'sh', industry: '非银金融' },
    { code: '601881', name: '中国银河', market: 'sh', industry: '非银金融' },
    { code: '601888', name: '中国中免', market: 'sh', industry: '商贸零售' },
    { code: '601898', name: '中煤能源', market: 'sh', industry: '煤炭' },
    { code: '601899', name: '紫金矿业', market: 'sh', industry: '有色金属' },
    { code: '601919', name: '中远海控', market: 'sh', industry: '交通运输' },
    { code: '601939', name: '建设银行', market: 'sh', industry: '银行' },
    { code: '601988', name: '中国银行', market: 'sh', industry: '银行' },
    { code: '601989', name: '中国重工', market: 'sh', industry: '国防军工' },
    { code: '601992', name: '金隅集团', market: 'sh', industry: '建筑材料' },
    { code: '601998', name: '中信银行', market: 'sh', industry: '银行' },
  ];

  for (const stockData of shanghai50Stocks) {
    const stock = await prisma.stock.upsert({
      where: { code: stockData.code },
      update: stockData,
      create: stockData
    });
    console.log(`✅ 创建股票: ${stock.code} - ${stock.name}`);
  }
}

/**
 * 种子AI账户数据
 * @param {PrismaClient} prisma - Prisma客户端
 */
async function seedAIAccounts(prisma) {
  console.log('🤖 创建AI账户数据...');

  // 获取管理员用户
  const adminUser = await prisma.user.findUnique({
    where: { username: 'admin' }
  });

  if (!adminUser) {
    throw new Error('管理员用户不存在');
  }

  const aiAccount = await prisma.aIAccount.create({
    data: {
      userId: adminUser.id,
      name: '保守型AI',
      description: '基于价值投资的保守策略AI',
      modelType: 'openai_gpt4',
      initialBalance: 100000.00,
      currentBalance: 100000.00,
      totalValue: 100000.00,
      status: 'active',
      tradingFrequency: 'daily',
      riskLevel: 'low',
      promptTemplate: 'value_investing_v1',
      config: {
        maxPositionSize: 0.2,
        stopLoss: 0.03,
        takeProfit: 0.1,
        maxStocks: 10
      }
    }
  });

  console.log(`✅ 创建AI账户: ${aiAccount.name}`);

  // 创建更多AI账户示例
  const additionalAccounts = [
    {
      name: '激进型AI',
      description: '基于技术分析的激进策略AI',
      modelType: 'claude',
      riskLevel: 'high',
      tradingFrequency: 'hourly',
      config: {
        maxPositionSize: 0.4,
        stopLoss: 0.08,
        takeProfit: 0.2,
        maxStocks: 5
      }
    },
    {
      name: '平衡型AI',
      description: '平衡价值与成长的策略AI',
      modelType: 'openai_gpt35',
      riskLevel: 'medium',
      tradingFrequency: 'daily',
      config: {
        maxPositionSize: 0.3,
        stopLoss: 0.05,
        takeProfit: 0.15,
        maxStocks: 8
      }
    }
  ];

  for (const accountData of additionalAccounts) {
    const account = await prisma.aIAccount.create({
      data: {
        userId: adminUser.id,
        ...accountData,
        initialBalance: 100000.00,
        currentBalance: 100000.00,
        totalValue: 100000.00,
        status: 'active',
        promptTemplate: 'default_trading_v1'
      }
    });
    console.log(`✅ 创建AI账户: ${account.name}`);
  }
}

/**
 * 种子关注列表数据
 * @param {PrismaClient} prisma - Prisma客户端
 */
async function seedWatchlist(prisma) {
  console.log('⭐ 创建关注列表数据...');

  // 获取管理员用户
  const adminUser = await prisma.user.findUnique({
    where: { username: 'admin' }
  });

  if (!adminUser) {
    throw new Error('管理员用户不存在');
  }

  // 添加一些股票到关注列表
  const watchlistStocks = ['000001', '600036', '600519', '000858', '600887'];

  for (const stockCode of watchlistStocks) {
    const stock = await prisma.stock.findUnique({
      where: { code: stockCode }
    });

    if (stock) {
      await prisma.watchlist.create({
        data: {
          userId: adminUser.id,
          stockId: stock.id,
          customName: `${stock.name} (关注)`,
          notes: '重点关注股票',
          sortOrder: watchlistStocks.indexOf(stockCode)
        }
      });
      console.log(`✅ 添加到关注列表: ${stock.code} - ${stock.name}`);
    }
  }
}

// 执行种子
runSeeds().catch(error => {
  console.error('❌ 种子执行失败:', error);
  process.exit(1);
});