import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { marketService } from '../../services/market.service';
import { message } from 'antd';
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
  Spin,
  Alert,
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
  ReloadOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;
const { Option } = Select;
const { Search } = Input;

interface StockQuote {
  code: string;           // 股票代码
  name: string;           // 股票名称
  price: number;          // 当前价格
  change: number;         // 涨跌额
  changePercent: number;  // 涨跌幅
  volume: number;         // 成交量
  amount?: number;        // 成交额
  market?: string;        // 市场代码
  industry?: string;      // 行业
  marketCap?: number;     // 市值
  peRatio?: number;       // 市盈率
  isFavorite: boolean;    // 是否收藏
  isFallback?: boolean;   // 是否为降级数据
  timestamp?: string;     // 数据时间戳
  // 兼容字段
  symbol?: string;        // 兼容字段
}

const RealTimeQuotes: React.FC = () => {
  const [searchText, setSearchText] = useState('');
  const [selectedExchange, setSelectedExchange] = useState('all');
  const [favorites, setFavorites] = useState<string[]>(['000001', '600000', '000002']);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());
  const [dataSource, setDataSource] = useState<'real' | 'fallback'>('real');

  // 使用React Query获取股票数据
  const { data: stocksData, isLoading, error, refetch } = useQuery(
    'realTimeQuotes',
    () => marketService.getStockQuotes(),
    {
      refetchInterval: 10000, // 每10秒自动刷新
      onSuccess: (data) => {
        setLastUpdateTime(new Date());
        // 检查是否有降级数据
        const hasFallback = data.some(stock => stock.isFallback);
        setDataSource(hasFallback ? 'fallback' : 'real');

        if (hasFallback) {
          message.warning('部分股票数据使用降级数据，请检查网络连接');
        }
      },
      onError: (err) => {
        console.error('获取股票数据失败:', err);
        message.error('获取股票数据失败，使用降级数据');
        setDataSource('fallback');
      }
    }
  );

  // 转换数据格式
  const quotes: StockQuote[] = (stocksData || []).map(stock => ({
    code: stock.code,
    name: stock.name,
    price: stock.currentPrice,
    change: stock.change,
    changePercent: stock.changePercent,
    volume: stock.volume,
    amount: stock.amount,
    market: stock.market,
    industry: stock.industry,
    marketCap: stock.marketCap,
    peRatio: stock.peRatio,
    isFavorite: favorites.includes(stock.code),
    isFallback: stock.isFallback,
    timestamp: stock.timestamp,
    // 兼容字段
    symbol: stock.code
  }));

  // 手动刷新数据
  const handleRefresh = () => {
    refetch();
    message.info('正在刷新数据...');
  };

  // 切换收藏状态
  const toggleFavorite = (code: string) => {
    setFavorites(prev =>
      prev.includes(code)
        ? prev.filter(s => s !== code)
        : [...prev, code]
    );
  };

  // 过滤股票
  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch =
      (quote.code && quote.code.toLowerCase().includes(searchText.toLowerCase())) ||
      (quote.name && quote.name.toLowerCase().includes(searchText.toLowerCase()));

    const matchesExchange = selectedExchange === 'all' ||
      (selectedExchange === 'sh' && quote.market === 'sh') ||
      (selectedExchange === 'sz' && quote.market === 'sz') ||
      (selectedExchange === 'nasdaq' && quote.market === 'nasdaq') ||
      (selectedExchange === 'nyse' && quote.market === 'nyse');

    return matchesSearch && matchesExchange;
  });

  // 表格列定义
  const columns = [
    {
      title: '股票',
      dataIndex: 'code',
      key: 'code',
      width: 120,
      render: (code: string, record: StockQuote) => (
        <Space>
          <Tooltip title={record.isFavorite ? '取消收藏' : '加入收藏'}>
            <Button
              type="text"
              icon={record.isFavorite ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
              size="small"
              onClick={() => toggleFavorite(code)}
            />
          </Tooltip>
          <div>
            <Text strong>{code}</Text>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.name}
              </Text>
            </div>
            {record.isFallback && (
              <div>
                <Text type="warning" style={{ fontSize: 10 }}>
                  模拟数据
                </Text>
              </div>
            )}
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
              onClick={() => {
                // 这里可以跳转到股票详情页
                console.log('查看详情:', record.code);
              }}
            />
          </Tooltip>
          <Tooltip title="快速交易">
            <Button
              type="link"
              size="small"
              onClick={() => {
                // 这里可以触发交易操作
                console.log('交易:', record.code);
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
          <Badge
            count={dataSource === 'real' ? '实时' : '模拟'}
            style={{ backgroundColor: dataSource === 'real' ? '#52c41a' : '#faad14' }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            最后更新: {lastUpdateTime.toLocaleTimeString('zh-CN')}
          </Text>
        </Space>
      }
      extra={
        <Space>
          <Button
            type="text"
            icon={<ReloadOutlined />}
            size="small"
            onClick={handleRefresh}
            loading={isLoading}
            title="刷新数据"
          />
          <Select
            value={selectedExchange}
            onChange={setSelectedExchange}
            size="small"
            style={{ width: 120 }}
          >
            <Option value="all">全部市场</Option>
            <Option value="sh">上海交易所</Option>
            <Option value="sz">深圳交易所</Option>
            <Option value="nasdaq">纳斯达克</Option>
            <Option value="nyse">纽约交易所</Option>
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
            .slice(0, 5) // 显示前5只股票作为热门
            .map(stock => (
              <Tag
                key={stock.code}
                color={stock.changePercent >= 0 ? 'green' : 'red'}
                icon={stock.changePercent >= 0 ? <RiseOutlined /> : <FallOutlined />}
                style={{ cursor: 'pointer' }}
                onClick={() => setSearchText(stock.code || '')}
              >
                {stock.code} {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
              </Tag>
            ))}
          <Button type="link" size="small" icon={<FireOutlined />}>
            更多热门
          </Button>
        </Space>
      </div>

      {/* 行情表格 */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" tip="加载股票数据中..." />
        </div>
      ) : error ? (
        <Alert
          message="数据加载失败"
          description="无法获取实时股票数据，请检查网络连接或稍后重试。"
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Table
          dataSource={filteredQuotes}
          columns={columns}
          rowKey="code"
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
      )}

      {/* 市场摘要 */}
      {!isLoading && !error && (
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
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              数据来源: {dataSource === 'real' ? '真实市场数据' : '模拟数据'} •
              更新时间: {lastUpdateTime.toLocaleString('zh-CN')} •
              共 {quotes.length} 只股票
            </Text>
          </div>
        </div>
      )}

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