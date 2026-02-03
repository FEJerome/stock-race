import React from 'react';
import {
  Card,
  Typography,
  Space,
  Select,
  Button,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  LineChartOutlined,
  DownloadOutlined,
  FilterOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

interface ProfitChartProps {
  title?: string;
  height?: number;
  showControls?: boolean;
}

const ProfitChart: React.FC<ProfitChartProps> = ({
  title = '收益曲线',
  height = 300,
  showControls = true,
}) => {
  // 模拟收益数据
  const profitData = [
    { date: '2026-01-01', value: 100000, profit: 0 },
    { date: '2026-01-08', value: 102500, profit: 2500 },
    { date: '2026-01-15', value: 105800, profit: 5800 },
    { date: '2026-01-22', value: 103200, profit: 3200 },
    { date: '2026-01-29', value: 108900, profit: 8900 },
    { date: '2026-02-05', value: 112400, profit: 12400 },
    { date: '2026-02-12', value: 115300, profit: 15300 },
    { date: '2026-02-19', value: 118700, profit: 18700 },
    { date: '2026-02-26', value: 125430, profit: 25430 },
  ];

  const latestData = profitData[profitData.length - 1];
  const firstData = profitData[0];
  const totalProfit = latestData.profit;
  const profitPercentage = ((latestData.value - firstData.value) / firstData.value) * 100;

  return (
    <Card
      title={
        <Space>
          <LineChartOutlined />
          <Text strong>{title}</Text>
        </Space>
      }
      extra={
        showControls && (
          <Space>
            <Select defaultValue="month" size="small" style={{ width: 100 }}>
              <Option value="week">本周</Option>
              <Option value="month">本月</Option>
              <Option value="quarter">本季</Option>
              <Option value="year">本年</Option>
            </Select>
            <Button type="text" icon={<FilterOutlined />} size="small" />
            <Button type="text" icon={<DownloadOutlined />} size="small" />
          </Space>
        )
      }
    >
      {/* 统计信息 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} md={6}>
          <Statistic
            title="当前资产"
            value={latestData.value}
            precision={2}
            prefix="¥"
            valueStyle={{ fontSize: 16 }}
          />
        </Col>
        <Col xs={12} md={6}>
          <Statistic
            title="总收益"
            value={totalProfit}
            precision={2}
            prefix="¥"
            valueStyle={{
              fontSize: 16,
              color: totalProfit >= 0 ? '#3f8600' : '#cf1322',
            }}
          />
        </Col>
        <Col xs={12} md={6}>
          <Statistic
            title="收益率"
            value={profitPercentage}
            precision={2}
            prefix={profitPercentage >= 0 ? '+' : ''}
            suffix="%"
            valueStyle={{
              fontSize: 16,
              color: profitPercentage >= 0 ? '#3f8600' : '#cf1322',
            }}
          />
        </Col>
        <Col xs={12} md={6}>
          <Statistic
            title="交易天数"
            value={profitData.length}
            valueStyle={{ fontSize: 16 }}
          />
        </Col>
      </Row>

      {/* 图表区域 */}
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
          borderRadius: 8,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* 模拟图表网格 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `
              linear-gradient(to right, #e0e0e0 1px, transparent 1px),
              linear-gradient(to bottom, #e0e0e0 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
            opacity: 0.3,
          }}
        />

        {/* 模拟收益曲线 */}
        <div
          style={{
            position: 'relative',
            width: '90%',
            height: '70%',
          }}
        >
          {/* 曲线路径 */}
          <svg
            width="100%"
            height="100%"
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            <path
              d="M0,100 L50,90 L100,85 L150,80 L200,75 L250,70 L300,65 L350,60 L400,55"
              stroke="#1890ff"
              strokeWidth="3"
              fill="none"
            />
            <path
              d="M0,100 L50,90 L100,85 L150,80 L200,75 L250,70 L300,65 L350,60 L400,55"
              stroke="url(#gradient)"
              strokeWidth="3"
              fill="none"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1890ff" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#52c41a" stopOpacity="0.8" />
              </linearGradient>
            </defs>
          </svg>

          {/* 数据点 */}
          {[0, 100, 200, 300, 400].map((x, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${x}px`,
                top: `${100 - i * 10}px`,
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#1890ff',
                border: '2px solid #fff',
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
        </div>

        {/* 图表说明 */}
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            right: 16,
            textAlign: 'center',
          }}
        >
          <Text type="secondary">
            鼠标悬停查看详细数据 · 点击拖动缩放 · 双击重置视图
          </Text>
        </div>
      </div>

      {/* 图例 */}
      <div style={{ marginTop: 16 }}>
        <Space>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: '#1890ff',
                marginRight: 8,
              }}
            />
            <Text type="secondary">资产总值</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: '#52c41a',
                marginRight: 8,
              }}
            />
            <Text type="secondary">累计收益</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: '#fa8c16',
                marginRight: 8,
              }}
            />
            <Text type="secondary">基准指数</Text>
          </div>
        </Space>
      </div>
    </Card>
  );
};

export default ProfitChart;