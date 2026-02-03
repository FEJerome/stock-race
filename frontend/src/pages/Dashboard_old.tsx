import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
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
} from '@ant-design/icons';
import ProfitChart from '../components/charts/ProfitChart';
import PortfolioSummary from '../components/portfolio/PortfolioSummary';
import RealTimeQuotes from '../components/market/RealTimeQuotes';
import AIDecisionLog from '../components/ai/AIDecisionLog';
import { tradingService } from '../services/trading.service';
import { marketService } from '../services/market.service';
import { aiService } from '../services/ai.service';

const { Title, Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;

const Dashboard: React.FC = () => {
  const screens = useBreakpoint();

  // 使用React Query获取数据
  const { data: portfolioSummary, isLoading: portfolioLoading } = useQuery(
    'portfolioSummary',
    () => tradingService.getPortfolioSummary()
  );

  const { data: positions, isLoading: positionsLoading } = useQuery(
    'positions',
    () => tradingService.getPositions()
  );

  const { data: recentOrders, isLoading: ordersLoading } = useQuery(
    'recentOrders',
    () => tradingService.getOrders({ page: 1, pageSize: 5 })
  );

  const { data: aiDecisions, isLoading: aiDecisionsLoading } = useQuery(
    'aiDecisions',
    () => aiService.getAIDecisions({ page: 1, pageSize: 5 })
  );

  const { data: marketData, isLoading: marketLoading } = useQuery(
    'marketData',
    () => marketService.getStockQuotes()
  );

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

  const isLoading = portfolioLoading || positionsLoading || ordersLoading || aiDecisionsLoading || marketLoading;

  return (
    <div style={{ maxWidth: '100%' }}>
      {/* 页面标题 */}
      <Space direction="vertical" size="middle" style={{ width: '100%', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>
          <DashboardOutlined /> 仪表盘
        </Title>
        <Text type="secondary">
          欢迎回来！这里是您的投资概览和实时监控面板。
        </Text>
      </Space>

      {/* 关键指标卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总资产"
              value={portfolioStats.totalValue}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#3f8600' }}
              suffix={
                <Tag color="green" icon={<ArrowUpOutlined />}>
                  +{portfolioStats.totalPnlPercent}%
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
              value={portfolioStats.totalPnl}
              precision={2}
              prefix="¥"
              valueStyle={{ color: portfolioStats.totalPnl >= 0 ? '#3f8600' : '#cf1322' }}
            />
            <Progress
              percent={Math.abs(portfolioStats.totalPnlPercent)}
              strokeColor={portfolioStats.totalPnl >= 0 ? '#3f8600' : '#cf1322'}
              size="small"
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="现金余额"
              value={portfolioStats.cashBalance}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#1890ff' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                可用资金：¥{portfolioStats.cashBalance.toFixed(2)}
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="持仓数量"
              value={portfolioStats.positionsCount}
              valueStyle={{ color: '#722ed1' }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                <StockOutlined /> 共持有{portfolioStats.positionsCount}只股票
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 收益曲线图表 */}
      <div style={{ marginBottom: 24 }}>
        <ProfitChart
          title="资产收益曲线"
          height={300}
          showControls={true}
        />
      </div>

      {/* 主要内容区域 */}
      <Row gutter={[16, 16]}>
        {/* 左侧：持仓概览和实时行情 */}
        <Col xs={24} lg={16}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* 持仓概览 */}
            <PortfolioSummary
              showDetails={true}
              compact={false}
            />

            {/* 实时行情 */}
            <RealTimeQuotes />
          </Space>
        </Col>

        {/* 右侧：AI决策和快速操作 */}
        <Col xs={24} lg={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* AI决策记录 */}
            <AIDecisionLog />

            {/* 快速交易 */}
            <Card
              title={
                <Space>
                  <FireOutlined />
                  <Text strong>快速交易</Text>
                </Space>
              }
              size="small"
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Button type="primary" block icon={<StockOutlined />}>
                  买入股票
                </Button>
                <Button block icon={<StockOutlined />}>
                  卖出股票
                </Button>
                <Button type="dashed" block icon={<TrophyOutlined />}>
                  查看排行榜
                </Button>
              </Space>
            </Card>

            {/* 最近交易 */}
            <Card
              title={
                <Space>
                  <StockOutlined />
                  <Text strong>最近交易</Text>
                </Space>
              }
              size="small"
            >
              <List
                dataSource={recentTrades}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        <Avatar
                          size="small"
                          style={{
                            backgroundColor:
                              item.action === '买入' ? '#f6ffed' : '#fff2f0',
                            color: item.action === '买入' ? '#52c41a' : '#ff4d4f',
                          }}
                        >
                          {item.action === '买入' ? '买' : '卖'}
                        </Avatar>
                      }
                      title={
                        <Space>
                          <Text strong>{item.symbol}</Text>
                          <Text type={item.action === '买入' ? 'success' : 'danger'}>
                            {item.action}
                          </Text>
                        </Space>
                      }
                      description={
                        <Text type="secondary">
                          {item.quantity}股 @ ¥{item.price} · {item.time}
                        </Text>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
};

// 添加缺失的图标导入
const DashboardOutlined = ({ style }: { style?: React.CSSProperties }) => (
  <span style={style}>📊</span>
);
const RobotOutlined = ({ style }: { style?: React.CSSProperties }) => (
  <span style={style}>🤖</span>
);

export default Dashboard;