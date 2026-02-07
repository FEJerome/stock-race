import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Typography,
  Space,
  Tag,
  Avatar,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Tooltip,
  Row,
  Col,
  Statistic,
  Progress,
  Alert,
  Divider,
  Grid,
  InputNumber,
  message,
} from 'antd';
import {
  RobotOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  EyeOutlined,
  KeyOutlined,
  ApiOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;

// AI服务导入
import { aiService } from '../services/ai.service';

// 模型类型配置（仅支持deepseek和GLM模型）
const modelTypes = {
  deepseek: { name: 'DeepSeek', color: 'blue', icon: '🤖' },
  'glm-4.5': { name: 'GLM-4.5', color: 'green', icon: '🧠' },
  'glm-4.6': { name: 'GLM-4.6', color: 'purple', icon: '⚡' },
  'glm-4.7': { name: 'GLM-4.7', color: 'orange', icon: '🔥' },
};

const AIAccounts: React.FC = () => {
  const [aiAccounts, setAiAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const screens = useBreakpoint();

  // 加载AI账户数据
  useEffect(() => {
    loadAIAccounts();
  }, []);

  const loadAIAccounts = async () => {
    setLoading(true);
    try {
      const accounts = await aiService.getAIAccounts();
      // 转换数据格式以适应组件
      const formattedAccounts = accounts.map(account => ({
        id: account.id,
        name: account.name,
        modelType: account.modelType,
        status: account.isActive ? 'active' : 'inactive',
        apiKey: 'sk-...' + (account.id || '').slice(-4), // 模拟部分API密钥
        isActive: account.isActive,
        performance: Math.floor(Math.random() * 40) + 60, // 临时模拟性能数据
        decisionsToday: Math.floor(Math.random() * 30), // 临时模拟今日决策数
        successRate: 60 + Math.random() * 35, // 临时模拟成功率
        createdAt: account.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0],
      }));
      setAiAccounts(formattedAccounts);
    } catch (error) {
      console.error('加载AI账户失败:', error);
      message.error('加载AI账户失败，使用模拟数据');
      // 降级时使用模拟数据
      const fallbackAccounts = [
        {
          id: '1',
          name: '量化策略AI',
          modelType: 'deepseek',
          status: 'active',
          apiKey: 'sk-...1234',
          isActive: true,
          performance: 85,
          decisionsToday: 24,
          successRate: 78.5,
          createdAt: '2026-01-15',
        },
        {
          id: '2',
          name: '价值投资助手',
          modelType: 'glm-4.5',
          status: 'active',
          apiKey: 'sk-...5678',
          isActive: true,
          performance: 72,
          decisionsToday: 18,
          successRate: 65.2,
          createdAt: '2026-01-20',
        },
        {
          id: '3',
          name: '技术分析大师',
          modelType: 'glm-4.6',
          status: 'inactive',
          apiKey: 'sk-...9012',
          isActive: false,
          performance: 68,
          decisionsToday: 0,
          successRate: 71.8,
          createdAt: '2026-01-25',
        },
        {
          id: '4',
          name: '风险控制专家',
          modelType: 'glm-4.7',
          status: 'error',
          apiKey: 'sk-...3456',
          isActive: false,
          performance: 45,
          decisionsToday: 5,
          successRate: 52.3,
          createdAt: '2026-02-01',
        },
      ];
      setAiAccounts(fallbackAccounts);
    } finally {
      setLoading(false);
    }
  };

  // 处理添加/编辑AI账户
  const handleSubmit = async (values: any) => {
    try {
      if (editingAccount) {
        // 更新现有账户
        await aiService.updateAIAccount(editingAccount.id, values);
        message.success(`AI账户 ${values.name} 更新成功`);
      } else {
        // 添加新账户
        await aiService.createAIAccount(values);
        message.success(`AI账户 ${values.name} 创建成功`);
      }
      setModalVisible(false);
      form.resetFields();
      setEditingAccount(null);
      // 刷新AI账户列表
      loadAIAccounts();
    } catch (error) {
      console.error('保存AI账户失败:', error);
      message.error('保存AI账户失败，请重试');
    }
  };

  // 处理删除AI账户
  const handleDelete = (account: any) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除AI账户 "${account.name}" 吗？此操作不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await aiService.deleteAIAccount(account.id);
          message.success(`AI账户 ${account.name} 删除成功`);
          // 刷新AI账户列表
          loadAIAccounts();
        } catch (error) {
          console.error('删除AI账户失败:', error);
          message.error('删除AI账户失败，请重试');
        }
      },
    });
  };

  // 处理激活/停用AI账户
  const handleToggleActive = (account: any) => {
    const action = account.isActive ? '停用' : '激活';
    Modal.confirm({
      title: `确认${action}`,
      content: `确定要${action}AI账户 "${account.name}" 吗？`,
      onOk: () => {
        alert(`${action}AI账户: ${account.name}`);
      },
    });
  };

  // AI账户表格列定义
  const accountColumns = [
    {
      title: 'AI账户',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: any) => (
        <Space>
          <Avatar
            style={{
              backgroundColor: modelTypes[record.modelType as keyof typeof modelTypes]?.color || '#999',
              color: '#fff',
            }}
          >
            {modelTypes[record.modelType as keyof typeof modelTypes]?.icon || '🤖'}
          </Avatar>
          <div>
            <Text strong>{name}</Text>
            <div>
              <Tag color={modelTypes[record.modelType as keyof typeof modelTypes]?.color || 'default'}>
                {modelTypes[record.modelType as keyof typeof modelTypes]?.name || record.modelType}
              </Tag>
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: any) => {
        const statusConfig: Record<string, { color: string; text: string }> = {
          active: { color: 'green', text: '运行中' },
          inactive: { color: 'default', text: '已停用' },
          error: { color: 'red', text: '错误' },
        };
        const config = statusConfig[status] || { color: 'default', text: status };
        return (
          <Space>
            <Tag color={config.color}>{config.text}</Tag>
            <Switch
              size="small"
              checked={record.isActive}
              onChange={() => handleToggleActive(record)}
            />
          </Space>
        );
      },
    },
    {
      title: '性能评分',
      dataIndex: 'performance',
      key: 'performance',
      render: (performance: number) => (
        <Space>
          <Progress
            percent={performance}
            size="small"
            strokeColor={
              performance >= 80 ? '#52c41a' :
              performance >= 60 ? '#fa8c16' : '#ff4d4f'
            }
            style={{ width: 80 }}
          />
          <Text strong>{performance}分</Text>
        </Space>
      ),
    },
    {
      title: '今日决策',
      dataIndex: 'decisionsToday',
      key: 'decisionsToday',
      render: (count: number) => (
        <Text strong>{count} 次</Text>
      ),
    },
    {
      title: '成功率',
      dataIndex: 'successRate',
      key: 'successRate',
      render: (rate: number) => (
        <Text type={rate >= 70 ? 'success' : rate >= 50 ? 'warning' : 'danger'} strong>
          {rate.toFixed(1)}%
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="text"
              icon={<EyeOutlined />}
              size="small"
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              size="small"
              onClick={() => {
                setEditingAccount(record);
                form.setFieldsValue(record);
                setModalVisible(true);
              }}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              type="text"
              icon={<DeleteOutlined />}
              size="small"
              danger
              onClick={() => handleDelete(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: '100%' }}>
      {/* 页面标题 */}
      <Space direction="vertical" size="middle" style={{ width: '100%', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>
          <RobotOutlined /> AI账户管理
        </Title>
        <Text type="secondary">
          管理您的AI交易助手，配置模型参数和监控性能。
        </Text>
      </Space>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="活跃AI账户"
              value={aiAccounts.filter(a => a.isActive).length}
              suffix={`/ ${aiAccounts.length}`}
              valueStyle={{ color: '#52c41a' }}
              prefix={<PlayCircleOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日总决策"
              value={aiAccounts.reduce((sum, a) => sum + a.decisionsToday, 0)}
              valueStyle={{ color: '#1890ff' }}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="平均成功率"
              value={(
                aiAccounts.reduce((sum, a) => sum + a.successRate, 0) / aiAccounts.length
              ).toFixed(1)}
              suffix="%"
              valueStyle={{ color: '#722ed1' }}
              prefix={<SafetyCertificateOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="平均性能"
              value={(
                aiAccounts.reduce((sum, a) => sum + a.performance, 0) / aiAccounts.length
              ).toFixed(0)}
              suffix="分"
              valueStyle={{ color: '#fa8c16' }}
              prefix={<RobotOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* 左侧：AI账户列表 */}
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <RobotOutlined />
                <Text strong>AI账户列表</Text>
              </Space>
            }
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingAccount(null);
                  form.resetFields();
                  setModalVisible(true);
                }}
              >
                添加AI账户
              </Button>
            }
          >
            <Table
              dataSource={aiAccounts}
              columns={accountColumns}
              rowKey="id"
              pagination={false}
              scroll={{ x: true }}
              loading={loading}
            />
          </Card>
        </Col>

        {/* 右侧：AI配置和提示 */}
        <Col xs={24} lg={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* AI配置指南 */}
            <Card
              title={
                <Space>
                  <KeyOutlined />
                  <Text strong>API配置指南</Text>
                </Space>
              }
              size="small"
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert
                  message="DeepSeek配置"
                  description="前往 DeepSeek Platform 获取API密钥"
                  type="info"
                  showIcon
                />
                <Alert
                  message="GLM-4.5配置"
                  description="前往智谱AI开放平台获取API密钥"
                  type="info"
                  showIcon
                />
                <Alert
                  message="GLM-4.6配置"
                  description="前往智谱AI开放平台获取API密钥"
                  type="info"
                  showIcon
                />
                <Alert
                  message="GLM-4.7配置"
                  description="前往智谱AI开放平台获取API密钥"
                  type="info"
                  showIcon
                />
                <Button type="dashed" block icon={<ApiOutlined />}>
                  查看完整配置文档
                </Button>
              </Space>
            </Card>

            {/* 使用提示 */}
            <Card
              title={
                <Space>
                  <SafetyCertificateOutlined />
                  <Text strong>使用提示</Text>
                </Space>
              }
              size="small"
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Text type="secondary">• 每个AI账户需要独立的API密钥</Text>
                <Text type="secondary">• 建议定期轮换API密钥以提高安全性</Text>
                <Text type="secondary">• 监控AI决策成功率，及时调整策略</Text>
                <Text type="secondary">• 不同模型适合不同的交易风格</Text>
                <Text type="secondary">• 设置合理的交易频率限制</Text>
              </Space>
            </Card>

            {/* 快速操作 */}
            <Card size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text strong>快速操作</Text>
                <Row gutter={[8, 8]}>
                  <Col span={12}>
                    <Button type="primary" block icon={<PlayCircleOutlined />}>
                      启动所有
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button block icon={<PauseCircleOutlined />}>
                      暂停所有
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button block icon={<EyeOutlined />}>
                      性能监控
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button block icon={<KeyOutlined />}>
                      API管理
                    </Button>
                  </Col>
                </Row>
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>

      {/* 添加/编辑AI账户模态框 */}
      <Modal
        title={editingAccount ? '编辑AI账户' : '添加AI账户'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditingAccount(null);
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            modelType: 'deepseek',
            isActive: true,
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="账户名称"
                rules={[{ required: true, message: '请输入账户名称' }]}
              >
                <Input placeholder="例如：量化策略AI" />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="modelType"
                label="AI模型"
                rules={[{ required: true, message: '请选择AI模型' }]}
              >
                <Select placeholder="选择AI模型">
                  <Option value="deepseek">DeepSeek</Option>
                  <Option value="glm-4.5">GLM-4.5</Option>
                  <Option value="glm-4.6">GLM-4.6</Option>
                  <Option value="glm-4.7">GLM-4.7</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="apiKey"
            label="API密钥"
            rules={[{ required: true, message: '请输入API密钥' }]}
          >
            <Input.Password
              placeholder="输入API密钥"
              addonBefore={<KeyOutlined />}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="maxDecisionsPerDay"
                label="每日最大决策数"
                initialValue={50}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={1}
                  max={1000}
                  placeholder="例如：50"
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="riskLevel"
                label="风险等级"
                initialValue="medium"
              >
                <Select>
                  <Option value="low">低风险</Option>
                  <Option value="medium">中风险</Option>
                  <Option value="high">高风险</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="description"
            label="描述"
          >
            <Input.TextArea
              placeholder="描述这个AI账户的交易策略和特点"
              rows={3}
            />
          </Form.Item>

          <Form.Item
            name="isActive"
            label="状态"
            valuePropName="checked"
          >
            <Switch
              checkedChildren="启用"
              unCheckedChildren="停用"
            />
          </Form.Item>

          <Divider />

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button
                onClick={() => {
                  setModalVisible(false);
                  form.resetFields();
                  setEditingAccount(null);
                }}
              >
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                {editingAccount ? '更新' : '添加'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};


export default AIAccounts;