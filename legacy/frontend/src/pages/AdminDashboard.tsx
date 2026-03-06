import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Progress,
  Alert,
  Button,
  Space,
  Tabs,
  Timeline,
  Descriptions,
  Badge,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  message
} from 'antd';
import {
  DashboardOutlined,
  LineChartOutlined,
  WarningOutlined,
  UserOutlined,
  DatabaseOutlined,
  ApiOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import { useAuthStore } from '../store/auth.store';
import './AdminDashboard.css';

const { TabPane } = Tabs;
const { Option } = Select;

interface SystemMetric {
  key: string;
  name: string;
  value: number;
  unit: string;
  status: 'healthy' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable';
}

interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'degraded';
  uptime: string;
  responseTime: number;
  lastCheck: string;
}

interface AlertItem {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  timestamp: string;
  acknowledged: boolean;
}

interface UserActivity {
  id: string;
  username: string;
  action: string;
  ip: string;
  timestamp: string;
  status: 'success' | 'failed';
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetric[]>([]);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [userActivities, setUserActivities] = useState<UserActivity[]>([]);
  const [isAlertModalVisible, setIsAlertModalVisible] = useState(false);
  const [alertForm] = Form.useForm();

  // 检查管理员权限
  useEffect(() => {
    if (!isAuthenticated) {
      message.warning('请先登录');
      navigate('/login');
      return;
    }

    if (user?.role !== 'admin') {
      message.error('需要管理员权限');
      navigate('/dashboard');
      return;
    }

    // 加载监控数据
    loadMonitoringData();
  }, [isAuthenticated, user, navigate]);

