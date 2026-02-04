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

interface OrderForm {
  stockSymbol: string;      // 股票代码
  orderType: 'buy' | 'sell'; // 订单类型
  quantity: number;         // 数量
  limitPrice?: number;      // 限价（可选）
  priceType?: 'market' | 'limit'; // 价格类型
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
  const filteredStocks = stocks?.filter(stock => {
    const code = stock.code || stock.symbol || '';
    const name = stock.name || '';

    return (
      code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }) || [];

  // 处理股票选择
  const handleStockSelect = (code: string) => {
    const stock = stocks?.find(s => (s.code || s.symbol) === code);
    if (stock) {
      setSelectedStock({
        code: stock.code || stock.symbol || '',
        name: stock.name,
        currentPrice: stock.currentPrice,
        change: stock.change || 0,
        changePercent: stock.changePercent || 0,
        market: stock.market,
        isFallback: stock.isFallback,
        symbol: stock.code || stock.symbol
      });
      form.setFieldsValue({
        stockSymbol: stock.code || stock.symbol,
        limitPrice: stock.currentPrice,
      });
    }
  };

  // 处理订单提交
  const handleOrderSubmit = (values: OrderForm) => {
    createOrderMutation.mutate(values);
  };

  // 处理快速交易
  const handleQuickTrade = (code: string, type: 'buy' | 'sell') => {
    const stock = stocks?.find(s => (s.code || s.symbol) === code);
    if (stock) {
      setSelectedStock({
        code: stock.code || stock.symbol || '',
        name: stock.name,
        currentPrice: stock.currentPrice,
        change: stock.change || 0,
        changePercent: stock.changePercent || 0,
        market: stock.market,
        isFallback: stock.isFallback,
        symbol: stock.code || stock.symbol
      });
      setOrderType(type);
      form.setFieldsValue({
        stockSymbol: stock.code || stock.symbol,
        orderType: type,
        quantity: type === 'buy' ? 100 : 100, // 默认100股
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
  const canSellStock = (code: string) => {
    const position = positions?.find(p => p.stockSymbol === code);
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
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => handleQuickTrade(code, 'buy')}
              disabled={record.isFallback}
              title={record.isFallback ? '模拟数据不支持交易' : '买入'}
            >
              买入
            </Button>
            <Button
              type="default"
              size="small"
              icon={<MinusOutlined />}
              disabled={!canSellStock(code) || record.isFallback}
              onClick={() => handleQuickTrade(code, 'sell')}
              title={record.isFallback ? '模拟数据不支持交易' : '卖出'}
            >
              卖出
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
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => handleQuickTrade(record.stockSymbol, 'buy')}
            disabled={record.isFallback}
            title={record.isFallback ? '模拟数据不支持交易' : '加仓'}
          >
            加仓
          </Button>
          <Button
            type="default"
            size="small"
            icon={<MinusOutlined />}
            onClick={() => handleQuickTrade(record.stockSymbol, 'sell')}
            disabled={record.isFallback}
            title={record.isFallback ? '模拟数据不支持交易' : '减仓'}
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
                      filterOption={false}
                    >
                      {searchResults?.map(stock => {
                        const code = stock.code || stock.symbol || '';
                        const name = stock.name || '';
                        return (
                          <Option key={code} value={code}>
                            {code} - {name}
                            {stock.isFallback && ' (模拟)'}
                          </Option>
                        );
                      })}
                      {filteredStocks.map(stock => {
                        const code = stock.code || stock.symbol || '';
                        const name = stock.name || '';
                        return (
                          <Option key={code} value={code}>
                            {code} - {name}
                            {stock.isFallback && ' (模拟)'}
                          </Option>
                        );
                      })}
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
                      <Text strong>{selectedStock.code || selectedStock.symbol} - {selectedStock.name}</Text>
                      <Text>当前价格: {formatCurrency(selectedStock.currentPrice)}</Text>
                      <Text type={selectedStock.change >= 0 ? 'success' : 'danger'}>
                        {formatChange(selectedStock.change)} ({formatChangePercent(selectedStock.changePercent)})
                      </Text>
                      {selectedStock.isFallback && (
                        <Tag color="warning" style={{ marginLeft: 8 }}>模拟数据</Tag>
                      )}
                    </Space>
                  }
                  type={selectedStock.isFallback ? 'warning' : 'info'}
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
              message={
                <Space>
                  <Text>{`${orderType === 'buy' ? '买入' : '卖出'} ${selectedStock.code || selectedStock.symbol} - ${selectedStock.name}`}</Text>
                  {selectedStock.isFallback && (
                    <Tag color="warning">模拟数据交易</Tag>
                  )}
                </Space>
              }
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