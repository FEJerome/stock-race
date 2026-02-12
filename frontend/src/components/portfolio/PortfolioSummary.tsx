import React, { useState } from 'react';
import {
  Card,
  Typography,
  Space,
  Row,
  Col,
  Statistic,
  Progress,
  Table,
  Tag,
  Button,
  Grid,
  Alert,
  Spin,
  message,
} from 'antd';
import {
  DollarOutlined,
  RiseOutlined,
  FallOutlined,
  PieChartOutlined,
  EyeOutlined,
  StockOutlined,
  CalculatorOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { tradingService } from '../../services/trading.service';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

interface Position {
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  totalCost: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  weight: number;
}

interface PortfolioSummaryProps {
  showDetails?: boolean;
  compact?: boolean;
  accountId?: string;
}

const PortfolioSummary: React.FC<PortfolioSummaryProps> = ({
  showDetails = true,
  compact = false,
  accountId,
}) => {
  const [dataSource, setDataSource] = useState<'real' | 'fallback'>('fallback');
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());

  // 使用React Query获取持仓数据
  const { data: positionsData, isLoading, error, refetch } = useQuery(
    ['portfolioPositions', accountId],
    () => tradingService.getPositions(accountId),
    {
      enabled: true,
      refetchInterval: 30000, // 每30秒自动刷新
      onSuccess: (data) => {
        setLastUpdateTime(new Date());
        setDataSource('real');
      },
      onError: (err) => {
        console.error('获取持仓数据失败:', err);
        setDataSource('fallback');
        message.warning('使用模拟持仓数据');
      }
    }
  );

  // 使用React Query获取投资组合汇总数据
  const { data: portfolioSummary } = useQuery(
    ['portfolioSummaryForSummary', accountId],
    () => tradingService.getPortfolioSummary(accountId),
    {
      enabled: true,
    }
  );

  // 持仓数据（优先使用真实数据，降级时使用模拟数据）
  const positions: Position[] = positionsData ? positionsData.map(pos => ({
    symbol: pos.stockSymbol,
    name: pos.stockName,
    quantity: pos.quantity,
    avgCost: pos.averageCost,
    currentPrice: pos.currentPrice,
    marketValue: pos.marketValue,
    totalCost: pos.totalCost,
    unrealizedPnl: pos.unrealizedPnl,
    unrealizedPnlPercent: pos.unrealizedPnlPercent,
    weight: portfolioSummary?.totalValue ? (pos.marketValue / portfolioSummary.totalValue) * 100 : 0,
  })) : [
    // 降级处理：模拟持仓数据
    { symbol: '000001', name: '平安银行', quantity: 200, avgCost: 16.25, currentPrice: 16.50, marketValue: 3300, totalCost: 3250, unrealizedPnl: 50, unrealizedPnlPercent: 1.54, weight: 25.9 },
    { symbol: '600000', name: '浦发银行', quantity: 70, avgCost: 8.15, currentPrice: 8.20, marketValue: 574, totalCost: 570.5, unrealizedPnl: 3.5, unrealizedPnlPercent: 0.61, weight: 23.2 },
    { symbol: '000002', name: '万科A', quantity: 150, avgCost: 12.20, currentPrice: 12.35, marketValue: 1852.5, totalCost: 1830, unrealizedPnl: 22.5, unrealizedPnlPercent: 1.23, weight: 17.4 },
    { symbol: '600036', name: '招商银行', quantity: 100, avgCost: 35.35, currentPrice: 35.80, marketValue: 3580, totalCost: 3535, unrealizedPnl: 45, unrealizedPnlPercent: 1.27, weight: 15.6 },
    { symbol: '000858', name: '五粮液', quantity: 20, avgCost: 193.25, currentPrice: 195.50, marketValue: 3910, totalCost: 3865, unrealizedPnl: 45, unrealizedPnlPercent: 1.16, weight: 15.1 },
  ];

  // 计算汇总数据（优先使用真实数据）
  const totalMarketValue = portfolioSummary ? portfolioSummary.totalValue - (portfolioSummary.cashBalance || 0) : positions.reduce((sum, p) => sum + p.marketValue, 0);
  const totalCost = portfolioSummary ? portfolioSummary.totalCost : positions.reduce((sum, p) => sum + p.totalCost, 0);
  const totalPnl = portfolioSummary ? portfolioSummary.totalPnl : positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const totalPnlPercent = portfolioSummary ? portfolioSummary.totalPnlPercent : (totalCost > 0 ? (totalPnl / totalCost) * 100 : 0);
  const cashBalance = portfolioSummary ? portfolioSummary.cashBalance : 25430.50;
  const totalAssets = portfolioSummary ? portfolioSummary.totalValue : totalMarketValue + cashBalance;

  // 计算资产分布
  const assetDistribution = {
    stocks: totalMarketValue,
    cash: cashBalance,
    total: totalAssets,
  };

  const stockPercentage = (assetDistribution.stocks / assetDistribution.total) * 100;
  const cashPercentage = (assetDistribution.cash / assetDistribution.total) * 100;

  // 手动刷新数据
  const handleRefresh = () => {
    refetch();
    setLastUpdateTime(new Date());
    message.info('正在刷新持仓数据...');
  };

  // 表格列定义
  const positionColumns = [
    {
      title: '股票',
      dataIndex: 'symbol',
      key: 'symbol',
      render: (symbol: string, record: Position) => (
        <Space>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: getStockColor(record.symbol),
            }}
          />
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
      title: '持仓数量',
      dataIndex: 'quantity',
      key: 'quantity',
      render: (quantity: number) => (
        <Text strong>{quantity.toLocaleString()} 股</Text>
      ),
    },
    {
      title: '成本价',
      dataIndex: 'avgCost',
      key: 'avgCost',
      render: (price: number) => `¥${price.toFixed(2)}`,
    },
    {
      title: '现价',
      dataIndex: 'currentPrice',
      key: 'currentPrice',
      render: (price: number) => `¥${price.toFixed(2)}`,
    },
    {
      title: '持仓价值',
      dataIndex: 'marketValue',
      key: 'marketValue',
      render: (value: number) => (
        <Text strong>¥{value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
      ),
    },
    {
      title: '浮动盈亏',
      dataIndex: 'unrealizedPnl',
      key: 'unrealizedPnl',
      render: (pnl: number, record: Position) => (
        <Space direction="vertical" size={0}>
          <Text type={pnl >= 0 ? 'success' : 'danger'} strong>
            {pnl >= 0 ? '+' : ''}¥{pnl.toFixed(2)}
          </Text>
          <Text type={record.unrealizedPnlPercent >= 0 ? 'success' : 'danger'} style={{ fontSize: 12 }}>
            {record.unrealizedPnlPercent >= 0 ? '+' : ''}{record.unrealizedPnlPercent.toFixed(2)}%
          </Text>
        </Space>
      ),
    },
    {
      title: '权重',
      dataIndex: 'weight',
      key: 'weight',
      render: (weight: number) => (
        <Progress
          percent={weight}
          size="small"
          strokeColor={getStockColor('')}
          style={{ width: 80 }}
          showInfo={false}
        />
      ),
    },
  ];

  // 获取股票颜色
  const getStockColor = (symbol: string) => {
    const colors = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2', '#f5222d'];
    const index = symbol.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <Card
      title={
        <Space>
          <DollarOutlined />
          <Text strong>持仓概览</Text>
          <Tag color={totalPnl >= 0 ? 'green' : 'red'} icon={totalPnl >= 0 ? <RiseOutlined /> : <FallOutlined />}>
            {totalPnl >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}%
          </Tag>
          <Tag color={dataSource === 'real' ? 'green' : 'orange'}>
            {dataSource === 'real' ? '实时数据' : '模拟数据'}
          </Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            更新时间: {lastUpdateTime.toLocaleTimeString('zh-CN')}
          </Text>
        </Space>
      }
      extra={
        !compact && (
          <Space>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              size="small"
              onClick={handleRefresh}
              loading={isLoading}
              title="刷新数据"
            />
            <Button type="text" icon={<EyeOutlined />} size="small">
              详细视图
            </Button>
            <Button type="text" icon={<CalculatorOutlined />} size="small">
              盈亏计算
            </Button>
          </Space>
        )
      }
    >
      {/* 加载状态 */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Spin size="large" tip="加载持仓数据中..." />
        </div>
      )}

      {/* 错误状态 */}
      {error && !isLoading && (
        <Alert
          message="数据加载失败"
          description="无法获取实时持仓数据，使用模拟数据进行展示。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={handleRefresh}>
              重试
            </Button>
          }
        />
      )}

      {/* 关键指标 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={compact ? 12 : 6}>
          <Card size="small">
            <Statistic
              title="总资产"
              value={totalAssets}
              precision={2}
              valueStyle={{ color: '#1890ff', fontSize: compact ? 16 : 20 }}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={compact ? 12 : 6}>
          <Card size="small">
            <Statistic
              title="总盈亏"
              value={totalPnl}
              precision={2}
              valueStyle={{
                color: totalPnl >= 0 ? '#52c41a' : '#ff4d4f',
                fontSize: compact ? 16 : 20,
              }}
              prefix={totalPnl >= 0 ? <RiseOutlined /> : <FallOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={compact ? 12 : 6}>
          <Card size="small">
            <Statistic
              title="股票持仓"
              value={totalMarketValue}
              precision={2}
              valueStyle={{ color: '#722ed1', fontSize: compact ? 16 : 20 }}
              prefix={<StockOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={compact ? 12 : 6}>
          <Card size="small">
            <Statistic
              title="现金余额"
              value={cashBalance}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#fa8c16', fontSize: compact ? 16 : 20 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 资产分布 */}
      {!compact && (
        <div style={{ marginBottom: 24 }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space>
              <PieChartOutlined />
              <Text strong>资产分布</Text>
            </Space>
            <Row gutter={16}>
              <Col span={16}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <div>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space>
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: '#1890ff',
                          }}
                        />
                        <Text>股票持仓</Text>
                      </Space>
                      <Space>
                        <Text strong>¥{totalMarketValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                        <Tag color="blue">{stockPercentage.toFixed(1)}%</Tag>
                      </Space>
                    </Space>
                    <Progress
                      percent={stockPercentage}
                      strokeColor="#1890ff"
                      size="small"
                      showInfo={false}
                      style={{ marginTop: 4 }}
                    />
                  </div>

                  <div>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space>
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: '#52c41a',
                          }}
                        />
                        <Text>现金余额</Text>
                      </Space>
                      <Space>
                        <Text strong>¥{cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                        <Tag color="green">{cashPercentage.toFixed(1)}%</Tag>
                      </Space>
                    </Space>
                    <Progress
                      percent={cashPercentage}
                      strokeColor="#52c41a"
                      size="small"
                      showInfo={false}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                </Space>
              </Col>
              <Col span={8}>
                {/* 简单的饼图示意 */}
                <div
                  style={{
                    width: '100%',
                    height: 120,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: '50%',
                      background: `conic-gradient(
                        #1890ff 0% ${stockPercentage}%,
                        #52c41a ${stockPercentage}% 100%
                      )`,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      textAlign: 'center',
                    }}
                  >
                    <Text strong style={{ fontSize: 12 }}>
                      总资产
                    </Text>
                    <Title level={4} style={{ margin: 0 }}>
                      ¥{totalAssets.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </Title>
                  </div>
                </div>
              </Col>
            </Row>
          </Space>
        </div>
      )}

      {/* 持仓明细 */}
      {showDetails && (
        <>
          <div style={{ marginBottom: 16 }}>
            <Space>
              <StockOutlined />
              <Text strong>持仓明细</Text>
              <Tag color="blue">{positions.length} 只股票</Tag>
            </Space>
          </div>

          <Table
            dataSource={positions}
            columns={positionColumns}
            pagination={compact ? false : { pageSize: 5, showSizeChanger: true }}
            size="small"
            scroll={{ x: true }}
            rowKey="symbol"
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <Text strong>总计</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1}>
                    <Text strong>
                      {positions.reduce((sum, p) => sum + p.quantity, 0).toLocaleString()} 股
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2}>
                    <Text strong>¥{(totalCost / positions.reduce((sum, p) => sum + p.quantity, 0)).toFixed(2)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3}>
                    <Text strong>¥{(totalMarketValue / positions.reduce((sum, p) => sum + p.quantity, 0)).toFixed(2)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4}>
                    <Text strong>¥{totalMarketValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5}>
                    <Text type={totalPnl >= 0 ? 'success' : 'danger'} strong>
                      {totalPnl >= 0 ? '+' : ''}¥{totalPnl.toFixed(2)}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6}>
                    <Progress
                      percent={100}
                      size="small"
                      strokeColor="#1890ff"
                      style={{ width: 80 }}
                      showInfo={false}
                    />
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </>
      )}

      {/* 操作按钮 */}
      {!compact && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Space>
            <Button type="primary" icon={<StockOutlined />}>
              调整持仓
            </Button>
            <Button icon={<CalculatorOutlined />}>
              盈亏分析
            </Button>
            <Button type="dashed">
              导出持仓报告
            </Button>
          </Space>
        </div>
      )}
    </Card>
  );
};

export default PortfolioSummary;