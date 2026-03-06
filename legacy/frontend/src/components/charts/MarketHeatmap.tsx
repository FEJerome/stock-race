import React, { useState, useEffect } from 'react';
import { Card, Select, Row, Col, Statistic, Tag, Empty, Spin, Slider, Switch } from 'antd';
import { Heatmap, HeatmapSeries, Chart, ChartTooltip } from 'recharts';
import {
  FireOutlined,
  LineChartOutlined,
  RiseOutlined,
  FallOutlined,
  StockOutlined,
  FilterOutlined,
  SettingOutlined
} from '@ant-design/icons';

const { Option } = Select;

interface StockData {
  symbol: string;
  name: string;
  sector: string; // 行业
  currentPrice: number;
  change: number; // 涨跌额
  changeRate: number; // 涨跌幅
  volume: number; // 成交量
  turnover: number; // 成交额
  marketCap: number; // 市值
  peRatio?: number; // 市盈率
  pbRatio?: number; // 市净率
}

interface MarketHeatmapProps {
  data?: StockData[];
  loading?: boolean;
  title?: string;
  height?: number;
  showControls?: boolean;
}

const MarketHeatmap: React.FC<MarketHeatmapProps> = ({
  data = [],
  loading = false,
  title = '市场热力图',
  height = 400,
  showControls = true
}) => {
  const [viewMode, setViewMode] = useState<'changeRate' | 'volume' | 'turnover' | 'marketCap'>('changeRate');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [sizeScale, setSizeScale] = useState<number>(50);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [intensity, setIntensity] = useState<number>(70);
  const [filteredData, setFilteredData] = useState<StockData[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);

  // 处理数据
  useEffect(() => {
    if (!data || data.length === 0) {
      setFilteredData([]);
      setHeatmapData([]);
      setSectors([]);
      return;
    }

    // 提取行业信息
    const uniqueSectors = Array.from(new Set(data.map(item => item.sector || '未知').filter(s => s)));
    setSectors(['all', ...uniqueSectors]);

    // 过滤数据
    let filtered = data;
    if (selectedSector !== 'all') {
      filtered = data.filter(item => item.sector === selectedSector);
    }

    setFilteredData(filtered);

    // 准备热力图数据
    const heatmap = filtered.map((item, index) => {
      let value = 0;
      let size = 0;

      switch (viewMode) {
        case 'changeRate':
          value = item.changeRate;
          size = Math.abs(item.changeRate) * (sizeScale / 10);
          break;
        case 'volume':
          value = Math.log10(item.volume || 1);
          size = Math.log10(item.volume || 1) * (sizeScale / 100);
          break;
        case 'turnover':
          value = Math.log10(item.turnover || 1);
          size = Math.log10(item.turnover || 1) * (sizeScale / 100);
          break;
        case 'marketCap':
          value = Math.log10(item.marketCap || 1);
          size = Math.log10(item.marketCap || 1) * (sizeScale / 100);
          break;
      }

      // 生成网格位置
      const gridSize = Math.ceil(Math.sqrt(filtered.length));
      const row = Math.floor(index / gridSize);
      const col = index % gridSize;

      return {
        x: col,
        y: row,
        value,
        size: Math.max(10, Math.min(100, size)),
        ...item
      };
    });

    setHeatmapData(heatmap);
  }, [data, viewMode, selectedSector, sizeScale]);

  // 获取颜色
  const getColor = (value: number) => {
    if (viewMode === 'changeRate') {
      // 涨跌幅：红色表示上涨，绿色表示下跌
      if (value > 0) {
        const intensity = Math.min(1, value / 10); // 假设最大涨幅10%
        return `rgba(255, ${Math.floor(100 - intensity * 100)}, ${Math.floor(100 - intensity * 100)}, ${intensity / 2 + 0.5})`;
      } else {
        const intensity = Math.min(1, Math.abs(value) / 10); // 假设最大跌幅10%
        return `rgba(${Math.floor(100 + intensity * 100)}, 255, ${Math.floor(100 + intensity * 100)}, ${intensity / 2 + 0.5})`;
      }
    } else {
      // 其他指标：蓝色渐变
      const maxValue = Math.max(...heatmapData.map(d => d.value));
      const normalized = maxValue > 0 ? value / maxValue : 0;
      return `rgba(24, 144, 255, ${normalized * 0.7 + 0.3})`;
    }
  };

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
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          minWidth: 200
        }}>
          <p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>
            {data.symbol} - {data.name}
          </p>
          <p style={{ margin: '4px 0', color: '#666', fontSize: 12 }}>
            行业: {data.sector || '未知'}
          </p>

          <div style={{ marginTop: 8 }}>
            <Row gutter={8}>
              <Col span={12}>
                <div style={{ fontSize: 12, color: '#666' }}>当前价格</div>
                <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                  ¥{data.currentPrice.toFixed(2)}
                </div>
              </Col>
              <Col span={12}>
                <div style={{ fontSize: 12, color: '#666' }}>涨跌幅</div>
                <div style={{
                  fontSize: 14,
                  fontWeight: 'bold',
                  color: data.changeRate >= 0 ? '#ff4d4f' : '#52c41a'
                }}>
                  {data.changeRate >= 0 ? '+' : ''}{data.changeRate.toFixed(2)}%
                </div>
              </Col>
            </Row>

            <Row gutter={8} style={{ marginTop: 8 }}>
              <Col span={12}>
                <div style={{ fontSize: 12, color: '#666' }}>涨跌额</div>
                <div style={{
                  fontSize: 14,
                  color: data.change >= 0 ? '#ff4d4f' : '#52c41a'
                }}>
                  {data.change >= 0 ? '+' : ''}¥{data.change.toFixed(2)}
                </div>
              </Col>
              <Col span={12}>
                <div style={{ fontSize: 12, color: '#666' }}>成交量</div>
                <div style={{ fontSize: 14 }}>
                  {(data.volume / 10000).toFixed(2)}万手
                </div>
              </Col>
            </Row>

            <Row gutter={8} style={{ marginTop: 8 }}>
              <Col span={12}>
                <div style={{ fontSize: 12, color: '#666' }}>成交额</div>
                <div style={{ fontSize: 14 }}>
                  ¥{(data.turnover / 100000000).toFixed(2)}亿
                </div>
              </Col>
              <Col span={12}>
                <div style={{ fontSize: 12, color: '#666' }}>市值</div>
                <div style={{ fontSize: 14 }}>
                  ¥{(data.marketCap / 100000000).toFixed(2)}亿
                </div>
              </Col>
            </Row>

            {data.peRatio && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                市盈率: {data.peRatio.toFixed(2)}
                {data.pbRatio && ` | 市净率: ${data.pbRatio.toFixed(2)}`}
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // 获取视图模式标签
  const getViewModeLabel = () => {
    switch (viewMode) {
      case 'changeRate': return '涨跌幅';
      case 'volume': return '成交量';
      case 'turnover': return '成交额';
      case 'marketCap': return '市值';
      default: return viewMode;
    }
  };

  // 统计信息
  const stats = {
    totalStocks: filteredData.length,
    risingStocks: filteredData.filter(item => item.changeRate > 0).length,
    fallingStocks: filteredData.filter(item => item.changeRate < 0).length,
    avgChangeRate: filteredData.length > 0
      ? filteredData.reduce((sum, item) => sum + item.changeRate, 0) / filteredData.length
      : 0,
    totalTurnover: filteredData.reduce((sum, item) => sum + item.turnover, 0)
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
          <Empty description="暂无市场数据" />
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            <FireOutlined /> {title}
          </span>
          {showControls && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Select
                value={viewMode}
                onChange={setViewMode}
                size="small"
                style={{ width: 100 }}
              >
                <Option value="changeRate">涨跌幅</Option>
                <Option value="volume">成交量</Option>
                <Option value="turnover">成交额</Option>
                <Option value="marketCap">市值</Option>
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
      extra={
        showControls && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SettingOutlined />
              <span style={{ fontSize: 12 }}>大小:</span>
              <Slider
                min={10}
                max={100}
                value={sizeScale}
                onChange={setSizeScale}
                style={{ width: 80 }}
                tooltip={{ formatter: null }}
              />
            </div>
            <Switch
              checked={showLabels}
              onChange={setShowLabels}
              size="small"
              checkedChildren="标签"
              unCheckedChildren="标签"
            />
          </div>
        )
      }
    >
      {/* 统计信息 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Statistic
            title="股票数量"
            value={stats.totalStocks}
            suffix="只"
            valueStyle={{ color: '#1890ff' }}
            prefix={<StockOutlined />}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="上涨"
            value={stats.risingStocks}
            suffix="只"
            valueStyle={{ color: '#ff4d4f' }}
            prefix={<RiseOutlined />}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="下跌"
            value={stats.fallingStocks}
            suffix="只"
            valueStyle={{ color: '#52c41a' }}
            prefix={<FallOutlined />}
          />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic
            title="平均涨跌"
            value={stats.avgChangeRate}
            precision={2}
            suffix="%"
            valueStyle={{ color: stats.avgChangeRate >= 0 ? '#ff4d4f' : '#52c41a' }}
            prefix={stats.avgChangeRate >= 0 ? <RiseOutlined /> : <FallOutlined />}
          />
        </Col>
      </Row>

      {/* 热力图 */}
      <div style={{ height, position: 'relative' }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {heatmapData.length === 0 ? (
            <Empty description="暂无数据" />
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(heatmapData.length))}, 1fr)`,
              gap: '4px',
              width: '100%',
              height: '100%',
              alignItems: 'center',
              justifyItems: 'center'
            }}>
              {heatmapData.map((item, index) => (
                <div
                  key={index}
                  style={{
                    width: `${item.size}%`,
                    height: `${item.size}%`,
                    backgroundColor: getColor(item.value),
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    position: 'relative',
                    border: '1px solid rgba(0,0,0,0.1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.zIndex = '10';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.zIndex = '1';
                  }}
                >
                  {showLabels && (
                    <div style={{
                      color: 'white',
                      fontSize: Math.max(8, item.size / 5),
                      fontWeight: 'bold',
                      textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                      textAlign: 'center',
                      padding: '2px'
                    }}>
                      {item.symbol}
                      <div style={{
                        fontSize: Math.max(6, item.size / 8),
                        opacity: 0.9
                      }}>
                        {viewMode === 'changeRate' && `${item.changeRate >= 0 ? '+' : ''}${item.changeRate.toFixed(1)}%`}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 图例 */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FilterOutlined />
            <span style={{ fontSize: 12, color: '#666' }}>图例 ({getViewModeLabel()}):</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {viewMode === 'changeRate' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 20, height: 20, backgroundColor: '#ff4d4f', borderRadius: 2 }} />
                  <span style={{ fontSize: 12 }}>上涨</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 20, height: 20, backgroundColor: '#52c41a', borderRadius: 2 }} />
                  <span style={{ fontSize: 12 }}>下跌</span>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 10,
                  height: 10,
                  backgroundColor: 'rgba(24, 144, 255, 0.3)',
                  borderRadius: 2
                }} />
                <span style={{ fontSize: 12 }}>低</span>
                <div style={{ width: 40, height: 2, background: 'linear-gradient(to right, rgba(24, 144, 255, 0.3), rgba(24, 144, 255, 1))' }} />
                <div style={{
                  width: 20,
                  height: 20,
                  backgroundColor: 'rgba(24, 144, 255, 1)',
                  borderRadius: 2
                }} />
                <span style={{ fontSize: 12 }}>高</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 行业分布 */}
      {sectors.length > 2 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ marginBottom: 8, fontSize: 14 }}>
            <LineChartOutlined /> 行业分布
          </h4>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            maxHeight: 80,
            overflowY: 'auto',
            padding: '8px',
            border: '1px solid #f0f0f0',
            borderRadius: 4
          }}>
            {sectors.filter(s => s !== 'all').map(sector => {
              const sectorStocks = data.filter(item => item.sector === sector);
              const sectorRising = sectorStocks.filter(item => item.changeRate > 0).length;
              const sectorFalling = sectorStocks.filter(item => item.changeRate < 0).length;
              const sectorAvgChange = sectorStocks.length > 0
                ? sectorStocks.reduce((sum, item) => sum + item.changeRate, 0) / sectorStocks.length
                : 0;

              return (
                <Tag
                  key={sector}
                  color={selectedSector === sector ? 'blue' : 'default'}
                  onClick={() => setSelectedSector(sector === selectedSector ? 'all' : sector)}
                  style={{ cursor: 'pointer' }}
                >
                  {sector}
                  <span style={{ marginLeft: 4, fontSize: 10 }}>
                    ({sectorStocks.length})
                    <span style={{
                      color: sectorAvgChange >= 0 ? '#ff4d4f' : '#52c41a',
                      marginLeft: 4
                    }}>
                      {sectorAvgChange >= 0 ? '+' : ''}{sectorAvgChange.toFixed(1)}%
                    </span>
                  </span>
                </Tag>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
};

export default MarketHeatmap;