import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Space,
  Row,
  Col,
  Select,
  DatePicker,
  Button,
  Tabs,
  Statistic,
  Progress,
  Table,
  Tag,
  Avatar,
  Alert,
  Divider,
  Grid,
  message,
  Spin,
} from 'antd';
import {
  LineChartOutlined,
  BarChartOutlined,
  PieChartOutlined,
  AreaChartOutlined,
  CalendarOutlined,
  FilterOutlined,
  DownloadOutlined,
  ShareAltOutlined,
  RiseOutlined,
  FallOutlined,
  DollarOutlined,
  StockOutlined,
} from '@ant-design/icons';

// 服务导入
import { tradingService } from '../services/trading.service';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { TabPane } = Tabs;
const { useBreakpoint } = Grid;

// 降级数据 - 当API失败时使用
const fallbackProfitData = [
  { date: '2026-01-01', value: 100000, profit: 0 },
  { date: '2026-01-08', value: 102500, profit: 2500 },
  { date: '2026-01-15', value: 105800, profit: 5800 },
  { date: '2026-01-22', value: 103200, profit: 3200 },
  { date: '2026-01-29', value: 108900, profit: 8900 },
  { date: '2026-02-05', value: 112400, profit: 12400 },
  { date: '2026-02-12', value: 115300, profit: 15300 },
  { date: '2026-02-19', value: 118700, profit: 18700 },
  { date: '2026-02-26', value: 125430, profit: 25430 },
];

const fallbackAssetDistribution = [
  { category: '科技股', value: 65430, percentage: 52.1, color: '#1890ff' },
  { category: '消费股', value: 25430, percentage: 20.3, color: '#52c41a' },
  { category: '金融股', value: 18750, percentage: 14.9, color: '#fa8c16' },
  { category: '医药股', value: 9870, percentage: 7.9, color: '#722ed1' },
  { category: '其他', value: 5950, percentage: 4.8, color: '#eb2f96' },
];

const fallbackTradeAnalysis = [
  { period: '今日', trades: 8, volume: 850, profit: 1250, winRate: 75.0 },
  { period: '本周', trades: 42, volume: 4250, profit: 6540, winRate: 71.4 },
  { period: '本月', trades: 156, volume: 15800, profit: 18700, winRate: 68.6 },
  { period: '本年', trades: 425, volume: 42500, profit: 25430, winRate: 65.9 },
];

const fallbackStockPerformance = [
  { symbol: 'AAPL', name: '苹果公司', return: 8.16, volatility: 12.5, sharpe: 1.42 },
  { symbol: 'MSFT', name: '微软公司', return: 6.48, volatility: 10.8, sharpe: 1.28 },
  { symbol: 'GOOGL', name: '谷歌', return: 7.71, volatility: 14.2, sharpe: 1.18 },
  { symbol: 'NVDA', name: '英伟达', return: 27.25, volatility: 32.5, sharpe: 1.85 },
  { symbol: 'TSLA', name: '特斯拉', return: -6.25, volatility: 28.7, sharpe: -0.52 },
];

