import React, { useState } from 'react';
import {
  Card,
  Typography,
  Space,
  Form,
  Input,
  Button,
  Switch,
  Select,
  Upload,
  Avatar,
  Row,
  Col,
  Divider,
  Tabs,
  Alert,
  InputNumber,
  Radio,
  Grid,
} from 'antd';
import {
  SettingOutlined,
  UserOutlined,
  SafetyOutlined,
  BellOutlined,
  GlobalOutlined,
  CloudOutlined,
  SaveOutlined,
  UploadOutlined,
  KeyOutlined,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;
const { useBreakpoint } = Grid;

const Settings: React.FC = () => {
  const [profileForm] = Form.useForm();
  const [securityForm] = Form.useForm();
  const [notificationForm] = Form.useForm();
  const [systemForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('profile');
  const screens = useBreakpoint();

  // 模拟用户数据
  const mockUser = {
    username: 'admin',
    email: 'admin@stock-race.com',
    phone: '+86 13800138000',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
    bio: 'AI股票交易爱好者，专注于量化投资策略',
    location: '上海, 中国',
    language: 'zh-CN',
    timezone: 'Asia/Shanghai',
  };

  // 处理表单提交
  const handleProfileSubmit = (values: any) => {
    console.log('更新个人资料:', values);
    alert('个人资料已更新');
  };

  const handleSecuritySubmit = (values: any) => {
    console.log('更新安全设置:', values);
    alert('安全设置已更新');
  };

  const handleNotificationSubmit = (values: any) => {
    console.log('更新通知设置:', values);
    alert('通知设置已更新');
  };

  const handleSystemSubmit = (values: any) => {
    console.log('更新系统设置:', values);
    alert('系统设置已更新');
  };

  // 处理头像上传
  const handleAvatarUpload = (info: any) => {
    if (info.file.status === 'done') {
      alert('头像上传成功');
    }
  };

  return (
    <div style={{ maxWidth: '100%' }}>
      {/* 页面标题 */}
      <Space direction="vertical" size="middle" style={{ width: '100%', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>
          <SettingOutlined /> 设置
        </Title>
        <Text type="secondary">
          管理您的账户设置、安全配置和系统偏好。
        </Text>
      </Space>

      <Row gutter={[16, 16]}>
        {/* 左侧：设置导航 */}
        <Col xs={24} lg={6}>
          <Card style={{ position: 'sticky', top: 24 }}>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              tabPosition={screens.lg ? 'left' : 'top'}
              style={{ minHeight: 400 }}
              items={[
                {
                  key: 'profile',
                  label: (
                    <Space>
                      <UserOutlined />
                      <Text>个人资料</Text>
                    </Space>
                  ),
                },
                {
                  key: 'security',
                  label: (
                    <Space>
                      <SafetyOutlined />
                      <Text>安全设置</Text>
                    </Space>
                  ),
                },
                {
                  key: 'notifications',
                  label: (
                    <Space>
                      <BellOutlined />
                      <Text>通知设置</Text>
                    </Space>
                  ),
                },
                {
                  key: 'system',
                  label: (
                    <Space>
                      <GlobalOutlined />
                      <Text>系统设置</Text>
                    </Space>
                  ),
                },
                {
                  key: 'api',
                  label: (
                    <Space>
                      <CloudOutlined />
                      <Text>API设置</Text>
                    </Space>
                  ),
                },
              ]}
            />
          </Card>
        </Col>

        {/* 右侧：设置内容 */}
        <Col xs={24} lg={18}>
          <Card>
            {/* 个人资料设置 */}
            {activeTab === 'profile' && (
              <Space direction="vertical" size={24} style={{ width: '100%' }}>
                <Title level={4}>
                  <UserOutlined /> 个人资料设置
                </Title>

                <Row gutter={[24, 24]}>
                  {/* 头像设置 */}
                  <Col xs={24} md={8}>
                    <Space direction="vertical" align="center" style={{ width: '100%' }}>
                      <Avatar
                        size={120}
                        src={mockUser.avatar}
                        icon={<UserOutlined />}
                      />
                      <Upload
                        accept="image/*"
                        showUploadList={false}
                        onChange={handleAvatarUpload}
                      >
                        <Button icon={<UploadOutlined />}>
                          更换头像
                        </Button>
                      </Upload>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        支持 JPG, PNG 格式，最大 2MB
                      </Text>
                    </Space>
                  </Col>

                  {/* 个人信息表单 */}
                  <Col xs={24} md={16}>
                    <Form
                      form={profileForm}
                      layout="vertical"
                      onFinish={handleProfileSubmit}
                      initialValues={mockUser}
                    >
                      <Row gutter={16}>
                        <Col xs={24} md={12}>
                          <Form.Item
                            name="username"
                            label="用户名"
                            rules={[
                              { required: true, message: '请输入用户名' },
                              { min: 3, message: '用户名至少3个字符' },
                              { max: 20, message: '用户名最多20个字符' },
                            ]}
                          >
                            <Input
                              prefix={<UserOutlined />}
                              placeholder="请输入用户名"
                            />
                          </Form.Item>
                        </Col>

                        <Col xs={24} md={12}>
                          <Form.Item
                            name="email"
                            label="邮箱地址"
                            rules={[
                              { required: true, message: '请输入邮箱地址' },
                              { type: 'email', message: '请输入有效的邮箱地址' },
                            ]}
                          >
                            <Input
                              prefix={<MailOutlined />}
                              placeholder="请输入邮箱地址"
                            />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Form.Item
                        name="phone"
                        label="手机号码"
                        rules={[
                          { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号码' },
                        ]}
                      >
                        <Input
                          prefix={<PhoneOutlined />}
                          placeholder="请输入手机号码"
                        />
                      </Form.Item>

                      <Form.Item
                        name="bio"
                        label="个人简介"
                      >
                        <Input.TextArea
                          placeholder="介绍一下你自己"
                          rows={3}
                          maxLength={200}
                          showCount
                        />
                      </Form.Item>

                      <Row gutter={16}>
                        <Col xs={24} md={12}>
                          <Form.Item
                            name="location"
                            label="所在地"
                          >
                            <Input placeholder="例如：上海, 中国" />
                          </Form.Item>
                        </Col>

                        <Col xs={24} md={12}>
                          <Form.Item
                            name="timezone"
                            label="时区"
                          >
                            <Select placeholder="选择时区">
                              <Option value="Asia/Shanghai">中国标准时间 (UTC+8)</Option>
                              <Option value="America/New_York">美国东部时间 (UTC-5)</Option>
                              <Option value="Europe/London">伦敦时间 (UTC+0)</Option>
                              <Option value="Asia/Tokyo">日本时间 (UTC+9)</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                      </Row>

                      <Form.Item>
                        <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                          保存更改
                        </Button>
                      </Form.Item>
                    </Form>
                  </Col>
                </Row>
              </Space>
            )}

            {/* 安全设置 */}
            {activeTab === 'security' && (
              <Space direction="vertical" size={24} style={{ width: '100%' }}>
                <Title level={4}>
                  <SafetyOutlined /> 安全设置
                </Title>

                <Form
                  form={securityForm}
                  layout="vertical"
                  onFinish={handleSecuritySubmit}
                  initialValues={{
                    twoFactorAuth: false,
                    loginNotifications: true,
                    sessionTimeout: 60,
                  }}
                >
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    {/* 密码修改 */}
                    <Card title="密码安全" size="small">
                      <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <Form.Item
                          name="currentPassword"
                          label="当前密码"
                          rules={[{ required: true, message: '请输入当前密码' }]}
                        >
                          <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="请输入当前密码"
                          />
                        </Form.Item>

                        <Form.Item
                          name="newPassword"
                          label="新密码"
                          rules={[
                            { required: true, message: '请输入新密码' },
                            { min: 8, message: '密码至少8个字符' },
                            { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, message: '必须包含大小写字母和数字' },
                          ]}
                        >
                          <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="请输入新密码"
                          />
                        </Form.Item>

                        <Form.Item
                          name="confirmPassword"
                          label="确认新密码"
                          dependencies={['newPassword']}
                          rules={[
                            { required: true, message: '请确认新密码' },
                            ({ getFieldValue }) => ({
                              validator(_, value) {
                                if (!value || getFieldValue('newPassword') === value) {
                                  return Promise.resolve();
                                }
                                return Promise.reject(new Error('两次输入的密码不一致'));
                              },
                            }),
                          ]}
                        >
                          <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="请再次输入新密码"
                          />
                        </Form.Item>
                      </Space>
                    </Card>

                    {/* 双重认证 */}
                    <Card title="双重认证" size="small">
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Form.Item
                          name="twoFactorAuth"
                          label="启用双重认证"
                          valuePropName="checked"
                        >
                          <Switch />
                        </Form.Item>
                        <Text type="secondary">
                          启用后，登录时需要输入手机验证码或使用身份验证器应用
                        </Text>
                      </Space>
                    </Card>

                    {/* 会话设置 */}
                    <Card title="会话安全" size="small">
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Form.Item
                          name="sessionTimeout"
                          label="会话超时时间"
                        >
                          <Select style={{ width: 200 }}>
                            <Option value={15}>15分钟</Option>
                            <Option value={30}>30分钟</Option>
                            <Option value={60}>60分钟</Option>
                            <Option value={120}>2小时</Option>
                            <Option value={0}>永不超时</Option>
                          </Select>
                        </Form.Item>
                        <Form.Item
                          name="loginNotifications"
                          label="登录通知"
                          valuePropName="checked"
                        >
                          <Switch />
                        </Form.Item>
                        <Text type="secondary">
                          启用后，新设备登录时会发送邮件通知
                        </Text>
                      </Space>
                    </Card>

                    <Form.Item>
                      <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                        更新安全设置
                      </Button>
                    </Form.Item>
                  </Space>
                </Form>
              </Space>
            )}

            {/* 通知设置 */}
            {activeTab === 'notifications' && (
              <Space direction="vertical" size={24} style={{ width: '100%' }}>
                <Title level={4}>
                  <BellOutlined /> 通知设置
                </Title>

                <Form
                  form={notificationForm}
                  layout="vertical"
                  onFinish={handleNotificationSubmit}
                  initialValues={{
                    emailNotifications: true,
                    tradeNotifications: true,
                    aiDecisionNotifications: true,
                    systemNotifications: true,
                    pushNotifications: false,
                  }}
                >
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Card title="通知渠道" size="small">
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Form.Item
                          name="emailNotifications"
                          label="邮件通知"
                          valuePropName="checked"
                        >
                          <Switch />
                        </Form.Item>
                        <Form.Item
                          name="pushNotifications"
                          label="推送通知"
                          valuePropName="checked"
                        >
                          <Switch />
                        </Form.Item>
                      </Space>
                    </Card>

                    <Card title="通知类型" size="small">
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Form.Item
                          name="tradeNotifications"
                          label="交易通知"
                          valuePropName="checked"
                        >
                          <Switch />
                        </Form.Item>
                        <Text type="secondary">
                          交易执行、订单状态变更等
                        </Text>

                        <Form.Item
                          name="aiDecisionNotifications"
                          label="AI决策通知"
                          valuePropName="checked"
                        >
                          <Switch />
                        </Form.Item>
                        <Text type="secondary">
                          AI交易建议、策略调整等
                        </Text>

                        <Form.Item
                          name="systemNotifications"
                          label="系统通知"
                          valuePropName="checked"
                        >
                          <Switch />
                        </Form.Item>
                        <Text type="secondary">
                          系统维护、重要更新等
                        </Text>
                      </Space>
                    </Card>

                    <Card title="通知频率" size="small">
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Form.Item
                          name="notificationFrequency"
                          label="汇总频率"
                          initialValue="realtime"
                        >
                          <Radio.Group>
                            <Radio value="realtime">实时</Radio>
                            <Radio value="hourly">每小时</Radio>
                            <Radio value="daily">每日</Radio>
                          </Radio.Group>
                        </Form.Item>
                      </Space>
                    </Card>

                    <Form.Item>
                      <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                        更新通知设置
                      </Button>
                    </Form.Item>
                  </Space>
                </Form>
              </Space>
            )}

            {/* 系统设置 */}
            {activeTab === 'system' && (
              <Space direction="vertical" size={24} style={{ width: '100%' }}>
                <Title level={4}>
                  <GlobalOutlined /> 系统设置
                </Title>

                <Form
                  form={systemForm}
                  layout="vertical"
                  onFinish={handleSystemSubmit}
                  initialValues={{
                    language: 'zh-CN',
                    theme: 'light',
                    defaultPage: 'dashboard',
                    autoRefresh: true,
                    refreshInterval: 30,
                  }}
                >
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Card title="界面设置" size="small">
                      <Row gutter={16}>
                        <Col xs={24} md={12}>
                          <Form.Item
                            name="language"
                            label="语言"
                          >
                            <Select>
                              <Option value="zh-CN">简体中文</Option>
                              <Option value="en-US">English</Option>
                              <Option value="ja-JP">日本語</Option>
                            </Select>
                          </Form.Item>
                        </Col>

                        <Col xs={24} md={12}>
                          <Form.Item
                            name="theme"
                            label="主题"
                          >
                            <Select>
                              <Option value="light">浅色主题</Option>
                              <Option value="dark">深色主题</Option>
                              <Option value="auto">跟随系统</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                      </Row>

                      <Form.Item
                        name="defaultPage"
                        label="默认首页"
                      >
                        <Select>
                          <Option value="dashboard">仪表盘</Option>
                          <Option value="trading">交易</Option>
                          <Option value="analytics">分析</Option>
                          <Option value="competition">排行榜</Option>
                        </Select>
                      </Form.Item>
                    </Card>

                    <Card title="数据设置" size="small">
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Form.Item
                          name="autoRefresh"
                          label="自动刷新数据"
                          valuePropName="checked"
                        >
                          <Switch />
                        </Form.Item>

                        <Form.Item
                          name="refreshInterval"
                          label="刷新间隔"
                        >
                          <InputNumber
                            min={5}
                            max={300}
                            addonAfter="秒"
                            style={{ width: 150 }}
                          />
                        </Form.Item>

                        <Form.Item
                          name="dataRetention"
                          label="数据保留时间"
                          initialValue={90}
                        >
                          <Select style={{ width: 200 }}>
                            <Option value={30}>30天</Option>
                            <Option value={90}>90天</Option>
                            <Option value={180}>180天</Option>
                            <Option value={365}>1年</Option>
                            <Option value={0}>永久</Option>
                          </Select>
                        </Form.Item>
                      </Space>
                    </Card>

                    <Card title="交易设置" size="small">
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Form.Item
                          name="defaultOrderType"
                          label="默认订单类型"
                          initialValue="market"
                        >
                          <Select style={{ width: 200 }}>
                            <Option value="market">市价单</Option>
                            <Option value="limit">限价单</Option>
                          </Select>
                        </Form.Item>

                        <Form.Item
                          name="defaultQuantity"
                          label="默认交易数量"
                          initialValue={100}
                        >
                          <InputNumber
                            min={1}
                            max={10000}
                            addonAfter="股"
                            style={{ width: 150 }}
                          />
                        </Form.Item>

                        <Form.Item
                          name="confirmTrades"
                          label="交易确认"
                          valuePropName="checked"
                          initialValue={true}
                        >
                          <Switch />
                        </Form.Item>
                      </Space>
                    </Card>

                    <Form.Item>
                      <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                        更新系统设置
                      </Button>
                    </Form.Item>
                  </Space>
                </Form>
              </Space>
            )}

            {/* API设置 */}
            {activeTab === 'api' && (
              <Space direction="vertical" size={24} style={{ width: '100%' }}>
                <Title level={4}>
                  <CloudOutlined /> API设置
                </Title>

                <Alert
                  message="API密钥安全提示"
                  description="请妥善保管您的API密钥，不要分享给他人。定期轮换密钥以提高安全性。"
                  type="warning"
                  showIcon
                  style={{ marginBottom: 24 }}
                />

                <Card title="API密钥管理" size="small">
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <div>
                      <Text strong>当前API密钥</Text>
                      <Input
                        value="sk_stockrace_1234567890abcdef"
                        readOnly
                        addonAfter={
                          <Button type="text" size="small" icon={<KeyOutlined />}>
                            复制
                          </Button>
                        }
                        style={{ marginTop: 8 }}
                      />
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                        创建时间：2026-01-15 10:30:00 · 最后使用：2026-02-03 14:20:00
                      </Text>
                    </div>

                    <Divider />

                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Text strong>生成新API密钥</Text>
                      <Form layout="vertical">
                        <Form.Item
                          label="密钥名称"
                          name="keyName"
                          rules={[{ required: true, message: '请输入密钥名称' }]}
                        >
                          <Input placeholder="例如：交易机器人API密钥" />
                        </Form.Item>

                        <Form.Item
                          label="权限范围"
                          name="permissions"
                          initialValue={['read', 'trade']}
                        >
                          <Select mode="multiple">
                            <Option value="read">读取数据</Option>
                            <Option value="trade">交易操作</Option>
                            <Option value="ai">AI决策</Option>
                            <Option value="admin">管理权限</Option>
                          </Select>
                        </Form.Item>

                        <Form.Item
                          label="有效期"
                          name="expiry"
                          initialValue={30}
                        >
                          <Select style={{ width: 200 }}>
                            <Option value={7}>7天</Option>
                            <Option value={30}>30天</Option>
                            <Option value={90}>90天</Option>
                            <Option value={365}>1年</Option>
                            <Option value={0}>永久</Option>
                          </Select>
                        </Form.Item>

                        <Form.Item>
                          <Button type="primary" icon={<KeyOutlined />}>
                            生成新密钥
                          </Button>
                        </Form.Item>
                      </Form>
                    </Space>

                    <Divider />

                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Text strong>API使用统计</Text>
                      <Row gutter={16}>
                        <Col span={12}>
                          <Statistic
                            title="今日请求数"
                            value={124}
                            suffix="次"
                          />
                        </Col>
                        <Col span={12}>
                          <Statistic
                            title="成功率"
                            value={98.3}
                            suffix="%"
                          />
                        </Col>
                      </Row>
                      <Button type="link" size="small">
                        查看详细使用日志
                      </Button>
                    </Space>
                  </Space>
                </Card>
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};


export default Settings;