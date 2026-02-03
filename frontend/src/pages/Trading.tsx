import React, { useState, useEffect } from 'react';
import {
  Card,
  Tabs,
  Form,
  Input,
  InputNumber,
  Select,
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
  Modal,
} from 'antd';
import {
  StockOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  SearchOutlined,
  HistoryOutlined,
  CalculatorOutlined,
  DollarOutlined,
  ReloadOutlined,
  PlusOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { tradingService } from '../services/trading.service';
import { marketService } from '../services/market.service';
import { formatCurrency, formatPercent, formatChange, formatChangePercent } from '../utils/formatters';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;
const { useBreakpoint } = Grid;

interface StockQuote {
  symbol: string;
  name: string;
  currentPrice: number;
  change: number;
  changePercent: number;
}

interface Position {
  id: string;
  stockSymbol: string;
  stockName: string;
  quantity: number;
  averageCost: number;
  currentPrice: number;
  marketValue: number;
  totalCost: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

interface OrderForm {
  stockSymbol: string;
  orderType: 'buy' | 'sell';
  quantity: number;
  limitPrice?: number;
}

const Trading: React.FC = () => {
  const [form] = Form.useForm();
  const [selectedStock, setSelectedStock] = useState<StockQuote | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [isOrderModalVisible, setIsOrderModalVisible] = useState(false);
  const screens = useBreakpoint();
  const queryClient = useQueryClient();

  // 使用React Query获取数据
  const { data: stocks, isLoading: stocksLoading, refetch: refetchStocks } = useQuery(
    'tradingStocks',
    () => marketService.getStockQuotes()
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
    { enabled: !!searchQuery }
  );

  // 创建订单的mutation
  const createOrderMutation = useMutation(
    (orderData: OrderForm) => tradingService.createOrder(orderData),
    {
      onSuccess: () => {
        message.success('订单创建成功！');
        setIsOrderModalVisible(false);
        form.resetFields();
        // 刷新相关数据
        queryClient.invalidateQueries('tradingOrders');
        queryClient.invalidateQueries('tradingPositions');
        queryClient.invalidateQueries('portfolioSummary');
      },
      onError: (error: any) => {
        message.error(`订单创建失败: ${error.message}`);
      },
    }
  );

  // 过滤显示的股票
  const filteredStocks = stocks?.filter(stock =>
    stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stock.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // 处理股票选择
  const handleStockSelect = (symbol: string) => {
    const stock = stocks?.find(s => s.symbol === symbol);
    if (stock) {
      setSelectedStock(stock);
      form.setFieldsValue({
        stockSymbol: stock.symbol,
        limitPrice: stock.currentPrice,
      });
    }
  };

  // 处理订单提交
  const handleOrderSubmit = (values: OrderForm) => {
    createOrderMutation.mutate(values);
  };

  // 处理快速交易
  const handleQuickTrade = (symbol: string, type: 'buy' | 'sell') => {
    const stock = stocks?.find(s => s.symbol === symbol);
    if (stock) {
      setSelectedStock(stock);
      setOrderType(type);
      form.setFieldsValue({
        stockSymbol: stock.symbol,
        orderType: type,
        quantity: type === 'buy' ? 10 : 100,
        limitPrice: stock.currentPrice,
      });
      setIsOrderModalVisible(true);
    }
  };

  // 刷新所有数据
  const refreshAllData = () => {
    refetchStocks();
    refetchPositions();
    refetchOrders();
  };

  // 计算订单总金额
  const calculateOrderTotal = () => {
    const quantity = form.getFieldValue('quantity') || 0;
    const price = form.getFieldValue('limitPrice') || selectedStock?.currentPrice || 0;
    return quantity * price;
  };

  // 检查是否有足够的持仓用于卖出
  const canSellStock = (symbol: string) => {
    const position = positions?.find(p => p.stockSymbol === symbol);
    return position && position.quantity > 0;
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
      dataIndex: 'symbol',
      key: 'symbol',
      render: (symbol: string, record: StockQuote) => (
        <Space>
          <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#1890ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
            {symbol.substring(0, 2)}
          </div>
          <div>
            <Text strong>{symbol}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>{record.name}</Text>
          </div>
        </Space>
      ),
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
      render: (_: any, record: StockQuote) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => handleQuickTrade(record.symbol, 'buy')}
          >
            买入
          </Button>
          <Button
            type="default"
            size="small"
            icon={<MinusOutlined />}
            disabled={!canSellStock(record.symbol)}
            onClick={() => handleQuickTrade(record.symbol, 'sell')}
          >
            卖出
          </Button>
        </Space>
      ),
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
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => handleQuickTrade(record.stockSymbol, 'buy')}
          >
            加仓
          </Button>
          <Button
            type="default"
            size="small"
            icon={<MinusOutlined />}
            onClick={() => handleQuickTrade(record.stockSymbol, 'sell')}
          >
            减仓
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
      render: (symbol: string) => <Text strong>{symbol}</Text>,
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

      {/* 交易表单 */}
      <Card title="交易下单" style={{ marginBottom: 24 }}>
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={12}>
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                orderType: 'buy',
                quantity: 100,
              }}
              onFinish={handleOrderSubmit}
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="stockSymbol"
                    label="股票代码"
                    rules={[{ required: true, message: '请选择股票' }]}
                  >
                    <Select
                      placeholder="选择股票"
                      showSearch
                      onSearch={setSearchQuery}
                      onChange={handleStockSelect}
                      loading={searchLoading}
                    >
                      {searchResults?.map(stock => (
                        <Option key={stock.symbol} value={stock.symbol}>
                          {stock.symbol} - {stock.name}
                        </Option>
                      ))}
                      {filteredStocks.map(stock => (
                        <Option key={stock.symbol} value={stock.symbol}>
                          {stock.symbol} - {stock.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="orderType"
                    label="交易类型"
                    rules={[{ required: true, message: '请选择交易类型' }]}
                  >
                    <Select>
                      <Option value="buy">
                        <Space>
                          <ArrowUpOutlined style={{ color: '#52c41a' }} />
                          买入
                        </Space>
                      </Option>
                      <Option value="sell">
                        <Space>
                          <ArrowDownOutlined style={{ color: '#ff4d4f' }} />
                          卖出
                        </Space>
                      </Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="quantity"
                    label="数量（股）"
                    rules={[
                      { required: true, message: '请输入数量' },
                      { type: 'number', min: 1, message: '数量必须大于0' },
                    ]}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={1}
                      step={100}
                      placeholder="输入数量"
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="limitPrice"
                    label="限价（可选）"
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0.01}
                      step={0.01}
                      precision={2}
                      placeholder="输入限价"
                      addonAfter="¥"
                    />
                  </Form.Item>
                </Col>
              </Row>

              {selectedStock && (
                <Alert
                  message={
                    <Space>
                      <Text strong>{selectedStock.symbol} - {selectedStock.name}</Text>
                      <Text>当前价格: {formatCurrency(selectedStock.currentPrice)}</Text>
                      <Text type={selectedStock.change >= 0 ? 'success' : 'danger'}>
                        {formatChange(selectedStock.change)} ({formatChangePercent(selectedStock.changePercent)})
                      </Text>
                    </Space>
                  }
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
              )}

              <Form.Item>
                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={createOrderMutation.isLoading}
                    icon={<DollarOutlined />}
                  >
                    提交订单
                  </Button>
                  <Button
                    onClick={() => form.resetFields()}
                  >
                    重置
                  </Button>
                  <Statistic
                    title="订单总金额"
                    value={calculateOrderTotal()}
                    precision={2}
                    prefix="¥"
                    valueStyle={{ fontSize: '16px' }}
                  />
                </Space>
              </Form.Item>
            </Form>
          </Col>

          <Col xs={24} lg={12}>
            <Card title="交易说明" size="small">
              <Paragraph>
                <strong>买入说明：</strong>
                <ul>
                  <li>输入股票代码和买入数量</li>
                  <li>可选择限价或市价交易</li>
                  <li>订单提交后进入待处理状态</li>
                  <li>系统会在合适的价格执行订单</li>
                </ul>
              </Paragraph>
              <Paragraph>
                <strong>卖出说明：</strong>
                <ul>
                  <li>只能卖出已持有的股票</li>
                  <li>卖出数量不能超过持仓数量</li>
                  <li>可选择限价或市价交易</li>
                  <li>卖出所得资金将进入现金账户</li>
                </ul>
              </Paragraph>
              <Alert
                message="风险提示"
                description="股票交易存在风险，投资需谨慎。本系统为模拟交易平台，不涉及真实资金。"
                type="warning"
                showIcon
              />
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

        <TabPane tab="我的持仓" key="positions">
          <Card>
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

      {/* 订单确认模态框 */}
      <Modal
        title="确认订单"
        open={isOrderModalVisible}
        onCancel={() => setIsOrderModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsOrderModalVisible(false)}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={createOrderMutation.isLoading}
            onClick={() => form.submit()}
          >
            确认下单
          </Button>,
        ]}
      >
        {selectedStock && (
          <div>
            <Alert
              message={`${orderType === 'buy' ? '买入' : '卖出'} ${selectedStock.symbol} - ${selectedStock.name}`}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="当前价格"
                  value={selectedStock.currentPrice}
                  precision={2}
                  prefix="¥"
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="涨跌幅"
                  value={selectedStock.changePercent}
                  precision={2}
                  suffix="%"
                  valueStyle={{ color: selectedStock.changePercent >= 0 ? '#3f8600' : '#cf1322' }}
                />
              </Col>
            </Row>
            <Divider />
            <Form form={form} layout="vertical">
              <Form.Item
                name="quantity"
                label="交易数量"
                rules={[{ required: true, message: '请输入数量' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={1}
                  step={orderType === 'buy' ? 100 : 1}
                />
              </Form.Item>
              <Form.Item
                name="limitPrice"
                label="限价（可选）"
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0.01}
                  step={0.01}
                  precision={2}
                  addonAfter="¥"
                />
              </Form.Item>
              <Alert
                message={`订单总金额: ${formatCurrency(calculateOrderTotal())}`}
                type="warning"
                showIcon
              />
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Trading;