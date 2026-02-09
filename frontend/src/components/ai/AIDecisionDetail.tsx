import React, { useState } from 'react';
import {
  Card,
  Descriptions,
  Tag,
  Progress,
  Timeline,
  Space,
  Button,
  Tooltip,
  Modal,
  Input,
  message,
  Collapse,
  Alert,
  Typography
} from 'antd';
import {
  LineChartOutlined,
  DollarOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
  CopyOutlined,
  EyeOutlined,
  CodeOutlined,
  RobotOutlined,
  SettingOutlined
} from '@ant-design/icons';

interface AIDecisionDetailProps {
  decision: {
    id: string;
    aiAccountId: number;
    aiAccountName: string;
    symbol: string;
    action: 'buy' | 'sell' | 'hold';
    quantity: number;
    price: number;
    amount: number;
    reason: string;
    confidence: number;
    modelType: string;
    riskLevel: string;
    strategy: string;
    status: 'pending' | 'executed' | 'failed' | 'cancelled';
    executedPrice?: number;
    executedAt?: string;
    createdAt: string;
    updatedAt: string;
    // 新增字段：完整提示词相关
    promptTemplate?: string;
    fullPrompt?: string;
    tokenCount?: number;
    userPreferences?: Record<string, any>;
    promptVariables?: Record<string, any>;
    modelContext?: Record<string, any>;
  };
  onClose?: () => void;
}

const { TextArea } = Input;
const { Panel } = Collapse;
const { Text } = Typography;

