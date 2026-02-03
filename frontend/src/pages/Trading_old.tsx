import React, { useState } from 'react';
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
} from 'antd';
import {
  StockOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  SearchOutlined,
  HistoryOutlined,
  CalculatorOutlined,
  DollarOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;
const { useBreakpoint } = Grid;

// 模拟股票数据
const mockStocks = [
  { symbol: 'AAPL', name: '苹果公司', price: 162.50, change: 1.25, changePercent: 0.78 },
  { symbol: 'MSFT', name: '微软公司', price: 415.75, change: -2.25, changePercent: -0.54 },
  { symbol: 'GOOGL', name: '谷歌', price: 145.25, change: 0.75, changePercent: 0.52 },
  { symbol: 'AMZN', name: '亚马逊', price: 178.50, change: 3.25, changePercent: 1.86 },
  { symbol: 'TSLA', name: '特斯拉', price: 195.50, change: -5.25, changePercent: -2.61 },
  { symbol: 'NVDA', name: '英伟达', price: 950.25, change: 25.50, changePercent: 2.76 },
  { symbol: 'META', name: 'Meta', price: 485.75, change: 8.25, changePercent: 1.73 },
  { symbol: 'BABA', name: '阿里巴巴', price: 78.25, change: -0.75, changePercent: -0.95 },
];

// 模拟持仓数据
const mockPositions = [
  { symbol: 'AAPL', quantity: 200, avgCost: 158.25, currentPrice: 162.50, pnl: 850.00, pnlPercent: 2.69 },
  { symbol: 'MSFT', quantity: 70, avgCost: 410.50, currentPrice: 415.75, pnl: 367.50, pnlPercent: 1.28 },
  { symbol: 'GOOGL', quantity: 150, avgCost: 142.00, currentPrice: 145.25, pnl: 487.50, pnlPercent: 2.29 },
  { symbol: 'TSLA', quantity: 100, avgCost: 200.75, currentPrice: 195.50, pnl: -525.00, pnlPercent: -2.61 },
  { symbol: 'NVDA', quantity: 20, avgCost: 850.00, currentPrice: 950.25, pnl: 2005.00, pnlPercent: 11.79 },
];

const Trading: React.FC = () => {
  const [buyForm] = Form.useForm();
  const [sellForm] = Form.useForm();
  const [selectedStock, setSelectedStock] = useState<string>('AAPL');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [quantity, setQuantity] = useState<number>(100);
  const screens = useBreakpoint();

  // 获取选中的股票信息
  const selectedStockInfo = mockStocks.find(stock => stock.symbol === selectedStock);

  // 计算订单总额
  const calculateOrderTotal = () => {
    if (!selectedStockInfo) return 0;
    return selectedStockInfo.price * quantity;
  };

  // 处理买入提交
  const handleBuySubmit = (values: any) => {
    console.log('买入订单:', values);
    // 这里应该调用API提交订单
    alert(`买入订单已提交: ${values.quantity}股 ${selectedStock} @ ${selectedStockInfo?.price}`);
  };

  // 处理卖出提交
  const handleSellSubmit = (values: any) => {
    console.log('卖出订单:', values);
    // 这里应该调用API提交订单
    alert(`卖出订单已提交: ${values.quantity}股 ${values.symbol}`);
  };

  // 持仓表格列定义
  const positionColumns = [
    {
      title: '股票',
      dataIndex: 'symbol',
      key: 'symbol',
      render: (symbol: string, record: any) => (
        <Space>
          <Text strong>{symbol}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.name || mockStocks.find(s => s.symbol === symbol)?.name}
          </Text>
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
      title: '浮动盈亏',
      dataIndex: 'pnl',
      key: 'pnl',
      render: (pnl: number, record: any) => (
        <Space direction="vertical" size={0}>
          <Text type={pnl >= 0 ? 'success' : 'danger'} strong>
            {pnl >= 0 ? '+' : ''}¥{pnl.toFixed(2)}
          </Text>
          <Text type={record.pnlPercent >= 0 ? 'success' : 'danger'} style={{ fontSize: 12 }}>
            {record.pnlPercent >= 0 ? '+' : ''}{record.pnlPercent.toFixed(2)}%
          </Text>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Button
          type="link"
          size="small"
          onClick={() => {
            sellForm.setFieldsValue({
              symbol: record.symbol,
              quantity: Math.min(record.quantity, 100),
            });
            // 切换到卖出标签页
            document.querySelector('.ant-tabs-tab[data-node-key="2"]')?.click();
          }}
        >
          卖出
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: '100%' }}>
      {/* 页面标题 */}
      <Space direction="vertical" size="middle" style={{ width: '100%', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>
          <StockOutlined /> 交易
        </Title>
        <Text type="secondary">
          进行股票买卖操作，查看实时行情和持仓信息。
        </Text>
      </Space>

      <Row gutter={[16, 16]}>
        {/* 左侧：交易表单和股票行情 */}
        <Col xs={24} lg={16}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* 交易卡片 */}
            <Card>
              <Tabs defaultActiveKey="1">
                <TabPane
                  tab={
                    <Space>
                      <ArrowUpOutlined style={{ color: '#52c41a' }} />
                      <Text>买入</Text>
                    </Space>
                  }
                  key="1"
                >
                  <Form
                    form={buyForm}
                    layout="vertical"
                    onFinish={handleBuySubmit}
                    initialValues={{
                      orderType: 'market',
                      quantity: 100,
                    }}
                  >
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item
                          label="选择股票"
                          name="symbol"
                          rules={[{ required: true, message: '请选择股票' }]}
                          initialValue="AAPL"
                        >
                          <Select
                            showSearch
                            placeholder="搜索股票代码或名称"
                            optionFilterProp="children"
                            onChange={(value) => setSelectedStock(value)}
                            filterOption={(input, option) =>
                              (option?.children as string)?.toLowerCase().includes(input.toLowerCase())
                            }
                            size="large"
                          >
                            {mockStocks.map(stock => (
                              <Option key={stock.symbol} value={stock.symbol}>
                                <Space>
                                  <Text strong>{stock.symbol}</Text>
                                  <Text type="secondary">{stock.name}</Text>
                                  <Tag color={stock.change >= 0 ? 'green' : 'red'}>
                                    ¥{stock.price.toFixed(2)}
                                  </Tag>
                                </Space>
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>

                      <Col xs={24} md={12}>
                        <Form.Item
                          label="订单类型"
                          name="orderType"
                          rules={[{ required: true, message: '请选择订单类型' }]}
                        >
                          <Select size="large" onChange={(value) => setOrderType(value)}>
                            <Option value="market">市价单</Option>
                            <Option value="limit">限价单</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>

                    {orderType === 'limit' && (
                      <Form.Item
                        label="限价"
                        name="limitPrice"
                        rules={[{ required: true, message: '请输入限价' }]}
                      >
                        <InputNumber
                          style={{ width: '100%' }}
                          size="large"
                          min={0.01}
                          precision={2}
                          prefix="¥"
                          placeholder="请输入限价"
                        />
                      </Form.Item>
                    )}

                    <Form.Item
                      label="数量"
                      name="quantity"
                      rules={[
                        { required: true, message: '请输入数量' },
                        { type: 'number', min: 1, message: '数量必须大于0' },
                      ]}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        size="large"
                        min={1}
                        precision={0}
                        onChange={(value) => setQuantity(value || 0)}
                        addonAfter="股"
                      />
                    </Form.Item>

                    {/* 订单摘要 */}
                    {selectedStockInfo && (
                      <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Row gutter={16}>
                            <Col span={12}>
                              <Statistic
                                title="股票价格"
                                value={selectedStockInfo.price}
                                precision={2}
                                prefix="¥"
                                valueStyle={{ fontSize: 18 }}
                              />
                            </Col>
                            <Col span={12}>
                              <Statistic
                                title="涨跌幅"
                                value={selectedStockInfo.changePercent}
                                precision={2}
                                prefix={selectedStockInfo.change >= 0 ? '+' : ''}
                                suffix="%"
                                valueStyle={{
                                  color: selectedStockInfo.change >= 0 ? '#3f8600' : '#cf1322',
                                  fontSize: 18,
                                }}
                              />
                            </Col>
                          </Row>
                          <Divider style={{ margin: '12px 0' }} />
                          <Row gutter={16}>
                            <Col span={12}>
                              <Statistic
                                title="订单总额"
                                value={calculateOrderTotal()}
                                precision={2}
                                prefix="¥"
                                valueStyle={{ fontSize: 20, color: '#1890ff' }}
                              />
                            </Col>
                            <Col span={12}>
                              <div style={{ textAlign: 'right' }}>
                                <Text type="secondary">
                                  <CalculatorOutlined /> 计算: {quantity} × ¥{selectedStockInfo.price.toFixed(2)}
                                </Text>
                              </div>
                            </Col>
                          </Row>
                        </Space>
                      </Card>
                    )}

                    <Form.Item>
                      <Button
                        type="primary"
                        htmlType="submit"
                        size="large"
                        block
                        icon={<ArrowUpOutlined />}
                      >
                        提交买入订单
                      </Button>
                    </Form.Item>
                  </Form>
                </TabPane>

                <TabPane
                  tab={
                    <Space>
                      <ArrowDownOutlined style={{ color: '#ff4d4f' }} />
                      <Text>卖出</Text>
                    </Space>
                  }
                  key="2"
                >
                  <Form
                    form={sellForm}
                    layout="vertical"
                    onFinish={handleSellSubmit}
                  >
                    <Form.Item
                      label="选择持仓"
                      name="symbol"
                      rules={[{ required: true, message: '请选择要卖出的股票' }]}
                    >
                      <Select
                        placeholder="从持仓中选择股票"
                        size="large"
                        showSearch
                      >
                        {mockPositions.map(position => (
                          <Option key={position.symbol} value={position.symbol}>
                            <Space>
                              <Text strong>{position.symbol}</Text>
                              <Text type="secondary">
                                持仓: {position.quantity}股
                              </Text>
                              <Text type={position.pnl >= 0 ? 'success' : 'danger'}>
                                {position.pnl >= 0 ? '+' : ''}¥{position.pnl.toFixed(2)}
                              </Text>
                            </Space>
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>

                    <Form.Item
                      label="卖出数量"
                      name="quantity"
                      rules={[
                        { required: true, message: '请输入卖出数量' },
                        { type: 'number', min: 1, message: '数量必须大于0' },
                      ]}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        size="large"
                        min={1}
                        precision={0}
                        addonAfter="股"
                      />
                    </Form.Item>

                    <Form.Item
                      label="订单类型"
                      name="orderType"
                      initialValue="market"
                    >
                      <Select size="large">
                        <Option value="market">市价单</Option>
                        <Option value="limit">限价单</Option>
                      </Select>
                    </Form.Item>

                    <Form.Item>
                      <Button
                        type="primary"
                        htmlType="submit"
                        size="large"
                        block
                        danger
                        icon={<ArrowDownOutlined />}
                      >
                        提交卖出订单
                      </Button>
                    </Form.Item>
                  </Form>
                </TabPane>
              </Tabs>
            </Card>

            {/* 实时行情 */}
            <Card
              title={
                <Space>
                  <StockOutlined />
                  <Text strong>实时行情</Text>
                </Space>
              }
              extra={
                <Button type="link" size="small" icon={<SearchOutlined />}>
                  搜索股票
                </Button>
              }
            >
              <Table
                dataSource={mockStocks}
                columns={[
                  {
                    title: '代码',
                    dataIndex: 'symbol',
                    key: 'symbol',
                    render: (symbol) => <Text strong>{symbol}</Text>,
                  },
                  {
                    title: '名称',
                    dataIndex: 'name',
                    key: 'name',
                  },
                  {
                    title: '价格',
                    dataIndex: 'price',
                    key: 'price',
                    render: (price) => `¥${price.toFixed(2)}`,
                  },
                  {
                    title: '涨跌',
                    dataIndex: 'change',
                    key: 'change',
                    render: (change, record) => (
                      <Text type={change >= 0 ? 'success' : 'danger'}>
                        {change >= 0 ? '+' : ''}{change.toFixed(2)}
                      </Text>
                    ),
                  },
                  {
                    title: '涨跌幅',
                    dataIndex: 'changePercent',
                    key: 'changePercent',
                    render: (changePercent, record) => (
                      <Tag color={changePercent >= 0 ? 'green' : 'red'}>
                        {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
                      </Tag>
                    ),
                  },
                  {
                    title: '操作',
                    key: 'action',
                    render: (_, record) => (
                      <Button
                        type="link"
                        size="small"
                        onClick={() => {
                          setSelectedStock(record.symbol);
                          buyForm.setFieldsValue({
                            symbol: record.symbol,
                            quantity: 100,
                          });
                          // 切换到买入标签页
                          document.querySelector('.ant-tabs-tab[data-node-key="1"]')?.click();
                        }}
                      >
                        交易
                      </Button>
                    ),
                  },
                ]}
                pagination={false}
                size="small"
                rowKey="symbol"
              />
            </Card>
          </Space>
        </Col>

        {/* 右侧：持仓信息和交易提示 */}
        <Col xs={24} lg={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* 持仓概览 */}
            <Card
              title={
                <Space>
                  <DollarOutlined />
                  <Text strong>当前持仓</Text>
                </Space>
              }
            >
              <Table
                dataSource={mockPositions}
                columns={positionColumns}
                pagination={false}
                size="small"
                rowKey="symbol"
                scroll={{ x: true }}
              />
            </Card>

            {/* 交易提示 */}
            <Card
              title={
                <Space>
                  <HistoryOutlined />
                  <Text strong>交易提示</Text>
                </Space>
              }
              size="small"
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert
                  message="交易时间"
                  description="A股交易时间：工作日 9:30-11:30, 13:00-15:00"
                  type="info"
                  showIcon
                />
                <Alert
                  message="手续费"
                  description="模拟交易手续费：买入0.03%，卖出0.13%"
                  type="warning"
                  showIcon
                />
                <Alert
                  message="风险提示"
                  description="股市有风险，投资需谨慎。本平台为模拟交易，不构成投资建议。"
                  type="error"
                  showIcon
                />
              </Space>
            </Card>

            {/* 快速操作 */}
            <Card size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text strong>快速操作</Text>
                <Row gutter={[8, 8]}>
                  <Col span={12}>
                    <Button type="primary" block icon={<ArrowUpOutlined />}>
                      一键买入
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button danger block icon={<ArrowDownOutlined />}>
                      一键卖出
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button block icon={<CalculatorOutlined />}>
                      盈亏计算
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button block icon={<HistoryOutlined />}>
                      交易记录
                    </Button>
                  </Col>
                </Row>
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
};

// 添加缺失的图标导入
const StockOutlined = ({ style }: { style?: React.CSSProperties }) => (
  <span style={style}>📈</span>
);

export default Trading;