import React, { useState, useEffect } from 'react';
import {
  Card,
  Tabs,
  Input,
  Button,
  Typography,
  Space,
  Row,
  Col,
  Table,
  Tag,
  Statistic,
  Alert,
  Divider,
  Grid,
  Spin,
  message,
  Select,
} from 'antd';
import {
  StockOutlined,
  SearchOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from 'react-query';
import { tradingService } from '../services/trading.service';
import { marketService } from '../services/market.service';
import { formatCurrency, formatPercent, formatChange, formatChangePercent } from '../utils/formatters';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;
const { useBreakpoint } = Grid;

interface StockQuote {
  code: string;           // 股票代码
  name: string;           // 股票名称
  currentPrice: number;   // 当前价格
  change: number;         // 涨跌额
  changePercent: number;  // 涨跌幅
  market?: string;        // 市场代码
  isFallback?: boolean;   // 是否为降级数据
  // 兼容字段
  symbol?: string;        // 兼容字段
}

interface Position {
  id: string;
  stockSymbol: string;          // 股票代码
  stockName: string;            // 股票名称
  quantity: number;             // 持仓数量
  averageCost: number;          // 平均成本
  currentPrice: number;         // 当前价格
  marketValue: number;          // 市值
  totalCost: number;            // 总成本
  unrealizedPnl: number;        // 未实现盈亏
  unrealizedPnlPercent: number; // 未实现盈亏率
  isFallback?: boolean;         // 是否为降级数据
}


const Trading: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const screens = useBreakpoint();
  const queryClient = useQueryClient();

  // 使用React Query获取数据
  const { data: stocks, isLoading: stocksLoading, refetch: refetchStocks } = useQuery(
    'tradingStocks',
    () => marketService.getStockQuotes(),
    {
      onSuccess: (data) => {
        // 检查是否有降级数据
        const hasFallback = data.some(stock => stock.isFallback);
        if (hasFallback) {
          message.warning('部分股票数据使用降级数据，交易功能可能受限');
        }
      },
      onError: (error) => {
        console.error('获取股票数据失败:', error);
        message.error('获取股票数据失败，使用降级数据');
      }
    }
  );

  const { data: positions, isLoading: positionsLoading, refetch: refetchPositions } = useQuery(
    'tradingPositions',
    () => tradingService.getPositions()
  );

  const { data: orders, isLoading: ordersLoading, refetch: refetchOrders } = useQuery(
    'tradingOrders',
    () => tradingService.getOrders({ page: 1, pageSize: 10 })
  );

  const { data: searchResults, isLoading: searchLoading, refetch: refetchSearch } = useQuery(
    ['stockSearch', searchQuery],
    () => searchQuery ? marketService.searchStocks(searchQuery) : Promise.resolve([]),
    {
      enabled: !!searchQuery,
      onError: (error) => {
        console.error('搜索股票失败:', error);
        message.error('搜索股票失败，请稍后重试');
      }
    }
  );


  // 过滤显示的股票
  const filteredStocks = stocks?.filter(stock => {
    const code = stock.code || stock.symbol || '';
    const name = stock.name || '';

    return (
      code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }) || [];




  // 刷新所有数据
  const refreshAllData = () => {
    refetchStocks();
    refetchPositions();
    refetchOrders();
  };



  const isLoading = stocksLoading || positionsLoading || ordersLoading;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <Spin size="large" tip="加载交易数据中..." />
      </div>
    );
  }

  const stockColumns = [
    {
      title: '股票',
      dataIndex: 'code',
      key: 'code',
      render: (code: string, record: StockQuote) => {
        const displayCode = code || record.symbol || '';
        return (
          <Space>
            <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#1890ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
              {displayCode.substring(0, 2)}
            </div>
            <div>
              <Text strong>{displayCode}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>{record.name}</Text>
              {record.isFallback && (
                <div>
                  <Text type="warning" style={{ fontSize: '10px' }}>模拟数据</Text>
                </div>
              )}
            </div>
          </Space>
        );
      },
    },
    {
      title: '最新价',
      dataIndex: 'currentPrice',
      key: 'currentPrice',
      render: (price: number) => (
        <Text strong>{formatCurrency(price)}</Text>
      ),
    },
    {
      title: '涨跌额',
      dataIndex: 'change',
      key: 'change',
      render: (change: number) => (
        <Text style={{ color: change >= 0 ? '#52c41a' : '#ff4d4f' }}>
          {formatChange(change)}
        </Text>
      ),
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      key: 'changePercent',
      render: (changePercent: number) => (
        <Tag color={changePercent >= 0 ? 'success' : 'error'}>
          {formatChangePercent(changePercent)}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: StockQuote) => {
        const code = record.code || record.symbol || '';
        return (
          <Space>
            <Button
              type="link"
              size="small"
              icon={<SearchOutlined />}
              onClick={() => {
                // 查看股票详情，不进行交易
                message.info(`查看股票详情: ${code} - ${record.name}`);
                // TODO: 实现股票详情查看功能
              }}
              title="查看股票详情"
            >
              详情
            </Button>
          </Space>
        );
      },
    },
  ];

  const positionColumns = [
    {
      title: '持仓',
      dataIndex: 'stockSymbol',
      key: 'stockSymbol',
      render: (symbol: string, record: Position) => (
        <Space>
          <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#722ed1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
            {symbol.substring(0, 2)}
          </div>
          <div>
            <Text strong>{symbol}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>{record.stockName}</Text>
            {record.isFallback && (
              <div>
                <Text type="warning" style={{ fontSize: '10px' }}>模拟数据</Text>
              </div>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      render: (quantity: number) => (
        <Text strong>{quantity.toLocaleString()} 股</Text>
      ),
    },
    {
      title: '成本价',
      dataIndex: 'averageCost',
      key: 'averageCost',
      render: (cost: number) => formatCurrency(cost),
    },
    {
      title: '当前价',
      dataIndex: 'currentPrice',
      key: 'currentPrice',
      render: (price: number) => formatCurrency(price),
    },
    {
      title: '盈亏',
      key: 'pnl',
      render: (_: any, record: Position) => (
        <div>
          <Text strong style={{ color: record.unrealizedPnl >= 0 ? '#52c41a' : '#ff4d4f' }}>
            {formatCurrency(record.unrealizedPnl)}
          </Text>
          <br />
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {formatPercent(record.unrealizedPnlPercent)}
          </Text>
        </div>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Position) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<SearchOutlined />}
            onClick={() => {
              // 查看持仓详情
              message.info(`查看持仓详情: ${record.stockSymbol} - ${record.stockName}`);
              // TODO: 实现持仓详情查看功能
            }}
            title="查看持仓详情"
          >
            详情
          </Button>
        </Space>
      ),
    },
  ];

  const orderColumns = [
    {
      title: '订单号',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => <Text type="secondary">{id.substring(0, 8)}...</Text>,
    },
    {
      title: '股票',
      dataIndex: 'stockSymbol',
      key: 'stockSymbol',
      render: (symbol: string) => (
        <Text strong>{symbol}</Text>
      ),
    },
    {
      title: '类型',
      dataIndex: 'orderType',
      key: 'orderType',
      render: (type: string) => (
        <Tag color={type === 'buy' ? 'success' : 'error'}>
          {type === 'buy' ? '买入' : '卖出'}
        </Tag>
      ),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      render: (quantity: number) => `${quantity.toLocaleString()} 股`,
    },
    {
      title: '价格',
      dataIndex: 'price',
      key: 'price',
      render: (price: number) => formatCurrency(price),
    },
    {
      title: '状态',
      dataIndex: 'orderStatus',
      key: 'orderStatus',
      render: (status: string) => {
        const statusConfig: Record<string, { color: string; text: string }> = {
          pending: { color: 'gold', text: '待处理' },
          executed: { color: 'green', text: '已执行' },
          cancelled: { color: 'red', text: '已取消' },
          rejected: { color: 'volcano', text: '已拒绝' },
        };
        const config = statusConfig[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
  ];

  return (
    <div style={{ maxWidth: '100%' }}>
      {/* 页面标题 */}
      <Space direction="vertical" size="middle" style={{ width: '100%', marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              <StockOutlined /> 交易
            </Title>
            <Text type="secondary">
              进行股票买卖交易，查看持仓和订单记录。
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
      </Space>

      {/* 交易说明 - 用户不直接交易，所有交易由AI自主执行 */}
      <Card title="交易说明" style={{ marginBottom: 24 }}>
        <Alert
          message="交易模式说明"
          description="根据业务需求，用户不能直接进行股票交易。所有交易操作均由AI账户自主执行。您可以查看AI账户的持仓和交易记录，但无法手动创建或执行交易订单。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={12}>
            <Card title="AI交易流程" size="small">
              <Paragraph>
                <strong>AI自主交易流程：</strong>
                <ol>
                  <li>AI账户分析市场数据和股票行情</li>
                  <li>AI基于分析结果做出交易决策</li>
                  <li>AI自动创建交易订单并执行</li>
                  <li>系统记录交易详情和决策理由</li>
                  <li>用户可查看AI账户的持仓和交易记录</li>
                </ol>
              </Paragraph>
              <Alert
                message="当前状态"
                description="您的AI账户将根据市场情况自动进行交易决策，无需手动干预。"
                type="success"
                showIcon
              />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="用户权限" size="small">
              <Paragraph>
                <strong>您可以进行的操作：</strong>
                <ul>
                  <li>查看股票行情和市场数据</li>
                  <li>查看AI账户的持仓情况</li>
                  <li>查看AI账户的交易记录</li>
                  <li>查看交易统计和分析</li>
                  <li>管理AI账户配置</li>
                </ul>
              </Paragraph>
              <Paragraph>
                <strong>您不能进行的操作：</strong>
                <ul>
                  <li>手动创建交易订单</li>
                  <li>手动执行或取消交易</li>
                  <li>直接修改持仓</li>
                  <li>干预AI交易决策</li>
                </ul>
              </Paragraph>
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 标签页：股票行情、持仓、订单 */}
      <Tabs defaultActiveKey="stocks">
        <TabPane tab="股票行情" key="stocks">
          <Card>
            <Input
              placeholder="搜索股票代码或名称..."
              prefix={<SearchOutlined />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ marginBottom: 16, maxWidth: 300 }}
            />
            <Table
              columns={stockColumns}
              dataSource={filteredStocks}
              rowKey="symbol"
              pagination={{ pageSize: 10 }}
              size="middle"
            />
          </Card>
        </TabPane>

        <TabPane tab="AI账户持仓" key="positions">
          <Card>
            <Alert
              message="AI账户持仓说明"
              description="这是您管理的AI账户的持仓情况。所有股票持仓均由AI账户自主交易产生，您不能直接进行持仓操作。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col>
                <Statistic
                  title="总持仓价值"
                  value={positions?.reduce((sum, pos) => sum + pos.marketValue, 0) || 0}
                  precision={2}
                  prefix="¥"
                />
              </Col>
              <Col>
                <Statistic
                  title="总盈亏"
                  value={positions?.reduce((sum, pos) => sum + pos.unrealizedPnl, 0) || 0}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: (positions?.reduce((sum, pos) => sum + pos.unrealizedPnl, 0) || 0) >= 0 ? '#3f8600' : '#cf1322' }}
                />
              </Col>
              <Col>
                <Statistic
                  title="持仓数量"
                  value={positions?.length || 0}
                  suffix="只"
                />
              </Col>
            </Row>
            <Table
              columns={positionColumns}
              dataSource={positions}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              size="middle"
            />
          </Card>
        </TabPane>

        <TabPane tab="订单记录" key="orders">
          <Card>
            <Alert
              message="AI账户订单说明"
              description="这是您管理的AI账户的交易订单记录。所有订单均由AI账户自主创建和执行，您不能直接创建或取消订单。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col>
                <Statistic
                  title="总订单数"
                  value={orders?.total || 0}
                  prefix={<HistoryOutlined />}
                />
              </Col>
              <Col>
                <Statistic
                  title="待处理订单"
                  value={orders?.items.filter(order => order.orderStatus === 'pending').length || 0}
                  valueStyle={{ color: '#faad14' }}
                />
              </Col>
              <Col>
                <Statistic
                  title="已执行订单"
                  value={orders?.items.filter(order => order.orderStatus === 'executed').length || 0}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
            </Row>
            <Table
              columns={orderColumns}
              dataSource={orders?.items}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              size="middle"
            />
          </Card>
        </TabPane>
      </Tabs>

    </div>
  );
};

export default Trading;