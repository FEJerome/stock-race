import React from 'react';
import {
  Card,
  Table,
  Typography,
  Space,
  Tag,
  Avatar,
  Row,
  Col,
  Statistic,
  Progress,
  Select,
  DatePicker,
  Button,
  Grid,
} from 'antd';
import {
  TrophyOutlined,
  CrownOutlined,
  RiseOutlined,
  FallOutlined,
  FireOutlined,
  LineChartOutlined,
  CalendarOutlined,
  FilterOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;
const { useBreakpoint } = Grid;

// 模拟排行榜数据
const mockRankings = [
  { rank: 1, username: '股神巴菲特', totalValue: 256430.50, totalPnl: 56430.50, totalPnlPercent: 28.25, change: 0 },
  { rank: 2, username: 'AI交易大师', totalValue: 198750.25, totalPnl: 38750.25, totalPnlPercent: 24.18, change: 1 },
  { rank: 3, username: '量化小王子', totalValue: 187540.75, totalPnl: 37540.75, totalPnlPercent: 25.03, change: -1 },
  { rank: 4, username: '价值投资者', totalValue: 165430.50, totalPnl: 25430.50, totalPnlPercent: 18.18, change: 2 },
  { rank: 5, username: '短线高手', totalValue: 154320.25, totalPnl: 24320.25, totalPnlPercent: 18.72, change: 0 },
  { rank: 6, username: '稳健理财', totalValue: 143210.75, totalPnl: 23210.75, totalPnlPercent: 19.35, change: -2 },
  { rank: 7, username: '科技股猎手', totalValue: 132100.50, totalPnl: 22100.50, totalPnlPercent: 20.08, change: 1 },
  { rank: 8, username: '新能源先锋', totalValue: 120990.25, totalPnl: 20990.25, totalPnlPercent: 21.01, change: 0 },
  { rank: 9, username: '医药专家', totalValue: 109880.75, totalPnl: 19880.75, totalPnlPercent: 22.08, change: 0 },
  { rank: 10, username: '消费升级', totalValue: 98770.50, totalPnl: 18770.50, totalPnlPercent: 23.45, change: 0 },
];

// 模拟我的排名数据
const myRanking = {
  rank: 15,
  username: '当前用户',
  totalValue: 125430.50,
  totalPnl: 15430.50,
  totalPnlPercent: 14.03,
  change: 3,
};

// 模拟时间段选项
const timePeriods = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '本年', value: 'year' },
  { label: '全部', value: 'all' },
];

