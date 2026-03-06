import React, { useState } from 'react';
import {
  Row,
  Col,
  Card,
  Statistic,
  Typography,
  Space,
  Button,
  Progress,
  List,
  Avatar,
  Tag,
  Grid,
  Spin,
  Alert,
  Select,
} from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  StockOutlined,
  WalletOutlined,
  LineChartOutlined,
  TrophyOutlined,
  FireOutlined,
  RiseOutlined,
  FallOutlined,
  DashboardOutlined,
  ReloadOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import ProfitChart from '../components/charts/ProfitChart';
import PortfolioSummary from '../components/portfolio/PortfolioSummary';
import RealTimeQuotes from '../components/market/RealTimeQuotes';
import AIDecisionLog from '../components/ai/AIDecisionLog';
import { tradingService } from '../services/trading.service';
import { marketService } from '../services/market.service';
import { aiService } from '../services/ai.service';
import { marketStatusService } from '../services/market-status.service';
import { formatCurrency, formatPercent } from '../utils/formatters';
import { AIAccount } from '../types/api.types';

const { Title, Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;
const { Option } = Select;

const Dashboard: React.FC = () => {
  const screens = useBreakpoint();
  const [selectedAIAccountId, setSelectedAIAccountId] = useState<string>('');

  // 获取用户的所有AI账户
  const { data: aiAccounts, isLoading: aiAccountsLoading } = useQuery(
    'aiAccounts',
    () => aiService.getAIAccounts(),
    {
      onSuccess: (accounts) => {
        // 如果有AI账户但未选择，默认选择第一个活跃账户
        if (accounts.length > 0 && !selectedAIAccountId) {
          const activeAccount = accounts.find(account => account.isActive) || accounts[0];
          setSelectedAIAccountId(activeAccount.id);
        }
      }
    }
  );

  // 获取市场状态
  const { data: marketStatus, isLoading: marketStatusLoading } = useQuery(
    'marketStatus',
    () => marketStatusService.getMarketStatus(),
    {
      refetchInterval: 60000, // 每60秒刷新一次
      staleTime: 30000, // 30秒内不使用网络请求
    }
  );

  // 使用React Query获取数据，根据选中的AI账户
  const { data: portfolioSummary, isLoading: portfolioLoading, refetch: refetchPortfolio } = useQuery(
    ['portfolioSummary', selectedAIAccountId],
    () => tradingService.getPortfolioSummary(selectedAIAccountId),
    {
      enabled: !!selectedAIAccountId,
    }
  );

  const { data: positions, isLoading: positionsLoading, refetch: refetchPositions } = useQuery(
    ['positions', selectedAIAccountId],
    () => tradingService.getPositions(selectedAIAccountId),
    {
      enabled: !!selectedAIAccountId,
    }
  );

  const { data: recentOrders, isLoading: ordersLoading, refetch: refetchOrders } = useQuery(
    ['recentOrders', selectedAIAccountId],
    () => tradingService.getOrders({ page: 1, pageSize: 5, accountId: selectedAIAccountId }),
    {
      enabled: !!selectedAIAccountId,
    }
  );

  const { data: aiDecisions, isLoading: aiDecisionsLoading, refetch: refetchAiDecisions } = useQuery(
    ['aiDecisions', selectedAIAccountId],
    () => aiService.getAIDecisions(selectedAIAccountId, { page: 1, pageSize: 5 }),
    {
      enabled: !!selectedAIAccountId,
    }
  );

  const { data: marketData, isLoading: marketLoading, refetch: refetchMarket } = useQuery(
    'marketData',
    () => marketService.getStockQuotes()
  );

  // 刷新所有数据
  const refreshAllData = () => {
    refetchPortfolio();
    refetchPositions();
    refetchOrders();
    refetchAiDecisions();
    refetchMarket();
  };

  // 计算统计数据
  const topPositions = positions
    ?.sort((a, b) => b.unrealizedPnlPercent - a.unrealizedPnlPercent)
    .slice(0, 5)
    .map(pos => ({
      symbol: pos.stockSymbol,
      name: pos.stockName,
      value: pos.marketValue,
      pnl: pos.unrealizedPnl,
      pnlPercent: pos.unrealizedPnlPercent,
    })) || [];

  const recentTrades = recentOrders?.items.map(order => ({
    symbol: order.stockSymbol,
    action: order.orderType === 'buy' ? '买入' : '卖出',
    quantity: order.quantity,
    price: order.price,
    time: new Date(order.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
  })) || [];

  const formattedAiDecisions = aiDecisions?.items.map(decision => ({
    symbol: decision.stockSymbol,
    action: decision.action === 'buy' ? '买入' : decision.action === 'sell' ? '卖出' : '持有',
    confidence: decision.confidence,
    reason: decision.reason,
  })) || [];

  const isLoading = portfolioLoading || positionsLoading || ordersLoading || aiDecisionsLoading || marketLoading || aiAccountsLoading;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <Spin size="large" tip="加载数据中..." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '100%' }}>
      {/* 页面标题 */}
      <Space direction="vertical" size="middle" style={{ width: '100%', marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              <DashboardOutlined /> 仪表盘
            </Title>
            <Text type="secondary">
              欢迎回来！这里是您的投资概览和实时监控面板。
            </Text>
          </Col>
          <Col>
            <Button
              icon={<ReloadOutlined />}
              onClick={refreshAllData}
              loading={isLoading}
            >
              刷新数据
            </Button>
          </Col>
        </Row>

        {/* AI账户选择器 */}
        <Row align="middle" gutter={[16, 0]}>
          <Col>
            <Text strong>
              <RobotOutlined /> 选择AI账户:
            </Text>
          </Col>
          <Col flex="auto">
            <Select
              style={{ width: '100%', maxWidth: 300 }}
              placeholder="选择AI账户查看投资组合"
              value={selectedAIAccountId || undefined}
              onChange={setSelectedAIAccountId}
              loading={aiAccountsLoading}
              disabled={aiAccountsLoading}
            >
              {aiAccounts?.map((account: AIAccount) => (
                <Option key={account.id} value={account.id}>
                  {account.name} ({account.modelType}) {account.isActive ? '✅' : '⏸️'}
                </Option>
              ))}
            </Select>
          </Col>
          <Col>
            <Text type="secondary">
              {selectedAIAccountId ? `当前查看: ${aiAccounts?.find(a => a.id === selectedAIAccountId)?.name || '未知账户'}` : '请选择AI账户'}
            </Text>
          </Col>
        </Row>
      </Space>

      {/* 市场状态显示 */}
      {marketStatus && !marketStatusLoading && (
        <Alert
          message={`市场状态: ${marketStatus.description}`}
          description={
            <div>
              <div>当前状态: {marketStatus.status === 'open' ? '交易中' :
                marketStatus.status === 'closed' ? '已收盘' :
                marketStatus.status === 'pre_open' ? '开盘前' :
                marketStatus.status === 'lunch_break' ? '午间休市' :
                marketStatus.status === 'after_hours' ? '收盘后' :
                marketStatus.status === 'weekend' ? '周末休市' : '未知状态'}</div>
              {marketStatus.nextTradingTime && (
                <div>下次交易时间: {new Date(marketStatus.nextTradingTime).toLocaleString('zh-CN')}</div>
              )}
              {marketStatus.dataServiceStatus !== 'healthy' && (
                <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                  数据服务状态: {marketStatus.dataServiceStatus === 'degraded' ? '部分降级' : '不可用'}，
                  数据状态: {marketStatus.dataStatus === 'realtime' ? '实时' : '历史'}数据
                  {marketStatus.isFallback && '（降级数据）'}
                </div>
              )}
            </div>
          }
          type={marketStatus.status === 'open' ? 'success' :
                marketStatus.status === 'closed' || marketStatus.status === 'after_hours' ? 'info' :
                marketStatus.status === 'pre_open' || marketStatus.status === 'lunch_break' ? 'warning' :
                marketStatus.status === 'weekend' ? 'warning' : 'info'}
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* 如果没有选择AI账户，显示提示 */}
      {!selectedAIAccountId && (
        <Alert
          message="请选择AI账户"
          description="请从上方选择器中选择一个AI账户，以查看该账户的投资组合数据和交易记录。"
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* 统计数据卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总资产"
              value={portfolioSummary?.totalValue || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#1890ff' }}
              suffix={
                <Tag color={portfolioSummary?.totalPnlPercent && portfolioSummary.totalPnlPercent >= 0 ? 'green' : 'red'} icon={portfolioSummary?.totalPnlPercent && portfolioSummary.totalPnlPercent >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}>
                  {portfolioSummary?.totalPnlPercent ? formatPercent(portfolioSummary.totalPnlPercent) : '0.00%'}
                </Tag>
              }
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                <WalletOutlined /> 包含现金和持仓
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总盈亏"
              value={portfolioSummary?.totalPnl || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: portfolioSummary?.totalPnl && portfolioSummary.totalPnl >= 0 ? '#3f8600' : '#cf1322' }}
            />
            <Progress
              percent={Math.abs(portfolioSummary?.totalPnlPercent || 0)}
              strokeColor={portfolioSummary?.totalPnl && portfolioSummary.totalPnl >= 0 ? '#3f8600' : '#cf1322'}
              size="small"
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="现金余额"
              value={portfolioSummary?.cashBalance || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#1890ff' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                可用资金：{formatCurrency(portfolioSummary?.cashBalance || 0)}
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="持仓数量"
              value={portfolioSummary?.positionsCount || 0}
              suffix="只"
              valueStyle={{ color: '#722ed1' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                活跃持仓：{positions?.length || 0} 只
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 主要内容区域 */}
      <Row gutter={[16, 16]}>
        {/* 左侧：图表和实时数据 */}
        <Col xs={24} lg={16}>
          <Row gutter={[16, 16]}>
            {/* 收益曲线 */}
            <Col span={24}>
              <Card title="收益曲线" extra={<LineChartOutlined />}>
                <ProfitChart />
              </Card>
            </Col>

            {/* 实时行情 */}
            <Col span={24}>
              <Card title="实时行情" extra={<FireOutlined />}>
                <RealTimeQuotes />
              </Card>
            </Col>
          </Row>
        </Col>

        {/* 右侧：持仓和交易信息 */}
        <Col xs={24} lg={8}>
          <Row gutter={[16, 16]}>
            {/* 持仓汇总 */}
            <Col span={24}>
              <Card title="持仓汇总" extra={<WalletOutlined />}>
                <PortfolioSummary accountId={selectedAIAccountId} />
              </Card>
            </Col>

            {/* 最新交易 */}
            <Col span={24}>
              <Card title="最新交易" extra={<StockOutlined />}>
                <List
                  size="small"
                  dataSource={recentTrades}
                  renderItem={(trade) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={
                          <Avatar
                            size="small"
                            style={{
                              backgroundColor: trade.action === '买入' ? '#52c41a' : '#ff4d4f',
                            }}
                          >
                            {trade.action === '买入' ? '买' : '卖'}
                          </Avatar>
                        }
                        title={`${trade.symbol} ${trade.action}`}
                        description={`${trade.quantity}股 @ ${formatCurrency(trade.price)}`}
                      />
                      <Text type="secondary">{trade.time}</Text>
                    </List.Item>
                  )}
                />
                {recentTrades.length === 0 && (
                  <Text type="secondary" style={{ textAlign: 'center', display: 'block' }}>
                    暂无交易记录
                  </Text>
                )}
              </Card>
            </Col>

            {/* AI决策日志 */}
            <Col span={24}>
              <Card title="AI决策建议" extra={<TrophyOutlined />}>
                <AIDecisionLog />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      {/* 底部：更多信息 */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        {/* 最佳持仓 */}
        <Col xs={24} lg={12}>
          <Card title="最佳持仓" extra={<RiseOutlined />}>
            <List
              dataSource={topPositions}
              renderItem={(position) => (
                <List.Item
                  actions={[
                    <Tag color={position.pnlPercent >= 0 ? 'success' : 'error'}>
                      {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                    </Tag>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        size="large"
                        style={{
                          backgroundColor: position.pnlPercent >= 0 ? '#52c41a' : '#ff4d4f',
                        }}
                      >
                        {position.symbol.substring(0, 2)}
                      </Avatar>
                    }
                    title={position.name}
                    description={`市值: ${formatCurrency(position.value)}`}
                  />
                  <div>
                    <Text strong style={{ color: position.pnl >= 0 ? '#3f8600' : '#cf1322' }}>
                      {position.pnl >= 0 ? '+' : ''}{formatCurrency(position.pnl)}
                    </Text>
                  </div>
                </List.Item>
              )}
            />
            {topPositions.length === 0 && (
              <Text type="secondary" style={{ textAlign: 'center', display: 'block' }}>
                暂无持仓数据
              </Text>
            )}
          </Card>
        </Col>

        {/* AI决策 */}
        <Col xs={24} lg={12}>
          <Card title="AI决策建议" extra={<TrophyOutlined />}>
            <List
              dataSource={formattedAiDecisions}
              renderItem={(decision) => (
                <List.Item
                  actions={[
                    <Progress
                      type="circle"
                      percent={Math.round(decision.confidence * 100)}
                      size={40}
                      strokeColor={decision.confidence > 0.7 ? '#52c41a' : decision.confidence > 0.5 ? '#faad14' : '#ff4d4f'}
                    />,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        size="large"
                        style={{
                          backgroundColor:
                            decision.action === '买入' ? '#52c41a' :
                            decision.action === '卖出' ? '#ff4d4f' : '#faad14',
                        }}
                      >
                        {decision.action.charAt(0)}
                      </Avatar>
                    }
                    title={`${decision.symbol} - ${decision.action}`}
                    description={decision.reason}
                  />
                </List.Item>
              )}
            />
            {formattedAiDecisions.length === 0 && (
              <Text type="secondary" style={{ textAlign: 'center', display: 'block' }}>
                暂无AI决策建议
              </Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* 数据来源说明 */}
      <Alert
        style={{ marginTop: 24 }}
        message="数据说明"
        description="当前显示的是模拟数据，实际部署时会连接真实的后端API服务。所有数据更新都是实时的。"
        type="info"
        showIcon
      />
    </div>
  );
};

export default Dashboard;