const AIDecisionDetail: React.FC<AIDecisionDetailProps> = ({ decision, onClose }) => {
  const [promptModalVisible, setPromptModalVisible] = useState(false);
  const [promptContent, setPromptContent] = useState(decision.fullPrompt || '');
  const getActionColor = (action: string) => {
    switch (action) {
      case 'buy': return 'green';
      case 'sell': return 'red';
      case 'hold': return 'blue';
      default: return 'default';
    }
  };

  const getActionText = (action: string) => {
    switch (action) {
      case 'buy': return '买入';
      case 'sell': return '卖出';
      case 'hold': return '持有';
      default: return action;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'executed': return 'success';
      case 'pending': return 'processing';
      case 'failed': return 'error';
      case 'cancelled': return 'default';
      default: return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'executed': return '已执行';
      case 'pending': return '待执行';
      case 'failed': return '执行失败';
      case 'cancelled': return '已取消';
      default: return status;
    }
  };

  const getModelTypeColor = (modelType: string) => {
    switch (modelType) {
      case 'deepseek': return 'blue';
      case 'glm-4.5': return 'purple';
      case 'glm-4.6': return 'cyan';
      case 'glm-4.7': return 'geekblue';
      default: return 'default';
    }
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return 'green';
      case 'medium': return 'orange';
      case 'high': return 'red';
      default: return 'default';
    }
  };

  const getConfidenceLevel = (confidence: number) => {
    if (confidence >= 80) return { color: '#52c41a', text: '高置信度' };
    if (confidence >= 60) return { color: '#faad14', text: '中等置信度' };
    return { color: '#ff4d4f', text: '低置信度' };
  };

  const confidenceLevel = getConfidenceLevel(decision.confidence);

  const handleCopyPrompt = () => {
    if (decision.fullPrompt) {
      navigator.clipboard.writeText(decision.fullPrompt);
      message.success('提示词已复制到剪贴板');
    }
  };

  const handleShowFullPrompt = () => {
    setPromptModalVisible(true);
  };

  return (
    <Card
      title={
        <Space>
          <RobotOutlined />
          <span>AI决策详情</span>
          <Tag color={getActionColor(decision.action)}>
            {getActionText(decision.action)}
          </Tag>
          <Tag color={getStatusColor(decision.status)}>
            {getStatusText(decision.status)}
          </Tag>
        </Space>
      }
      extra={
        <Space>
          {decision.fullPrompt && (
            <>
              <Button
                type="primary"
                icon={<CopyOutlined />}
                onClick={handleCopyPrompt}
                size="small"
              >
                复制提示词
              </Button>
              <Button
                icon={<EyeOutlined />}
                onClick={handleShowFullPrompt}
                size="small"
              >
                查看完整提示词
              </Button>
            </>
          )}
          {onClose && <Button type="link" onClick={onClose} size="small">关闭</Button>}
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Descriptions bordered column={2} size="small">
        <Descriptions.Item label="决策ID" span={2}>
          {decision.id}
        </Descriptions.Item>

        <Descriptions.Item label="提示词模板">
          <Tag color="blue">{decision.promptTemplate || '未指定'}</Tag>
        </Descriptions.Item>

        <Descriptions.Item label="Token数量">
          <Tag color="green">{decision.tokenCount || '未记录'}</Tag>
        </Descriptions.Item>

        <Descriptions.Item label="AI账户">
          <Space>
            <span>{decision.aiAccountName}</span>
            <Tag color={getModelTypeColor(decision.modelType)}>
              {decision.modelType}
            </Tag>
          </Space>
        </Descriptions.Item>

        <Descriptions.Item label="策略与风险">
          <Space>
            <Tag color="blue">{decision.strategy}</Tag>
            <Tag color={getRiskLevelColor(decision.riskLevel)}>
              {decision.riskLevel === 'low' ? '低风险' :
               decision.riskLevel === 'medium' ? '中风险' : '高风险'}
            </Tag>
          </Space>
        </Descriptions.Item>

        <Descriptions.Item label="股票代码">
          <strong>{decision.symbol}</strong>
        </Descriptions.Item>

        <Descriptions.Item label="决策动作">
          <Tag color={getActionColor(decision.action)}>
            {getActionText(decision.action)}
          </Tag>
        </Descriptions.Item>

        <Descriptions.Item label="数量">
          <Space>
            <DollarOutlined />
            <span>{decision.quantity.toLocaleString()} 股</span>
          </Space>
        </Descriptions.Item>

        <Descriptions.Item label="目标价格">
          <Space>
            <DollarOutlined />
            <span>¥{decision.price.toFixed(2)}</span>
          </Space>
        </Descriptions.Item>

        <Descriptions.Item label="预计金额">
          <Space>
            <DollarOutlined />
            <span>¥{decision.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </Space>
        </Descriptions.Item>

        {decision.executedPrice && (
          <Descriptions.Item label="执行价格">
            <Space>
              <DollarOutlined />
              <span>¥{decision.executedPrice.toFixed(2)}</span>
              {decision.executedPrice !== decision.price && (
                <Tag color={decision.executedPrice > decision.price ? 'red' : 'green'}>
                  {decision.executedPrice > decision.price ? '高于目标' : '低于目标'}
                </Tag>
              )}
            </Space>
          </Descriptions.Item>
        )}

        <Descriptions.Item label="置信度" span={2}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Progress
              percent={decision.confidence}
              strokeColor={confidenceLevel.color}
              format={percent => `${percent}%`}
              size="small"
            />
            <span style={{ color: confidenceLevel.color, fontSize: 12 }}>
              {confidenceLevel.text}
            </span>
          </Space>
        </Descriptions.Item>

        <Descriptions.Item label="决策理由" span={2}>
          <div style={{
            padding: 12,
            background: '#f6ffed',
            borderRadius: 4,
            border: '1px solid #b7eb8f'
          }}>
            {decision.reason}
          </div>
        </Descriptions.Item>

        <Descriptions.Item label="创建时间">
          <Space>
            <ClockCircleOutlined />
            <span>{new Date(decision.createdAt).toLocaleString()}</span>
          </Space>
        </Descriptions.Item>

        <Descriptions.Item label="更新时间">
          <Space>
            <ClockCircleOutlined />
            <span>{new Date(decision.updatedAt).toLocaleString()}</span>
          </Space>
        </Descriptions.Item>

        {decision.executedAt && (
          <Descriptions.Item label="执行时间">
            <Space>
              <CheckCircleOutlined />
              <span>{new Date(decision.executedAt).toLocaleString()}</span>
            </Space>
          </Descriptions.Item>
        )}
      </Descriptions>

      {/* 决策时间线 */}
      <div style={{ marginTop: 24 }}>
        <h4 style={{ marginBottom: 16 }}>
          <BarChartOutlined /> 决策时间线
        </h4>
        <Timeline>
          <Timeline.Item color="blue">
            <p>决策生成</p>
            <p style={{ fontSize: 12, color: '#666' }}>
              {new Date(decision.createdAt).toLocaleString()}
            </p>
            <p style={{ fontSize: 12, color: '#666' }}>
              AI模型分析完成，生成交易决策
            </p>
          </Timeline.Item>

          {decision.status === 'executed' && decision.executedAt && (
            <Timeline.Item color="green">
              <p>交易执行</p>
              <p style={{ fontSize: 12, color: '#666' }}>
                {new Date(decision.executedAt).toLocaleString()}
              </p>
              <p style={{ fontSize: 12, color: '#666' }}>
                交易订单执行完成，执行价格：¥{decision.executedPrice?.toFixed(2)}
              </p>
            </Timeline.Item>
          )}

          {decision.status === 'failed' && (
            <Timeline.Item color="red">
              <p>执行失败</p>
              <p style={{ fontSize: 12, color: '#666' }}>
                {new Date(decision.updatedAt).toLocaleString()}
              </p>
              <p style={{ fontSize: 12, color: '#666' }}>
                交易执行失败，可能原因：价格变动、资金不足、系统错误
              </p>
            </Timeline.Item>
          )}

          {decision.status === 'cancelled' && (
            <Timeline.Item color="gray">
              <p>决策取消</p>
              <p style={{ fontSize: 12, color: '#666' }}>
                {new Date(decision.updatedAt).toLocaleString()}
              </p>
              <p style={{ fontSize: 12, color: '#666' }}>
                决策被取消，可能原因：用户手动取消、风险控制触发
              </p>
            </Timeline.Item>
          )}

          <Timeline.Item color={decision.status === 'executed' ? 'green' : 'blue'}>
            <p>当前状态</p>
            <p style={{ fontSize: 12, color: '#666' }}>
              {getStatusText(decision.status)}
            </p>
          </Timeline.Item>
        </Timeline>
      </div>

      {/* 性能指标 */}
      <div style={{ marginTop: 24 }}>
        <h4 style={{ marginBottom: 16 }}>
          <InfoCircleOutlined /> 性能指标
        </h4>
        <Space size="large">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: confidenceLevel.color }}>
              {decision.confidence}%
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>置信度</div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>
              {decision.action === 'buy' ? '+' : '-'}{decision.quantity.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>交易数量</div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>
              ¥{decision.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>交易金额</div>
          </div>

          {decision.executedPrice && decision.executedPrice !== decision.price && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: decision.executedPrice > decision.price ? '#ff4d4f' : '#52c41a'
              }}>
                {decision.executedPrice > decision.price ? '+' : ''}
                {((decision.executedPrice - decision.price) / decision.price * 100).toFixed(2)}%
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>价格偏差</div>
            </div>
          )}
        </Space>
      </div>

      {/* 完整提示词展示 */}
      {(decision.fullPrompt || decision.promptTemplate) && (
        <div style={{ marginTop: 24 }}>
          <h4 style={{ marginBottom: 16 }}>
            <CodeOutlined /> AI决策提示词详情
          </h4>
          <Collapse defaultActiveKey={['1', '2', '3', '4']}>
            <Panel header="提示词信息概览" key="1">
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="提示词模板">
                  <Tag color="blue">{decision.promptTemplate || '未指定'}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Token数量">
                  <Tag color="green">{decision.tokenCount || '未记录'}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="字符数" span={2}>
                  <Text>{decision.fullPrompt?.length || 0} 字符</Text>
                </Descriptions.Item>
              </Descriptions>
            </Panel>

            {decision.promptVariables && Object.keys(decision.promptVariables).length > 0 && (
              <Panel header="提示词变量" key="2">
                <Card size="small">
                  <pre style={{ margin: 0, fontSize: 12 }}>
                    {JSON.stringify(decision.promptVariables, null, 2)}
                  </pre>
                </Card>
              </Panel>
            )}

            {decision.userPreferences && Object.keys(decision.userPreferences).length > 0 && (
              <Panel header="用户偏好配置" key="3">
                <Card size="small">
                  <pre style={{ margin: 0, fontSize: 12 }}>
                    {JSON.stringify(decision.userPreferences, null, 2)}
                  </pre>
                </Card>
              </Panel>
            )}

            {decision.modelContext && Object.keys(decision.modelContext).length > 0 && (
              <Panel header="模型上下文" key="4">
                <Card size="small">
                  <pre style={{ margin: 0, fontSize: 12 }}>
                    {JSON.stringify(decision.modelContext, null, 2)}
                  </pre>
                </Card>
              </Panel>
            )}

            {decision.fullPrompt && (
              <Panel header="完整提示词预览" key="5">
                <Card size="small">
                  <div style={{
                    padding: 12,
                    background: '#f0f5ff',
                    borderRadius: 4,
                    border: '1px solid #adc6ff',
                    maxHeight: 300,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    fontSize: 12
                  }}>
                    {decision.fullPrompt}
                  </div>
                  <div style={{ marginTop: 16, textAlign: 'right' }}>
                    <Space>
                      <Button
                        type="primary"
                        icon={<CopyOutlined />}
                        onClick={handleCopyPrompt}
                        size="small"
                      >
                        复制提示词
                      </Button>
                      <Button
                        icon={<EyeOutlined />}
                        onClick={handleShowFullPrompt}
                        size="small"
                      >
                        查看完整提示词
                      </Button>
                    </Space>
                  </div>
                </Card>
              </Panel>
            )}
          </Collapse>
        </div>
      )}

      {/* 操作按钮 */}
      <div style={{ marginTop: 24, textAlign: 'right' }}>
        <Space>
          <Tooltip title="查看该AI账户的其他决策">
            <Button icon={<LineChartOutlined />}>
              查看AI账户
            </Button>
          </Tooltip>

          <Tooltip title="查看该股票的其他交易">
            <Button icon={<BarChartOutlined />}>
              查看股票详情
            </Button>
          </Tooltip>

          {decision.status === 'pending' && (
            <Tooltip title="取消待执行的决策">
              <Button danger icon={<CloseCircleOutlined />}>
                取消决策
              </Button>
            </Tooltip>
          )}

          {decision.status === 'executed' && (
            <Tooltip title="查看交易执行详情">
              <Button type="primary" icon={<CheckCircleOutlined />}>
                查看交易详情
              </Button>
            </Tooltip>
          )}
        </Space>
      </div>

      {/* 完整提示词模态框 */}
      <Modal
        title="完整提示词"
        open={promptModalVisible}
        onCancel={() => setPromptModalVisible(false)}
        width={800}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyPrompt}>
            复制
          </Button>,
          <Button key="close" onClick={() => setPromptModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        <Card>
          <TextArea
            value={promptContent}
            readOnly
            autoSize={{ minRows: 20, maxRows: 30 }}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Text type="secondary">
              字符数: {promptContent.length} | 预估Token数: {decision.tokenCount || '未知'}
            </Text>
          </div>
        </Card>
      </Modal>
    </Card>
  );
};

export default AIDecisionDetail;