const Competition: React.FC = () => {
  const screens = useBreakpoint();
  const [selectedPeriod, setSelectedPeriod] = React.useState('month');

  // 排行榜表格列定义
  const rankingColumns = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 80,
      render: (rank: number) => {
        if (rank <= 3) {
          const colors = ['#ffd700', '#c0c0c0', '#cd7f32'];
          const icons = [<CrownOutlined />, <CrownOutlined />, <CrownOutlined />];
          return (
            <Space>
              <Avatar
                style={{
                  backgroundColor: colors[rank - 1],
                  color: '#fff',
                }}
                icon={icons[rank - 1]}
              />
              <Text strong style={{ fontSize: 16 }}>
                {rank}
              </Text>
            </Space>
          );
        }
        return (
          <Text strong style={{ fontSize: 16 }}>
            {rank}
          </Text>
        );
      },
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      render: (username: string, record: any) => (
        <Space>
          <Avatar
            style={{
              backgroundColor: record.rank <= 3 ? '#ffd700' : '#1890ff',
              color: '#fff',
            }}
          >
            {username.charAt(0)}
          </Avatar>
          <div>
            <Text strong>{username}</Text>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.rank <= 3 ? '🏆 冠军竞争者' : '🎯 活跃交易者'}
              </Text>
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: '总资产',
      dataIndex: 'totalValue',
      key: 'totalValue',
      render: (value: number) => (
        <Text strong>¥{value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
      ),
    },
    {
      title: '总收益',
      dataIndex: 'totalPnl',
      key: 'totalPnl',
      render: (pnl: number, record: any) => (
        <Space direction="vertical" size={0}>
          <Text type={pnl >= 0 ? 'success' : 'danger'} strong>
            {pnl >= 0 ? '+' : ''}¥{pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Text>
          <Text type={record.totalPnlPercent >= 0 ? 'success' : 'danger'} style={{ fontSize: 12 }}>
            {record.totalPnlPercent >= 0 ? '+' : ''}{record.totalPnlPercent.toFixed(2)}%
          </Text>
        </Space>
      ),
    },
    {
      title: '排名变化',
      dataIndex: 'change',
      key: 'change',
      render: (change: number) => {
        if (change > 0) {
          return (
            <Tag color="green" icon={<RiseOutlined />}>
              ↑ {change}
            </Tag>
          );
        } else if (change < 0) {
          return (
            <Tag color="red" icon={<FallOutlined />}>
              ↓ {Math.abs(change)}
            </Tag>
          );
        } else {
          return <Tag color="default">-</Tag>;
        }
      },
    },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Button type="link" size="small">
          查看详情
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: '100%' }}>
      {/* 页面标题 */}
      <Space direction="vertical" size="middle" style={{ width: '100%', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>
          <TrophyOutlined /> 排行榜
        </Title>
        <Text type="secondary">
          查看其他交易者的表现，竞争成为最佳投资者。
        </Text>
      </Space>

      {/* 筛选器 */}
      <Card
        style={{ marginBottom: 24 }}
        bodyStyle={{ padding: screens.md ? 24 : 16 }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={8}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text strong>时间段</Text>
              <Select
                value={selectedPeriod}
                onChange={setSelectedPeriod}
                style={{ width: '100%' }}
                size="large"
              >
                {timePeriods.map(period => (
                  <Option key={period.value} value={period.value}>
                    {period.label}
                  </Option>
                ))}
              </Select>
            </Space>
          </Col>

          <Col xs={24} md={8}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text strong>日期范围</Text>
              <RangePicker
                style={{ width: '100%' }}
                size="large"
                suffixIcon={<CalendarOutlined />}
              />
            </Space>
          </Col>

          <Col xs={24} md={8}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text strong>筛选条件</Text>
              <Select
                mode="multiple"
                placeholder="选择筛选条件"
                style={{ width: '100%' }}
                size="large"
                suffixIcon={<FilterOutlined />}
              >
                <Option value="ai">AI交易者</Option>
                <Option value="manual">手动交易者</Option>
                <Option value="high-risk">高风险偏好</Option>
                <Option value="low-risk">低风险偏好</Option>
                <Option value="active">活跃交易者</Option>
              </Select>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        {/* 左侧：排行榜 */}
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <TrophyOutlined />
                <Text strong>收益率排行榜</Text>
                <Tag color="gold" icon={<FireOutlined />}>
                  实时更新
                </Tag>
              </Space>
            }
            extra={
              <Space>
                <Button type="link" size="small">
                  刷新
                </Button>
                <Button type="link" size="small">
                  导出数据
                </Button>
              </Space>
            }
          >
            <Table
              dataSource={mockRankings}
              columns={rankingColumns}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `共 ${total} 名参赛者`,
              }}
              rowKey="rank"
              scroll={{ x: true }}
            />
          </Card>
        </Col>

        {/* 右侧：我的排名和统计信息 */}
        <Col xs={24} lg={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* 我的排名 */}
            <Card
              title={
                <Space>
                  <LineChartOutlined />
                  <Text strong>我的排名</Text>
                </Space>
              }
            >
              <Space direction="vertical" size={24} style={{ width: '100%' }}>
                <div style={{ textAlign: 'center' }}>
                  <Avatar
                    size={80}
                    style={{
                      backgroundColor: '#1890ff',
                      color: '#fff',
                      fontSize: 32,
                      marginBottom: 16,
                    }}
                  >
                    {myRanking.username.charAt(0)}
                  </Avatar>
                  <Title level={3} style={{ margin: 0 }}>
                    {myRanking.username}
                  </Title>
                  <Text type="secondary">当前用户</Text>
                </div>

                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="当前排名"
                      value={myRanking.rank}
                      prefix="#"
                      valueStyle={{ color: '#1890ff', fontSize: 24 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="排名变化"
                      value={myRanking.change}
                      prefix={myRanking.change > 0 ? '+' : ''}
                      valueStyle={{
                        color: myRanking.change > 0 ? '#3f8600' : myRanking.change < 0 ? '#cf1322' : '#999',
                        fontSize: 24,
                      }}
                    />
                  </Col>
                </Row>

                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    距离前10名
                  </Text>
                  <Progress
                    percent={((10 - myRanking.rank + 10) / 20) * 100}
                    strokeColor={{
                      '0%': '#ff4d4f',
                      '100%': '#52c41a',
                    }}
                    format={() => `还需超越 ${myRanking.rank - 10} 名`}
                  />
                </div>

                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="总资产"
                      value={myRanking.totalValue}
                      precision={2}
                      prefix="¥"
                      valueStyle={{ fontSize: 18 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="总收益"
                      value={myRanking.totalPnlPercent}
                      precision={2}
                      prefix={myRanking.totalPnlPercent >= 0 ? '+' : ''}
                      suffix="%"
                      valueStyle={{
                        color: myRanking.totalPnlPercent >= 0 ? '#3f8600' : '#cf1322',
                        fontSize: 18,
                      }}
                    />
                  </Col>
                </Row>

                <Button type="primary" block icon={<LineChartOutlined />}>
                  查看我的详细报告
                </Button>
              </Space>
            </Card>

            {/* 排行榜统计 */}
            <Card size="small">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Text strong>排行榜统计</Text>
                <Row gutter={[8, 8]}>
                  <Col span={12}>
                    <Card size="small" bordered={false} style={{ background: '#f6ffed' }}>
                      <Statistic
                        title="参赛者总数"
                        value={156}
                        valueStyle={{ fontSize: 20 }}
                      />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" bordered={false} style={{ background: '#fff7e6' }}>
                      <Statistic
                        title="AI交易者"
                        value={42}
                        suffix="/ 156"
                        valueStyle={{ fontSize: 20 }}
                      />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" bordered={false} style={{ background: '#e6f7ff' }}>
                      <Statistic
                        title="平均收益率"
                        value={18.5}
                        suffix="%"
                        valueStyle={{ fontSize: 20 }}
                      />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" bordered={false} style={{ background: '#f9f0ff' }}>
                      <Statistic
                        title="最高收益率"
                        value={28.3}
                        suffix="%"
                        valueStyle={{ fontSize: 20 }}
                      />
                    </Card>
                  </Col>
                </Row>
              </Space>
            </Card>

            {/* 奖励信息 */}
            <Card size="small">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Text strong>
                  <TrophyOutlined /> 本月奖励
                </Text>
                <Space direction="vertical" size={8}>
                  <Tag color="gold" icon={<CrownOutlined />}>
                    第1名：¥5,000奖金 + 高级功能
                  </Tag>
                  <Tag color="silver" icon={<CrownOutlined />}>
                    第2-3名：¥2,000奖金
                  </Tag>
                  <Tag color="bronze" icon={<CrownOutlined />}>
                    第4-10名：¥500奖金
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    奖励每月发放，基于月度收益率排名
                  </Text>
                </Space>
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
};


export default Competition;