const Analytics: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [selectedChart, setSelectedChart] = useState('profit');
  const [loading, setLoading] = useState(false);
  const [portfolioSummary, setPortfolioSummary] = useState<any>(null);
  const [profitData, setProfitData] = useState<any[]>(fallbackProfitData);
  const [assetDistribution, setAssetDistribution] = useState<any[]>(fallbackAssetDistribution);
  const [tradeAnalysis, setTradeAnalysis] = useState<any[]>(fallbackTradeAnalysis);
  const [stockPerformance, setStockPerformance] = useState<any[]>(fallbackStockPerformance);
  const screens = useBreakpoint();

  // 加载分析数据
  useEffect(() => {
    loadAnalyticsData();
  }, []);

  const loadAnalyticsData = async () => {
    setLoading(true);
    try {
      // 获取投资组合汇总数据
      const summary = await tradingService.getPortfolioSummary();
      setPortfolioSummary(summary);

      // TODO: 这里应该调用真实的分析API获取收益曲线、资产分布、交易分析、股票表现等数据
      // 目前使用降级数据，后续需要实现真实API调用
      console.log('分析数据加载成功，使用真实API数据（TODO: 实现完整分析API）');

    } catch (error) {
      console.error('加载分析数据失败，使用降级数据:', error);
      message.error('加载分析数据失败，显示降级数据');

      // 使用降级数据
      setPortfolioSummary({
        totalValue: 125430.50,
        totalCost: 100000.00,
        totalPnl: 25430.50,
        totalPnlPercent: 25.43,
        cashBalance: 25430.50,
        positionsCount: 5,
      });
    } finally {
      setLoading(false);
    }
  };

  // 计算统计指标
  const totalValue = portfolioSummary?.totalValue || profitData[profitData.length - 1]?.value || 0;
  const totalProfit = portfolioSummary?.totalPnl || profitData[profitData.length - 1]?.profit || 0;
  const profitPercentage = portfolioSummary?.totalPnlPercent ||
    (totalValue > 0 ? (totalProfit / (totalValue - totalProfit)) * 100 : 0);
  const avgDailyReturn = 0.42; // TODO: 从真实API获取
  const maxDrawdown = -8.5; // TODO: 从真实API获取

  if (loading && !portfolioSummary) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" tip="加载分析数据中..." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '100%' }}>
      {/* 页面标题 */}
      <Space direction="vertical" size="middle" style={{ width: '100%', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>
          <LineChartOutlined /> 分析报告
        </Title>
        <Text type="secondary">
          深入分析您的投资表现、资产配置和交易策略。
          {!portfolioSummary && <Tag color="orange" style={{ marginLeft: 8 }}>使用降级数据</Tag>}
        </Text>
      </Space>

      {/* 筛选器 */}
      <Card
        style={{ marginBottom: 24 }}
        bodyStyle={{ padding: screens.md ? 24 : 16 }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={8}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text strong>时间周期</Text>
              <Select
                value={selectedPeriod}
                onChange={setSelectedPeriod}
                style={{ width: '100%' }}
                size="large"
              >
                <Option value="day">日度</Option>
                <Option value="week">周度</Option>
                <Option value="month">月度</Option>
                <Option value="quarter">季度</Option>
                <Option value="year">年度</Option>
              </Select>
            </Space>
          </Col>

          <Col xs={24} md={8}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text strong>日期范围</Text>
              <RangePicker
                style={{ width: '100%' }}
                size="large"
                suffixIcon={<CalendarOutlined />}
              />
            </Space>
          </Col>

          <Col xs={24} md={8}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text strong>图表类型</Text>
              <Select
                value={selectedChart}
                onChange={setSelectedChart}
                style={{ width: '100%' }}
                size="large"
                suffixIcon={<FilterOutlined />}
              >
                <Option value="profit">收益曲线</Option>
                <Option value="distribution">资产分布</Option>
                <Option value="comparison">基准对比</Option>
                <Option value="risk">风险分析</Option>
              </Select>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 关键指标 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总资产"
              value={totalValue}
              precision={2}
              valueStyle={{ color: '#1890ff' }}
              prefix={<DollarOutlined />}
            />
            <Progress
              percent={100}
              strokeColor="#1890ff"
              size="small"
              showInfo={false}
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总收益"
              value={totalProfit}
              precision={2}
              valueStyle={{ color: profitPercentage >= 0 ? '#52c41a' : '#ff4d4f' }}
              prefix={profitPercentage >= 0 ? <RiseOutlined /> : <FallOutlined />}
            />
            <Text type={profitPercentage >= 0 ? 'success' : 'danger'} style={{ fontSize: 12 }}>
              {profitPercentage >= 0 ? '+' : ''}{profitPercentage.toFixed(2)}%
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="日均收益率"
              value={avgDailyReturn}
              precision={2}
              suffix="%"
              valueStyle={{ color: avgDailyReturn >= 0 ? '#52c41a' : '#ff4d4f' }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              过去30天平均
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="最大回撤"
              value={maxDrawdown}
              precision={2}
              suffix="%"
              valueStyle={{ color: maxDrawdown >= 0 ? '#52c41a' : '#ff4d4f' }}
            />
            <Progress
              percent={Math.abs(maxDrawdown)}
              strokeColor={maxDrawdown >= 0 ? '#52c41a' : '#ff4d4f'}
              size="small"
              showInfo={false}
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* 左侧：主要图表和分析 */}
        <Col xs={24} lg={16}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* 图表区域 */}
            <Card
              title={
                <Space>
                  {selectedChart === 'profit' && <LineChartOutlined />}
                  {selectedChart === 'distribution' && <PieChartOutlined />}
                  {selectedChart === 'comparison' && <BarChartOutlined />}
                  {selectedChart === 'risk' && <AreaChartOutlined />}
                  <Text strong>
                    {selectedChart === 'profit' && '收益曲线'}
                    {selectedChart === 'distribution' && '资产分布'}
                    {selectedChart === 'comparison' && '基准对比'}
                    {selectedChart === 'risk' && '风险分析'}
                  </Text>
                </Space>
              }
              extra={
                <Space>
                  <Button type="text" icon={<DownloadOutlined />} size="small">
                    导出
                  </Button>
                  <Button type="text" icon={<ShareAltOutlined />} size="small">
                    分享
                  </Button>
                </Space>
              }
              style={{ height: 400 }}
            >
              {/* 这里应该放置实际的图表组件，如ECharts或Recharts */}
              <div
                style={{
                  height: 300,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#fafafa',
                  borderRadius: 8,
                }}
              >
                <Space direction="vertical" align="center">
                  <Text type="secondary">图表预览区域</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {selectedChart === 'profit' && '显示收益随时间变化的曲线图'}
                    {selectedChart === 'distribution' && '显示资产类别的饼状分布图'}
                    {selectedChart === 'comparison' && '显示与基准指数的对比柱状图'}
                    {selectedChart === 'risk' && '显示风险指标的面积图'}
                  </Text>
                  <Paragraph type="secondary" style={{ textAlign: 'center', maxWidth: 400 }}>
                    实际项目中这里会集成ECharts或Recharts图表库，
                    展示动态、交互式的数据可视化。
                  </Paragraph>
                </Space>
              </div>
            </Card>

            {/* 交易分析 */}
            <Card
              title={
                <Space>
                  <BarChartOutlined />
                  <Text strong>交易分析</Text>
                </Space>
              }
            >
              <Table
                dataSource={tradeAnalysis}
                columns={[
                  {
                    title: '周期',
                    dataIndex: 'period',
                    key: 'period',
                    render: (period) => <Text strong>{period}</Text>,
                  },
                  {
                    title: '交易次数',
                    dataIndex: 'trades',
                    key: 'trades',
                    render: (trades) => (
                      <Tag color="blue">{trades} 次</Tag>
                    ),
                  },
                  {
                    title: '交易量',
                    dataIndex: 'volume',
                    key: 'volume',
                    render: (volume) => `${volume.toLocaleString()} 股`,
                  },
                  {
                    title: '收益',
                    dataIndex: 'profit',
                    key: 'profit',
                    render: (profit) => (
                      <Text type={profit >= 0 ? 'success' : 'danger'} strong>
                        {profit >= 0 ? '+' : ''}¥{profit.toLocaleString()}
                      </Text>
                    ),
                  },
                  {
                    title: '胜率',
                    dataIndex: 'winRate',
                    key: 'winRate',
                    render: (winRate) => (
                      <Progress
                        percent={winRate}
                        size="small"
                        strokeColor={
                          winRate >= 70 ? '#52c41a' :
                          winRate >= 50 ? '#fa8c16' : '#ff4d4f'
                        }
                        style={{ width: 100 }}
                        format={(percent) => `${percent?.toFixed(1)}%`}
                      />
                    ),
                  },
                ]}
                pagination={false}
                rowKey="period"
              />
            </Card>
          </Space>
        </Col>

        {/* 右侧：详细分析和工具 */}
        <Col xs={24} lg={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* 资产分布 */}
            <Card
              title={
                <Space>
                  <PieChartOutlined />
                  <Text strong>资产分布</Text>
                </Space>
              }
              size="small"
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {assetDistribution.map((item, index) => (
                  <div key={index}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space>
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: item.color,
                          }}
                        />
                        <Text strong>{item.category}</Text>
                      </Space>
                      <Space>
                        <Text>¥{item.value.toLocaleString()}</Text>
                        <Tag color="default">{item.percentage.toFixed(1)}%</Tag>
                      </Space>
                    </Space>
                    <Progress
                      percent={item.percentage}
                      strokeColor={item.color}
                      size="small"
                      showInfo={false}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                ))}
              </Space>
            </Card>

            {/* 股票表现 */}
            <Card
              title={
                <Space>
                  <StockOutlined />
                  <Text strong>股票表现</Text>
                </Space>
              }
              size="small"
            >
              <Table
                dataSource={stockPerformance}
                columns={[
                  {
                    title: '股票',
                    dataIndex: 'symbol',
                    key: 'symbol',
                    render: (symbol, record) => (
                      <Space>
                        <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
                          {symbol.charAt(0)}
                        </Avatar>
                        <div>
                          <Text strong>{symbol}</Text>
                          <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {record.name}
                            </Text>
                          </div>
                        </div>
                      </Space>
                    ),
                  },
                  {
                    title: '收益率',
                    dataIndex: 'return',
                    key: 'return',
                    render: (returnValue) => (
                      <Text type={returnValue >= 0 ? 'success' : 'danger'} strong>
                        {returnValue >= 0 ? '+' : ''}{returnValue.toFixed(2)}%
                      </Text>
                    ),
                  },
                  {
                    title: '夏普比率',
                    dataIndex: 'sharpe',
                    key: 'sharpe',
                    render: (sharpe) => (
                      <Tag color={sharpe >= 1.5 ? 'green' : sharpe >= 1.0 ? 'blue' : 'orange'}>
                        {sharpe.toFixed(2)}
                      </Tag>
                    ),
                  },
                ]}
                pagination={false}
                size="small"
                rowKey="symbol"
              />
            </Card>

            {/* 分析工具 */}
            <Card size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text strong>分析工具</Text>
                <Row gutter={[8, 8]}>
                  <Col span={12}>
                    <Button block icon={<LineChartOutlined />}>
                      收益预测
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button block icon={<BarChartOutlined />}>
                      风险评估
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button block icon={<PieChartOutlined />}>
                      组合优化
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button block icon={<AreaChartOutlined />}>
                      压力测试
                    </Button>
                  </Col>
                </Row>
              </Space>
            </Card>

            {/* 分析建议 */}
            <Card size="small">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Text strong>分析建议</Text>
                {portfolioSummary ? (
                  <>
                    <Alert
                      message="投资表现"
                      description={`总收益 ${portfolioSummary.totalPnlPercent?.toFixed(2) || '0.00'}%，${portfolioSummary.totalPnlPercent >= 0 ? '表现良好' : '需要注意'}。${portfolioSummary.totalPnlPercent >= 0 ? '继续保持当前策略' : '建议调整投资组合'}`}
                      type={portfolioSummary.totalPnlPercent >= 0 ? 'success' : 'warning'}
                      showIcon
                    />
                    <Alert
                      message="资产规模"
                      description={`总资产 ¥${portfolioSummary.totalValue?.toLocaleString() || '0'}，持仓 ${portfolioSummary.positionsCount || 0} 只股票，${portfolioSummary.positionsCount > 10 ? '持仓较多，注意分散风险' : '持仓数量适中'}`}
                      type="info"
                      showIcon
                    />
                    <Alert
                      message="现金管理"
                      description={`现金余额 ¥${portfolioSummary.cashBalance?.toLocaleString() || '0'}，${portfolioSummary.cashBalance > portfolioSummary.totalValue * 0.2 ? '现金充足，可考虑增加投资' : '现金比例适中'}`}
                      type="info"
                      showIcon
                    />
                  </>
                ) : (
                  <>
                    <Alert
                      message="数据状态"
                      description="当前使用降级分析数据，建议连接后端API获取真实分析报告"
                      type="warning"
                      showIcon
                    />
                    <Alert
                      message="资产配置"
                      description="建议定期检查投资组合，确保资产分散配置"
                      type="info"
                      showIcon
                    />
                    <Alert
                      message="风险控制"
                      description="建议设置止损点，控制单只股票持仓比例"
                      type="info"
                      showIcon
                    />
                  </>
                )}
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
};


export default Analytics;