  const loadMonitoringData = async () => {
    setLoading(true);
    try {
      // 模拟数据 - 实际应该从API获取
      const mockMetrics: SystemMetric[] = [
        { key: 'cpu', name: 'CPU使用率', value: 45, unit: '%', status: 'healthy', trend: 'stable' },
        { key: 'memory', name: '内存使用率', value: 68, unit: '%', status: 'warning', trend: 'up' },
        { key: 'disk', name: '磁盘使用率', value: 32, unit: '%', status: 'healthy', trend: 'stable' },
        { key: 'api_response', name: 'API响应时间', value: 125, unit: 'ms', status: 'healthy', trend: 'down' },
        { key: 'cache_hit', name: '缓存命中率', value: 87, unit: '%', status: 'healthy', trend: 'up' },
        { key: 'db_connections', name: '数据库连接数', value: 24, unit: '个', status: 'healthy', trend: 'stable' },
      ];

      const mockServices: ServiceStatus[] = [
        { name: '后端API服务', status: 'running', uptime: '5天12小时', responseTime: 45, lastCheck: '2026-02-06 15:30:00' },
        { name: 'AI服务', status: 'running', uptime: '5天10小时', responseTime: 120, lastCheck: '2026-02-06 15:30:00' },
        { name: '数据服务', status: 'running', uptime: '5天11小时', responseTime: 85, lastCheck: '2026-02-06 15:30:00' },
        { name: '前端服务', status: 'running', uptime: '5天12小时', responseTime: 25, lastCheck: '2026-02-06 15:30:00' },
        { name: 'PostgreSQL', status: 'running', uptime: '5天12小时', responseTime: 15, lastCheck: '2026-02-06 15:30:00' },
        { name: 'Redis', status: 'running', uptime: '5天12小时', responseTime: 5, lastCheck: '2026-02-06 15:30:00' },
      ];

      const mockAlerts: AlertItem[] = [
        { id: '1', level: 'warning', title: '内存使用率过高', description: '内存使用率超过65%，建议优化', timestamp: '2026-02-06 15:25:00', acknowledged: false },
        { id: '2', level: 'info', title: '数据库备份完成', description: '每日数据库备份已完成', timestamp: '2026-02-06 03:00:00', acknowledged: true },
        { id: '3', level: 'error', title: 'AI服务响应超时', description: 'AI服务响应时间超过200ms', timestamp: '2026-02-06 14:45:00', acknowledged: false },
      ];

      const mockActivities: UserActivity[] = [
        { id: '1', username: 'admin', action: '登录系统', ip: '192.168.1.100', timestamp: '2026-02-06 15:30:00', status: 'success' },
        { id: '2', username: 'user1', action: '创建AI账户', ip: '192.168.1.101', timestamp: '2026-02-06 15:25:00', status: 'success' },
        { id: '3', username: 'user2', action: '执行交易', ip: '192.168.1.102', timestamp: '2026-02-06 15:20:00', status: 'failed' },
        { id: '4', username: 'user3', action: '查看持仓', ip: '192.168.1.103', timestamp: '2026-02-06 15:15:00', status: 'success' },
      ];

      setSystemMetrics(mockMetrics);
      setServiceStatus(mockServices);
      setAlerts(mockAlerts);
      setUserActivities(mockActivities);

      // 实际API调用应该在这里
      // const metricsResponse = await fetch('/api/admin/metrics');
      // const servicesResponse = await fetch('/api/admin/services');
      // const alertsResponse = await fetch('/api/admin/alerts');
      // const activitiesResponse = await fetch('/api/admin/activities');

    } catch (error) {
      message.error('加载监控数据失败');
      console.error('加载监控数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'green';
      case 'warning': return 'orange';
      case 'critical': return 'red';
      case 'running': return 'green';
      case 'stopped': return 'red';
      case 'degraded': return 'orange';
      default: return 'default';
    }
  };

  const getAlertLevelColor = (level: string) => {
    switch (level) {
      case 'info': return 'blue';
      case 'warning': return 'orange';
      case 'error': return 'red';
      case 'critical': return 'purple';
      default: return 'default';
    }
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts(alerts.map(alert =>
      alert.id === alertId ? { ...alert, acknowledged: true } : alert
    ));
    message.success('告警已确认');
  };

  const handleCreateAlert = (values: any) => {
    console.log('创建告警:', values);
    setIsAlertModalVisible(false);
    alertForm.resetFields();
    message.success('告警规则已创建');
  };

  const handleRefresh = () => {
    loadMonitoringData();
    message.success('数据已刷新');
  };

  const handleExportLogs = () => {
    message.info('日志导出功能开发中');
  };

  const handleSystemRestart = (serviceName: string) => {
    Modal.confirm({
      title: '确认重启服务',
      content: `确定要重启 ${serviceName} 吗？`,
      onOk: () => {
        message.success(`${serviceName} 重启指令已发送`);
      },
    });
  };

  const columns = [
    {
      title: '指标名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '当前值',
      dataIndex: 'value',
      key: 'value',
      render: (value: number, record: SystemMetric) => (
        <Statistic value={value} suffix={record.unit} />
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>
          {status === 'healthy' ? '健康' : status === 'warning' ? '警告' : '严重'}
        </Tag>
      ),
    },
    {
      title: '趋势',
      dataIndex: 'trend',
      key: 'trend',
      render: (trend: string) => (
        <Tag color={trend === 'up' ? 'red' : trend === 'down' ? 'green' : 'blue'}>
          {trend === 'up' ? '上升' : trend === 'down' ? '下降' : '稳定'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: SystemMetric) => (
        <Button size="small" onClick={() => console.log('查看详情:', record.key)}>
          详情
        </Button>
      ),
    },
  ];

  const serviceColumns = [
    {
      title: '服务名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Badge status={status === 'running' ? 'success' : status === 'stopped' ? 'error' : 'warning'} text={
          status === 'running' ? '运行中' : status === 'stopped' ? '已停止' : '降级'
        } />
      ),
    },
    {
      title: '运行时间',
      dataIndex: 'uptime',
      key: 'uptime',
    },
    {
      title: '响应时间',
      dataIndex: 'responseTime',
      key: 'responseTime',
      render: (time: number) => `${time}ms`,
    },
    {
      title: '最后检查',
      dataIndex: 'lastCheck',
      key: 'lastCheck',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: ServiceStatus) => (
        <Space>
          <Button size="small" onClick={() => handleSystemRestart(record.name)}>
            重启
          </Button>
          <Button size="small" onClick={() => console.log('查看日志:', record.name)}>
            日志
          </Button>
        </Space>
      ),
    },
  ];

  const alertColumns = [
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      render: (level: string) => (
        <Tag color={getAlertLevelColor(level)}>
          {level === 'info' ? '信息' : level === 'warning' ? '警告' : level === 'error' ? '错误' : '严重'}
        </Tag>
      ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
    },
    {
      title: '状态',
      dataIndex: 'acknowledged',
      key: 'acknowledged',
      render: (acknowledged: boolean) => (
        <Tag color={acknowledged ? 'green' : 'red'}>
          {acknowledged ? '已确认' : '未确认'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: AlertItem) => (
        <Button
          size="small"
          disabled={record.acknowledged}
          onClick={() => handleAcknowledgeAlert(record.id)}
        >
          确认
        </Button>
      ),
    },
  ];

  const activityColumns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
    },
    {
      title: 'IP地址',
      dataIndex: 'ip',
      key: 'ip',
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'success' ? 'green' : 'red'} icon={status === 'success' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
          {status === 'success' ? '成功' : '失败'}
        </Tag>
      ),
    },
  ];

  if (!isAuthenticated || user?.role !== 'admin') {
    return null;
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1><DashboardOutlined /> 管理员监控面板</h1>
        <Space>
          <Button icon={<ClockCircleOutlined />} onClick={handleRefresh}>
            刷新数据
          </Button>
          <Button icon={<WarningOutlined />} type="primary" onClick={() => setIsAlertModalVisible(true)}>
            创建告警
          </Button>
          <Button icon={<DatabaseOutlined />} onClick={handleExportLogs}>
            导出日志
          </Button>
        </Space>
      </div>

      <Alert
        message="管理员专属监控面板"
        description="此面板仅对管理员用户开放，包含系统性能监控、服务状态、告警管理和用户活动日志。"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="活跃用户"
              value={42}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="今日交易数"
              value={156}
              prefix={<LineChartOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="系统负载"
              value={45}
              suffix="%"
              prefix={<DashboardOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="未处理告警"
              value={alerts.filter(a => !a.acknowledged).length}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      <Tabs defaultActiveKey="1">
        <TabPane tab="系统指标" key="1">
          <Card title="系统性能指标" loading={loading}>
            <Table
              columns={columns}
              dataSource={systemMetrics}
              pagination={false}
              size="small"
            />
          </Card>
        </TabPane>

        <TabPane tab="服务状态" key="2">
          <Card title="服务运行状态" loading={loading}>
            <Table
              columns={serviceColumns}
              dataSource={serviceStatus}
              pagination={false}
              size="small"
            />
          </Card>
        </TabPane>

        <TabPane tab="告警管理" key="3">
          <Card title="系统告警" loading={loading} extra={
            <Button type="link" onClick={() => setIsAlertModalVisible(true)}>
              新建告警规则
            </Button>
          }>
            <Table
              columns={alertColumns}
              dataSource={alerts}
              pagination={false}
              size="small"
            />
          </Card>
        </TabPane>

        <TabPane tab="用户活动" key="4">
          <Card title="用户活动日志" loading={loading}>
            <Table
              columns={activityColumns}
              dataSource={userActivities}
              pagination={{ pageSize: 10 }}
              size="small"
            />
          </Card>
        </TabPane>

        <TabPane tab="系统信息" key="5">
          <Card title="系统配置信息" loading={loading}>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="系统版本">v1.1.0</Descriptions.Item>
              <Descriptions.Item label="运行环境">生产环境</Descriptions.Item>
              <Descriptions.Item label="启动时间">2026-02-06 10:30:00</Descriptions.Item>
              <Descriptions.Item label="运行时间">5天12小时</Descriptions.Item>
              <Descriptions.Item label="数据库">PostgreSQL 15 + TimescaleDB</Descriptions.Item>
              <Descriptions.Item label="缓存">Redis 7</Descriptions.Item>
              <Descriptions.Item label="AI模型">DeepSeek, GLM 4.5/4.6/4.7</Descriptions.Item>
              <Descriptions.Item label="数据源">新浪财经、腾讯财经、东方财富</Descriptions.Item>
            </Descriptions>
          </Card>
        </TabPane>
      </Tabs>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} md={12}>
          <Card title="实时时间线" loading={loading}>
            <Timeline>
              <Timeline.Item color="green">系统启动完成 (10:30)</Timeline.Item>
              <Timeline.Item color="green">数据库连接正常 (10:31)</Timeline.Item>
              <Timeline.Item color="green">AI服务启动完成 (10:32)</Timeline.Item>
              <Timeline.Item color="green">数据服务启动完成 (10:33)</Timeline.Item>
              <Timeline.Item color="blue">用户登录高峰 (14:30)</Timeline.Item>
              <Timeline.Item color="orange">内存使用率警告 (15:25)</Timeline.Item>
              <Timeline.Item color="red">AI服务响应超时 (15:45)</Timeline.Item>
              <Timeline.Item color="gray">当前时间 (16:00)</Timeline.Item>
            </Timeline>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="性能趋势" loading={loading}>
            <div style={{ padding: '20px 0' }}>
              <div style={{ marginBottom: 16 }}>
                <span>CPU使用率</span>
                <Progress percent={45} status="active" />
              </div>
              <div style={{ marginBottom: 16 }}>
                <span>内存使用率</span>
                <Progress percent={68} status="exception" />
              </div>
              <div style={{ marginBottom: 16 }}>
                <span>磁盘使用率</span>
                <Progress percent={32} status="success" />
              </div>
              <div>
                <span>API响应时间</span>
                <Progress percent={75} status="active" />
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Modal
        title="创建告警规则"
        open={isAlertModalVisible}
        onCancel={() => setIsAlertModalVisible(false)}
        onOk={() => alertForm.submit()}
        width={600}
      >
        <Form
          form={alertForm}
          layout="vertical"
          onFinish={handleCreateAlert}
        >
          <Form.Item
            name="name"
            label="告警名称"
            rules={[{ required: true, message: '请输入告警名称' }]}
          >
            <Input placeholder="例如：CPU使用率过高告警" />
          </Form.Item>

          <Form.Item
            name="metric"
            label="监控指标"
            rules={[{ required: true, message: '请选择监控指标' }]}
          >
            <Select placeholder="选择监控指标">
              <Option value="cpu">CPU使用率</Option>
              <Option value="memory">内存使用率</Option>
              <Option value="disk">磁盘使用率</Option>
              <Option value="api_response">API响应时间</Option>
              <Option value="cache_hit">缓存命中率</Option>
              <Option value="db_connections">数据库连接数</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="condition"
            label="告警条件"
            rules={[{ required: true, message: '请选择告警条件' }]}
          >
            <Select placeholder="选择告警条件">
              <Option value="gt">大于</Option>
              <Option value="lt">小于</Option>
              <Option value="eq">等于</Option>
              <Option value="neq">不等于</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="threshold"
            label="阈值"
            rules={[{ required: true, message: '请输入阈值' }]}
          >
            <Input type="number" placeholder="例如：80" />
          </Form.Item>

          <Form.Item
            name="level"
            label="告警级别"
            rules={[{ required: true, message: '请选择告警级别' }]}
          >
            <Select placeholder="选择告警级别">
              <Option value="info">信息</Option>
              <Option value="warning">警告</Option>
              <Option value="error">错误</Option>
              <Option value="critical">严重</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="notification"
            label="通知方式"
            valuePropName="checked"
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" defaultChecked />
          </Form.Item>

          <Form.Item
            name="description"
            label="告警描述"
          >
            <Input.TextArea rows={3} placeholder="请输入告警描述" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminDashboard;