import React, { useState } from 'react';
import {
  Card,
  Typography,
  Space,
  Tag,
  Avatar,
  Timeline,
  Button,
  Select,
  Badge,
  Tooltip,
  List,
  Progress,
  Row,
  Col,
} from 'antd';
import {
  RobotOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  FilterOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

interface AIDecision {
  id: string;
  timestamp: string;
  aiName: string;
  modelType: 'deepseek' | 'glm-4.5' | 'glm-4.6' | 'glm-4.7';
  stockSymbol: string;
  stockName: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  reason: string;
  status: 'executed' | 'pending' | 'rejected' | 'expired';
  executedPrice?: number;
  suggestedPrice?: number;
  suggestedQuantity?: number;
}

const AIDecisionLog: React.FC = () => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterModel, setFilterModel] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 模拟AI决策数据
  const decisions: AIDecision[] = [
    {
      id: '1',
      timestamp: '2026-02-03 14:30:25',
      aiName: '量化策略AI',
      modelType: 'deepseek',
      stockSymbol: 'AAPL',
      stockName: '苹果公司',
      action: 'buy',
      confidence: 0.85,
      reason: '技术面显示突破形态，基本面业绩超预期，建议买入',
      status: 'executed',
      executedPrice: 162.50,
      suggestedPrice: 163.00,
      suggestedQuantity: 50,
    },
    {
      id: '2',
      timestamp: '2026-02-03 14:25:10',
      aiName: '价值投资助手',
      modelType: 'glm-4.5',
      stockSymbol: 'MSFT',
      stockName: '微软公司',
      action: 'hold',
      confidence: 0.72,
      reason: '估值合理，等待季度财报发布后再做决策',
      status: 'pending',
      suggestedPrice: 415.75,
    },
    {
      id: '3',
      timestamp: '2026-02-03 14:20:45',
      aiName: '技术分析大师',
      modelType: 'glm-4.6',
      stockSymbol: 'TSLA',
      stockName: '特斯拉',
      action: 'sell',
      confidence: 0.68,
      reason: '技术指标显示超买，短期回调压力较大',
      status: 'rejected',
      suggestedPrice: 195.50,
      suggestedQuantity: 30,
    },
    {
      id: '4',
      timestamp: '2026-02-03 14:15:30',
      aiName: '风险控制专家',
      modelType: 'glm-4.7',
      stockSymbol: 'NVDA',
      stockName: '英伟达',
      action: 'buy',
      confidence: 0.92,
      reason: 'AI芯片需求持续增长，业绩指引强劲，强烈建议买入',
      status: 'executed',
      executedPrice: 950.25,
      suggestedPrice: 945.00,
      suggestedQuantity: 20,
    },
    {
      id: '5',
      timestamp: '2026-02-03 14:10:15',
      aiName: '量化策略AI',
      modelType: 'deepseek',
      stockSymbol: 'GOOGL',
      stockName: '谷歌',
      action: 'buy',
      confidence: 0.78,
      reason: '广告业务复苏，云计算增长强劲，估值有吸引力',
      status: 'executed',
      executedPrice: 145.25,
      suggestedPrice: 144.50,
      suggestedQuantity: 40,
    },
    {
      id: '6',
      timestamp: '2026-02-03 14:05:00',
      aiName: '价值投资助手',
      modelType: 'glm-4.5',
      stockSymbol: 'AMZN',
      stockName: '亚马逊',
      action: 'hold',
      confidence: 0.65,
      reason: '零售业务面临竞争压力，等待AWS业务数据',
      status: 'expired',
    },
  ];

  // 模型类型配置（仅支持deepseek和GLM模型）
  const modelConfig = {
    deepseek: { name: 'DeepSeek', color: 'blue', icon: '🤖' },
    'glm-4.5': { name: 'GLM-4.5', color: 'green', icon: '🧠' },
    'glm-4.6': { name: 'GLM-4.6', color: 'purple', icon: '⚡' },
    'glm-4.7': { name: 'GLM-4.7', color: 'orange', icon: '🔥' },
  };

  // 状态配置
  const statusConfig = {
    executed: { color: 'green', text: '已执行', icon: <CheckCircleOutlined /> },
    pending: { color: 'blue', text: '待处理', icon: <ClockCircleOutlined /> },
    rejected: { color: 'red', text: '已拒绝', icon: <CloseCircleOutlined /> },
    expired: { color: 'default', text: '已过期', icon: <ClockCircleOutlined /> },
  };

  // 动作配置
  const actionConfig = {
    buy: { color: 'green', text: '买入', icon: '📈' },
    sell: { color: 'red', text: '卖出', icon: '📉' },
    hold: { color: 'blue', text: '持有', icon: '⏸️' },
  };

  // 过滤决策
  const filteredDecisions = decisions.filter(decision => {
    const matchesStatus = filterStatus === 'all' || decision.status === filterStatus;
    const matchesModel = filterModel === 'all' || decision.modelType === filterModel;
    return matchesStatus && matchesModel;
  });

  // 统计信息
  const stats = {
    total: decisions.length,
    executed: decisions.filter(d => d.status === 'executed').length,
    pending: decisions.filter(d => d.status === 'pending').length,
    successRate: 78.5, // 模拟数据
  };

  return (
    <Card
      title={
        <Space>
          <RobotOutlined />
          <Text strong>AI决策记录</Text>
          <Badge count="实时" style={{ backgroundColor: '#52c41a' }} />
        </Space>
      }
      extra={
        <Space>
          <Select
            value={filterStatus}
            onChange={setFilterStatus}
            size="small"
            style={{ width: 120 }}
            suffixIcon={<FilterOutlined />}
          >
            <Option value="all">全部状态</Option>
            <Option value="executed">已执行</Option>
            <Option value="pending">待处理</Option>
            <Option value="rejected">已拒绝</Option>
            <Option value="expired">已过期</Option>
          </Select>

          <Select
            value={filterModel}
            onChange={setFilterModel}
            size="small"
            style={{ width: 120 }}
          >
            <Option value="all">全部模型</Option>
            <Option value="openai">OpenAI</Option>
            <Option value="claude">Claude</Option>
            <Option value="wenxin">文心一言</Option>
            <Option value="qwen">通义千问</Option>
          </Select>

          <Tooltip title={autoRefresh ? '停止自动刷新' : '开始自动刷新'}>
            <Button
              type="text"
              icon={autoRefresh ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              size="small"
              onClick={() => setAutoRefresh(!autoRefresh)}
            />
          </Tooltip>
        </Space>
      }
    >
      {/* 统计信息 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="总决策数"
              value={stats.total}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="已执行"
              value={stats.executed}
              valueStyle={{ fontSize: 20, color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="待处理"
              value={stats.pending}
              valueStyle={{ fontSize: 20, color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="成功率"
              value={stats.successRate}
              suffix="%"
              valueStyle={{ fontSize: 20, color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 决策时间线 */}
      <Timeline
        mode="left"
        items={filteredDecisions.map(decision => {
          const model = modelConfig[decision.modelType];
          const status = statusConfig[decision.status];
          const action = actionConfig[decision.action];

          return {
            dot: (
              <Avatar
                size="small"
                style={{
                  backgroundColor: model.color,
                  color: '#fff',
                }}
              >
                {model.icon}
              </Avatar>
            ),
            children: (
              <Card
                size="small"
                style={{
                  marginBottom: 16,
                  borderLeft: `3px solid ${model.color}`,
                }}
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {/* 头部信息 */}
                  <Row gutter={16} align="middle">
                    <Col flex="auto">
                      <Space>
                        <Text strong>{decision.aiName}</Text>
                        <Tag color={model.color}>{model.name}</Tag>
                        <Tag color={status.color} icon={status.icon}>
                          {status.text}
                        </Tag>
                      </Space>
                    </Col>
                    <Col>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {decision.timestamp}
                      </Text>
                    </Col>
                  </Row>

                  {/* 股票信息 */}
                  <Row gutter={16} align="middle">
                    <Col span={8}>
                      <Space>
                        <Text strong style={{ fontSize: 16 }}>
                          {decision.stockSymbol}
                        </Text>
                        <Text type="secondary">{decision.stockName}</Text>
                      </Space>
                    </Col>
                    <Col span={8}>
                      <Space>
                        <span style={{ fontSize: 20 }}>{action.icon}</span>
                        <Tag color={action.color}>{action.text}</Tag>
                        <Progress
                          percent={Math.round(decision.confidence * 100)}
                          size="small"
                          strokeColor={
                            decision.confidence > 0.8
                              ? '#52c41a'
                              : decision.confidence > 0.6
                              ? '#fa8c16'
                              : '#ff4d4f'
                          }
                          style={{ width: 80 }}
                        />
                      </Space>
                    </Col>
                    <Col span={8} style={{ textAlign: 'right' }}>
                      {decision.executedPrice && (
                        <Text strong>执行价: ¥{decision.executedPrice.toFixed(2)}</Text>
                      )}
                      {decision.suggestedPrice && !decision.executedPrice && (
                        <Text type="secondary">建议价: ¥{decision.suggestedPrice.toFixed(2)}</Text>
                      )}
                    </Col>
                  </Row>

                  {/* 决策理由 */}
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      决策理由：
                    </Text>
                    <Paragraph
                      ellipsis={{ rows: 2, expandable: true, symbol: '更多' }}
                      style={{ margin: 0 }}
                    >
                      {decision.reason}
                    </Paragraph>
                  </div>

                  {/* 操作按钮 */}
                  <div style={{ textAlign: 'right' }}>
                    <Space>
                      {decision.status === 'pending' && (
                        <>
                          <Button type="primary" size="small">
                            执行
                          </Button>
                          <Button danger size="small">
                            拒绝
                          </Button>
                        </>
                      )}
                      <Tooltip title="查看详细分析">
                        <Button type="text" icon={<EyeOutlined />} size="small" />
                      </Tooltip>
                      <Tooltip title="类似决策">
                        <Button type="text" icon={<ThunderboltOutlined />} size="small" />
                      </Tooltip>
                    </Space>
                  </div>
                </Space>
              </Card>
            ),
          };
        })}
      />

      {/* 空状态 */}
      {filteredDecisions.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <RobotOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
          <Title level={4} style={{ color: '#bfbfbf' }}>
            暂无AI决策记录
          </Title>
          <Text type="secondary">
            当前筛选条件下没有找到匹配的AI决策记录
          </Text>
        </div>
      )}

      {/* 底部统计 */}
      <div style={{ marginTop: 24, padding: '16px', background: '#fafafa', borderRadius: 8 }}>
        <Row gutter={16}>
          <Col span={8}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ display: 'block' }}>
                今日决策数
              </Text>
              <Title level={3} style={{ margin: '8px 0' }}>
                {decisions.length}
              </Title>
            </div>
          </Col>
          <Col span={8}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ display: 'block' }}>
                平均置信度
              </Text>
              <Title level={3} style={{ margin: '8px 0' }}>
                {((decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length) * 100).toFixed(1)}%
              </Title>
            </div>
          </Col>
          <Col span={8}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ display: 'block' }}>
                响应时间
              </Text>
              <Title level={3} style={{ margin: '8px 0' }}>
                1.2s
              </Title>
            </div>
          </Col>
        </Row>
      </div>

      {/* 操作按钮 */}
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <Space>
          <Button type="primary" icon={<ThunderboltOutlined />}>
            手动触发AI分析
          </Button>
          <Button icon={<EyeOutlined />}>
            查看历史记录
          </Button>
          <Button type="dashed">
            导出决策报告
          </Button>
        </Space>
      </div>
    </Card>
  );
};

// 添加缺失的组件
const Statistic = ({ title, value, suffix, valueStyle }: any) => (
  <div>
    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: valueStyle?.fontSize || 24, ...valueStyle }}>
      {value}
      {suffix && <span style={{ fontSize: '0.8em', marginLeft: 2 }}>{suffix}</span>}
    </div>
  </div>
);

export default AIDecisionLog;