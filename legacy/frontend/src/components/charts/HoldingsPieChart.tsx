import React, { useState, useEffect } from 'react';
import { Card, Select, Row, Col, Statistic, Tag, Empty, Spin } from 'antd';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { DollarOutlined, PieChartOutlined, StockOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

const { Option } = Select;

interface HoldingItem {
  symbol: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  currentValue: number;
  profitLoss: number;
  profitLossRate: number;
  weight: number; // 持仓权重
  sector?: string; // 行业
}

interface HoldingsPieChartProps {
  data?: HoldingItem[];
  loading?: boolean;
  title?: string;
  height?: number;
  showControls?: boolean;
}

const HoldingsPieChart: React.FC<HoldingsPieChartProps> = ({
  data = [],
  loading = false,
  title = '持仓分布',
  height = 300,
  showControls = true
}) => {
  const [viewMode, setViewMode] = useState<'value' | 'quantity' | 'weight'>('value');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [chartData, setChartData] = useState<any[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [totalProfitLoss, setTotalProfitLoss] = useState(0);
  const [sectors, setSectors] = useState<string[]>([]);

  // 处理数据
  useEffect(() => {
    if (!data || data.length === 0) {
      setChartData([]);
      setTotalValue(0);
      setTotalProfitLoss(0);
      setSectors([]);
      return;
    }

    // 计算总价值和总盈亏
    const totalVal = data.reduce((sum, item) => sum + item.currentValue, 0);
    const totalPL = data.reduce((sum, item) => sum + item.profitLoss, 0);

    setTotalValue(totalVal);
    setTotalProfitLoss(totalPL);

    // 提取行业信息
    const uniqueSectors = Array.from(new Set(data.map(item => item.sector || '未知').filter(s => s)));
    setSectors(['all', ...uniqueSectors]);

    // 过滤数据
    let filteredData = data;
    if (selectedSector !== 'all') {
      filteredData = data.filter(item => item.sector === selectedSector);
    }

    // 准备图表数据
    let chartData = [];
    switch (viewMode) {
      case 'value':
        chartData = filteredData.map(item => ({
          name: item.symbol,
          value: item.currentValue,
          fullName: item.name,
          quantity: item.quantity,
          avgPrice: item.avgPrice,
          currentPrice: item.currentPrice,
          profitLoss: item.profitLoss,
          profitLossRate: item.profitLossRate,
          weight: item.weight,
          sector: item.sector
        }));
        break;

      case 'quantity':
        chartData = filteredData.map(item => ({
          name: item.symbol,
          value: item.quantity,
          fullName: item.name,
          quantity: item.quantity,
          avgPrice: item.avgPrice,
          currentPrice: item.currentPrice,
          currentValue: item.currentValue,
          profitLoss: item.profitLoss,
          profitLossRate: item.profitLossRate,
          weight: item.weight,
          sector: item.sector
        }));
        break;

      case 'weight':
        chartData = filteredData.map(item => ({
          name: item.symbol,
          value: item.weight,
          fullName: item.name,
          quantity: item.quantity,
          avgPrice: item.avgPrice,
          currentPrice: item.currentPrice,
          currentValue: item.currentValue,
          profitLoss: item.profitLoss,
          profitLossRate: item.profitLossRate,
          weight: item.weight,
          sector: item.sector
        }));
        break;
    }

    // 按值排序，取前10个，其他合并为"其他"
    chartData.sort((a, b) => b.value - a.value);

    if (chartData.length > 10) {
      const top10 = chartData.slice(0, 10);
      const others = chartData.slice(10);
      const othersValue = others.reduce((sum, item) => sum + item.value, 0);

      const othersItem = {
        name: '其他',
        value: othersValue,
        fullName: `其他${others.length}只股票`,
        quantity: others.reduce((sum, item) => sum + item.quantity, 0),
        avgPrice: 0,
        currentPrice: 0,
        currentValue: othersValue,
        profitLoss: others.reduce((sum, item) => sum + item.profitLoss, 0),
        profitLossRate: 0,
        weight: others.reduce((sum, item) => sum + item.weight, 0),
        sector: '其他'
      };

      setChartData([...top10, othersItem]);
    } else {
      setChartData(chartData);
    }
  }, [data, viewMode, selectedSector]);

  // 颜色配置
  const COLORS = [
    '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8',
    '#82CA9D', '#FF6B6B', '#4ECDC4', '#FFD166', '#06D6A0',
    '#118AB2', '#EF476F', '#073B4C', '#7209B7', '#3A86FF',
    '#FB5607', '#8338EC', '#FF006E', '#FFBE0B', '#3A86FF'
  ];

  // 自定义Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          backgroundColor: 'white',
          padding: '12px',
          border: '1px solid #d9d9d9',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        }}>
          <p style={{ margin: 0, fontWeight: 'bold' }}>
            {data.name} - {data.fullName}
          </p>
          <p style={{ margin: '4px 0', color: '#666' }}>
            行业: {data.sector || '未知'}
          </p>
          <p style={{ margin: '4px 0' }}>
            {viewMode === 'value' && `市值: ¥${data.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            {viewMode === 'quantity' && `数量: ${data.value.toLocaleString()} 股`}
            {viewMode === 'weight' && `权重: ${data.value.toFixed(2)}%`}
          </p>
          <p style={{ margin: '4px 0' }}>
            持仓数量: {data.quantity.toLocaleString()} 股
          </p>
          <p style={{ margin: '4px 0' }}>
            平均成本: ¥{data.avgPrice.toFixed(2)}
          </p>
          <p style={{ margin: '4px 0' }}>
            当前价格: ¥{data.currentPrice.toFixed(2)}
          </p>
          <p style={{ margin: '4px 0', color: data.profitLoss >= 0 ? '#52c41a' : '#ff4d4f' }}>
            盈亏: {data.profitLoss >= 0 ? '+' : ''}¥{data.profitLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            ({data.profitLossRate >= 0 ? '+' : ''}{data.profitLossRate.toFixed(2)}%)
          </p>
        </div>
      );
    }
    return null;
  };

  // 自定义Legend
  const renderLegend = (props: any) => {
    const { payload } = props;
    return (
      <ul style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        justifyContent: 'center'
      }}>
        {payload.map((entry: any, index: number) => (
          <li key={`item-${index}`} style={{
            display: 'flex',
            alignItems: 'center',
            margin: '4px',
            fontSize: '12px'
          }}>
            <div style={{
              width: '12px',
              height: '12px',
              backgroundColor: entry.color,
              marginRight: '8px',
              borderRadius: '2px'
            }} />
            <span style={{ color: '#666' }}>{entry.value}</span>
          </li>
        ))}
      </ul>
    );
  };

  if (loading) {
    return (
      <Card title={title}>
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card title={title}>
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty description="暂无持仓数据" />
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            <PieChartOutlined /> {title}
          </span>
          {showControls && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Select
                value={viewMode}
                onChange={setViewMode}
                size="small"
                style={{ width: 100 }}
              >
                <Option value="value">按市值</Option>
                <Option value="quantity">按数量</Option>
                <Option value="weight">按权重</Option>
              </Select>

              {sectors.length > 2 && (
                <Select
                  value={selectedSector}
                  onChange={setSelectedSector}
                  size="small"
                  style={{ width: 120 }}
                >
                  <Option value="all">全部行业</Option>
                  {sectors.filter(s => s !== 'all').map(sector => (
                    <Option key={sector} value={sector}>{sector}</Option>
                  ))}
                </Select>
              )}
            </div>
          )}
        </div>
      }
    >
      {/* 统计信息 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={6}>
          <Statistic
            title="总市值"
            value={totalValue}
            precision={2}
            prefix="¥"
            valueStyle={{ color: '#1890ff' }}
            suffix={<DollarOutlined />}
          />
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Statistic
            title="总盈亏"
            value={totalProfitLoss}
            precision={2}
            prefix="¥"
            valueStyle={{ color: totalProfitLoss >= 0 ? '#52c41a' : '#ff4d4f' }}
            prefix={totalProfitLoss >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          />
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Statistic
            title="持仓数量"
            value={data.length}
            suffix="只"
            valueStyle={{ color: '#722ed1' }}
          />
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Statistic
            title="行业分布"
            value={sectors.length - 1}
            suffix="个"
            valueStyle={{ color: '#13c2c2' }}
          />
        </Col>
      </Row>

      {/* 饼图 */}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
              outerRadius="70%"
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={renderLegend} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* 持仓详情 */}
      <div style={{ marginTop: 16 }}>
        <h4 style={{ marginBottom: 8 }}>
          <StockOutlined /> 持仓详情
        </h4>
        <div style={{
          maxHeight: 200,
          overflowY: 'auto',
          border: '1px solid #f0f0f0',
          borderRadius: 4,
          padding: 8
        }}>
          {data.slice(0, 10).map((item, index) => (
            <div
              key={item.symbol}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: index < data.slice(0, 10).length - 1 ? '1px solid #f0f0f0' : 'none'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{item.symbol}</strong>
                  <span style={{ color: '#666', fontSize: 12 }}>{item.name}</span>
                  {item.sector && (
                    <Tag color="blue" size="small">{item.sector}</Tag>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                  {item.quantity.toLocaleString()} 股 × ¥{item.currentPrice.toFixed(2)}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 'bold' }}>
                  ¥{item.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{
                  fontSize: 12,
                  color: item.profitLoss >= 0 ? '#52c41a' : '#ff4d4f'
                }}>
                  {item.profitLoss >= 0 ? '+' : ''}¥{item.profitLoss.toFixed(2)}
                  ({item.profitLossRate >= 0 ? '+' : ''}{item.profitLossRate.toFixed(2)}%)
                </div>
              </div>
            </div>
          ))}

          {data.length > 10 && (
            <div style={{ textAlign: 'center', padding: '8px', color: '#999', fontSize: 12 }}>
              还有 {data.length - 10} 只股票未显示...
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default HoldingsPieChart;