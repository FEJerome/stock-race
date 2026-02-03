import React from 'react';
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
  Tooltip,
  Grid,
} from 'antd';
import {
  DollarOutlined,
  RiseOutlined,
  FallOutlined,
  PieChartOutlined,
  EyeOutlined,
  StockOutlined,
  CalculatorOutlined,
} from '@ant-design/icons';

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
}

const PortfolioSummary: React.FC<PortfolioSummaryProps> = ({
  showDetails = true,
  compact = false,
}) => {
  const screens = useBreakpoint();

  // 模拟持仓数据
  const positions: Position[] = [
    { symbol: 'AAPL', name: '苹果公司', quantity: 200, avgCost: 158.25, currentPrice: 162.50, marketValue: 32500, totalCost: 31650, unrealizedPnl: 850, unrealizedPnlPercent: 2.69, weight: 25.9 },
    { symbol: 'MSFT', name: '微软公司', quantity: 70, avgCost: 410.50, currentPrice: 415.75, marketValue: 29102.5, totalCost: 28735, unrealizedPnl: 367.5, unrealizedPnlPercent: 1.28, weight: 23.2 },
    { symbol: 'GOOGL', name: '谷歌', quantity: 150, avgCost: 142.00, currentPrice: 145.25, marketValue: 21787.5, totalCost: 21300, unrealizedPnl: 487.5, unrealizedPnlPercent: 2.29, weight: 17.4 },
    { symbol: 'TSLA', name: '特斯拉', quantity: 100, avgCost: 200.75, currentPrice: 195.50, marketValue: 19550, totalCost: 20075, unrealizedPnl: -525, unrealizedPnlPercent: -2.61, weight: 15.6 },
    { symbol: 'NVDA', name: '英伟达', quantity: 20, avgCost: 850.00, currentPrice: 950.25, marketValue: 19005, totalCost: 17000, unrealizedPnl: 2005, unrealizedPnlPercent: 11.79, weight: 15.1 },
    { symbol: 'AMZN', name: '亚马逊', quantity: 30, avgCost: 175.00, currentPrice: 178.50, marketValue: 5355, totalCost: 5250, unrealizedPnl: 105, unrealizedPnlPercent: 2.00, weight: 4.3 },
    { symbol: 'META', name: 'Meta', quantity: 25, avgCost: 480.00, currentPrice: 485.75, marketValue: 12143.75, totalCost: 12000, unrealizedPnl: 143.75, unrealizedPnlPercent: 1.20, weight: 9.7 },
  ];

  // 计算汇总数据
  const totalMarketValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const totalCost = positions.reduce((sum, p) => sum + p.totalCost, 0);
  const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const cashBalance = 25430.50;
  const totalAssets = totalMarketValue + cashBalance;

  // 计算资产分布
  const assetDistribution = {
    stocks: totalMarketValue,
    cash: cashBalance,
    total: totalAssets,
  };

  const stockPercentage = (assetDistribution.stocks / assetDistribution.total) * 100;
  const cashPercentage = (assetDistribution.cash / assetDistribution.total) * 100;

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
        </Space>
      }
      extra={
        !compact && (
          <Space>
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
      {/* 关键指标 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={compact ? 12 : 6}>
          <Card size="small">
            <Statistic
              title="总资产"
              value={totalAssets}
              precision={2}
              prefix="¥"
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
              prefix="¥"
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
              prefix="¥"
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