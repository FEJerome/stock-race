import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Typography,
  Space,
  Tag,
  Input,
  Button,
  Select,
  Badge,
  Tooltip,
  Row,
  Col,
} from 'antd';
import {
  StockOutlined,
  SearchOutlined,
  StarOutlined,
  StarFilled,
  RiseOutlined,
  FallOutlined,
  FireOutlined,
  EyeOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;
const { Option } = Select;
const { Search } = Input;

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  peRatio?: number;
  isFavorite: boolean;
}

const RealTimeQuotes: React.FC = () => {
  const [searchText, setSearchText] = useState('');
  const [selectedExchange, setSelectedExchange] = useState('all');
  const [favorites, setFavorites] = useState<string[]>(['AAPL', 'MSFT', 'GOOGL']);
  const [quotes, setQuotes] = useState<StockQuote[]>([
    { symbol: 'AAPL', name: '苹果公司', price: 162.50, change: 1.25, changePercent: 0.78, volume: 45200000, marketCap: 2540000000000, peRatio: 28.5, isFavorite: true },
    { symbol: 'MSFT', name: '微软公司', price: 415.75, change: -2.25, changePercent: -0.54, volume: 28500000, marketCap: 3090000000000, peRatio: 35.2, isFavorite: true },
    { symbol: 'GOOGL', name: '谷歌', price: 145.25, change: 0.75, changePercent: 0.52, volume: 18500000, marketCap: 1820000000000, peRatio: 24.8, isFavorite: true },
    { symbol: 'AMZN', name: '亚马逊', price: 178.50, change: 3.25, changePercent: 1.86, volume: 42500000, marketCap: 1840000000000, peRatio: 58.3, isFavorite: false },
    { symbol: 'TSLA', name: '特斯拉', price: 195.50, change: -5.25, changePercent: -2.61, volume: 125000000, marketCap: 620000000000, peRatio: 65.8, isFavorite: false },
    { symbol: 'NVDA', name: '英伟达', price: 950.25, change: 25.50, changePercent: 2.76, volume: 85000000, marketCap: 2370000000000, peRatio: 72.4, isFavorite: false },
    { symbol: 'META', name: 'Meta', price: 485.75, change: 8.25, changePercent: 1.73, volume: 18500000, marketCap: 1240000000000, peRatio: 32.1, isFavorite: false },
    { symbol: 'BABA', name: '阿里巴巴', price: 78.25, change: -0.75, changePercent: -0.95, volume: 28500000, marketCap: 198000000000, peRatio: 18.5, isFavorite: false },
    { symbol: 'TSM', name: '台积电', price: 142.80, change: 2.30, changePercent: 1.64, volume: 12500000, marketCap: 740000000000, peRatio: 22.3, isFavorite: false },
    { symbol: 'JPM', name: '摩根大通', price: 195.25, change: 1.75, changePercent: 0.90, volume: 8500000, marketCap: 570000000000, peRatio: 11.8, isFavorite: false },
  ]);

  // 模拟实时更新
  useEffect(() => {
    const interval = setInterval(() => {
      setQuotes(prevQuotes =>
        prevQuotes.map(quote => ({
          ...quote,
          price: quote.price + (Math.random() - 0.5) * 0.5,
          change: quote.change + (Math.random() - 0.5) * 0.1,
          changePercent: ((quote.price + (Math.random() - 0.5) * 0.5) / (quote.price - quote.change) - 1) * 100,
        }))
      );
    }, 5000); // 每5秒更新一次

    return () => clearInterval(interval);
  }, []);

  // 切换收藏状态
  const toggleFavorite = (symbol: string) => {
    setFavorites(prev =>
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );

    setQuotes(prevQuotes =>
      prevQuotes.map(quote =>
        quote.symbol === symbol
          ? { ...quote, isFavorite: !quote.isFavorite }
          : quote
      )
    );
  };

  // 过滤股票
  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch =
      quote.symbol.toLowerCase().includes(searchText.toLowerCase()) ||
      quote.name.toLowerCase().includes(searchText.toLowerCase());

    const matchesExchange = selectedExchange === 'all' ||
      (selectedExchange === 'nasdaq' && ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'].includes(quote.symbol)) ||
      (selectedExchange === 'nyse' && ['TSLA', 'JPM'].includes(quote.symbol));

    return matchesSearch && matchesExchange;
  });

  // 表格列定义
  const columns = [
    {
      title: '股票',
      dataIndex: 'symbol',
      key: 'symbol',
      width: 120,
      render: (symbol: string, record: StockQuote) => (
        <Space>
          <Tooltip title={record.isFavorite ? '取消收藏' : '加入收藏'}>
            <Button
              type="text"
              icon={record.isFavorite ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
              size="small"
              onClick={() => toggleFavorite(symbol)}
            />
          </Tooltip>
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
      title: '价格',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (price: number) => (
        <Text strong>¥{price.toFixed(2)}</Text>
      ),
      sorter: (a: StockQuote, b: StockQuote) => a.price - b.price,
    },
    {
      title: '涨跌',
      dataIndex: 'change',
      key: 'change',
      width: 100,
      render: (change: number, record: StockQuote) => (
        <Space>
          {change >= 0 ? (
            <RiseOutlined style={{ color: '#52c41a' }} />
          ) : (
            <FallOutlined style={{ color: '#ff4d4f' }} />
          )}
          <Text type={change >= 0 ? 'success' : 'danger'} strong>
            {change >= 0 ? '+' : ''}{change.toFixed(2)}
          </Text>
        </Space>
      ),
      sorter: (a: StockQuote, b: StockQuote) => a.change - b.change,
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      key: 'changePercent',
      width: 100,
      render: (percent: number) => (
        <Tag color={percent >= 0 ? 'green' : 'red'}>
          {percent >= 0 ? '+' : ''}{percent.toFixed(2)}%
        </Tag>
      ),
      sorter: (a: StockQuote, b: StockQuote) => a.changePercent - b.changePercent,
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      key: 'volume',
      width: 120,
      render: (volume: number) => (
        <Text>{(volume / 10000).toFixed(1)}万</Text>
      ),
      sorter: (a: StockQuote, b: StockQuote) => a.volume - b.volume,
    },
    {
      title: '市值',
      dataIndex: 'marketCap',
      key: 'marketCap',
      width: 120,
      render: (marketCap?: number) => (
        <Text>
          {marketCap ? `¥${(marketCap / 1000000000).toFixed(1)}B` : '-'}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: StockQuote) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="text"
              icon={<EyeOutlined />}
              size="small"
            />
          </Tooltip>
          <Tooltip title="快速交易">
            <Button
              type="link"
              size="small"
              onClick={() => {
                // 这里可以触发交易操作
                console.log('交易:', record.symbol);
              }}
            >
              交易
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <StockOutlined />
          <Text strong>实时行情</Text>
          <Badge count="实时" style={{ backgroundColor: '#52c41a' }} />
        </Space>
      }
      extra={
        <Space>
          <Select
            value={selectedExchange}
            onChange={setSelectedExchange}
            size="small"
            style={{ width: 120 }}
          >
            <Option value="all">全部市场</Option>
            <Option value="nasdaq">纳斯达克</Option>
            <Option value="nyse">纽约交易所</Option>
            <Option value="sh">上海交易所</Option>
            <Option value="sz">深圳交易所</Option>
          </Select>
          <Search
            placeholder="搜索股票代码或名称"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 200 }}
            size="small"
          />
        </Space>
      }
    >
      {/* 热门股票 */}
      <div style={{ marginBottom: 16 }}>
        <Space size="middle">
          <Text strong>热门股票：</Text>
          {quotes
            .filter(q => ['AAPL', 'TSLA', 'NVDA'].includes(q.symbol))
            .map(stock => (
              <Tag
                key={stock.symbol}
                color={stock.changePercent >= 0 ? 'green' : 'red'}
                icon={stock.changePercent >= 0 ? <RiseOutlined /> : <FallOutlined />}
                style={{ cursor: 'pointer' }}
                onClick={() => setSearchText(stock.symbol)}
              >
                {stock.symbol} {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
              </Tag>
            ))}
          <Button type="link" size="small" icon={<FireOutlined />}>
            更多热门
          </Button>
        </Space>
      </div>

      {/* 行情表格 */}
      <Table
        dataSource={filteredQuotes}
        columns={columns}
        rowKey="symbol"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 只股票`,
        }}
        size="small"
        scroll={{ x: true }}
        rowClassName={(record) => record.isFavorite ? 'favorite-row' : ''}
      />

      {/* 市场摘要 */}
      <div style={{ marginTop: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 8 }}>
        <Row gutter={16}>
          <Col xs={12} md={6}>
            <div>
              <Text type="secondary">上涨股票</Text>
              <Title level={4} style={{ margin: '4px 0', color: '#52c41a' }}>
                {quotes.filter(q => q.changePercent > 0).length}
              </Title>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div>
              <Text type="secondary">下跌股票</Text>
              <Title level={4} style={{ margin: '4px 0', color: '#ff4d4f' }}>
                {quotes.filter(q => q.changePercent < 0).length}
              </Title>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div>
              <Text type="secondary">平盘股票</Text>
              <Title level={4} style={{ margin: '4px 0', color: '#999' }}>
                {quotes.filter(q => q.changePercent === 0).length}
              </Title>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div>
              <Text type="secondary">平均涨跌幅</Text>
              <Title level={4} style={{ margin: '4px 0' }}>
                {(quotes.reduce((sum, q) => sum + q.changePercent, 0) / quotes.length).toFixed(2)}%
              </Title>
            </div>
          </Col>
        </Row>
      </div>

      <style>{`
        .favorite-row {
          background-color: #fffbe6;
        }
        .favorite-row:hover {
          background-color: #fff1b8 !important;
        }
      `}</style>
    </Card>
  );
};

export default RealTimeQuotes;