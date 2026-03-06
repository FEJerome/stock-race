import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Button,
  Typography,
  Space,
  Alert,
  Divider,
  Flex,
  Layout,
  theme,
  Tabs,
} from 'antd';
import {
  UserOutlined,
  LockOutlined,
  StockOutlined,
  ArrowRightOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../store/auth.store';

const { Title, Text, Paragraph } = Typography;
const { Content } = Layout;

const Login: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  const { login, register, isLoading, error, clearError, isAuthenticated } = useAuthStore();

  const [rememberMe, setRememberMe] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  // 如果已经登录，重定向到首页
  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as any)?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  const handleSubmit = async (values: { username: string; password: string; confirmPassword?: string }) => {
    try {
      clearError();

      if (activeTab === 'login') {
        await login(values.username, values.password);
        // 登录成功后，useEffect会处理重定向
      } else {
        // 注册逻辑
        if (!values.confirmPassword) {
          throw new Error('请确认密码');
        }
        if (values.password !== values.confirmPassword) {
          throw new Error('密码和确认密码不一致');
        }
        await register(values.username, values.password, values.confirmPassword);
        // 注册成功后，useEffect会处理重定向
      }
    } catch (error) {
      // 错误已经在store中处理
      console.error(`${activeTab === 'login' ? '登录' : '注册'}失败:`, error);
    }
  };

  const handleDemoLogin = () => {
    setActiveTab('login');
    form.setFieldsValue({
      username: 'admin',
      password: 'admin123',
      confirmPassword: '',
    });
  };

  return (
    <Layout style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <Content style={{ padding: '24px' }}>
        <Flex
          justify="center"
          align="center"
          style={{ minHeight: 'calc(100vh - 48px)' }}
        >
          <Card
            style={{
              width: '100%',
              maxWidth: 420,
              boxShadow: token.boxShadow,
              borderRadius: token.borderRadiusLG,
            }}
            bordered={false}
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              {/* 标题区域 */}
              <div style={{ textAlign: 'center' }}>
                <Space direction="vertical" size="small">
                  <StockOutlined
                    style={{
                      fontSize: 48,
                      color: token.colorPrimary,
                      marginBottom: 8,
                    }}
                  />
                  <Title level={2} style={{ margin: 0 }}>
                    Stock Race
                  </Title>
                  <Text type="secondary">
                    AI股票竞赛平台 - {activeTab === 'login' ? '登录您的账户' : '创建新账户'}
                  </Text>
                </Space>
              </div>

              {/* 错误提示 */}
              {error && (
                <Alert
                  message={activeTab === 'login' ? '登录失败' : '注册失败'}
                  description={error}
                  type="error"
                  showIcon
                  closable
                  onClose={clearError}
                />
              )}

              {/* 登录/注册切换 */}
              <Tabs
                activeKey={activeTab}
                onChange={(key) => {
                  setActiveTab(key as 'login' | 'register');
                  clearError();
                  form.resetFields();
                }}
                items={[
                  {
                    key: 'login',
                    label: '登录',
                    children: (
                      <Form
                        form={form}
                        layout="vertical"
                        onFinish={handleSubmit}
                        initialValues={{ username: '', password: '' }}
                      >
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
                            size="large"
                            disabled={isLoading}
                          />
                        </Form.Item>

                        <Form.Item
                          name="password"
                          label="密码"
                          rules={[
                            { required: true, message: '请输入密码' },
                            { min: 6, message: '密码至少6个字符' },
                          ]}
                        >
                          <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="请输入密码"
                            size="large"
                            disabled={isLoading}
                          />
                        </Form.Item>

                        <Form.Item>
                          <Button
                            type="primary"
                            htmlType="submit"
                            size="large"
                            loading={isLoading}
                            block
                            icon={<ArrowRightOutlined />}
                          >
                            {isLoading ? '登录中...' : '登录'}
                          </Button>
                        </Form.Item>
                      </Form>
                    ),
                  },
                  {
                    key: 'register',
                    label: '注册',
                    children: (
                      <Form
                        form={form}
                        layout="vertical"
                        onFinish={handleSubmit}
                        initialValues={{ username: '', password: '', confirmPassword: '' }}
                      >
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
                            placeholder="请输入用户名（3-20个字符）"
                            size="large"
                            disabled={isLoading}
                          />
                        </Form.Item>

                        <Form.Item
                          name="password"
                          label="密码"
                          rules={[
                            { required: true, message: '请输入密码' },
                            { min: 6, message: '密码至少6个字符' },
                          ]}
                        >
                          <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="请输入密码（至少6个字符）"
                            size="large"
                            disabled={isLoading}
                          />
                        </Form.Item>

                        <Form.Item
                          name="confirmPassword"
                          label="确认密码"
                          rules={[
                            { required: true, message: '请确认密码' },
                            ({ getFieldValue }) => ({
                              validator(_, value) {
                                if (!value || getFieldValue('password') === value) {
                                  return Promise.resolve();
                                }
                                return Promise.reject(new Error('两次输入的密码不一致'));
                              },
                            }),
                          ]}
                        >
                          <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="请再次输入密码"
                            size="large"
                            disabled={isLoading}
                          />
                        </Form.Item>

                        <Form.Item>
                          <Button
                            type="primary"
                            htmlType="submit"
                            size="large"
                            loading={isLoading}
                            block
                            icon={<UserAddOutlined />}
                          >
                            {isLoading ? '注册中...' : '注册'}
                          </Button>
                        </Form.Item>
                      </Form>
                    ),
                  },
                ]}
              />

              {/* 演示账户提示（仅在登录模式下显示） */}
              {activeTab === 'login' && (
                <>
                  <Divider plain>演示账户</Divider>
                  <Card size="small" bordered style={{ background: token.colorFillAlter }}>
                    <Paragraph type="secondary" style={{ margin: 0 }}>
                      <Space direction="vertical" size="small">
                        <Text strong>用户名:</Text>
                        <Text code>admin</Text>
                        <Text strong>密码:</Text>
                        <Text code>admin123</Text>
                        <Button
                          type="dashed"
                          size="small"
                          onClick={handleDemoLogin}
                          block
                          style={{ marginTop: 8 }}
                        >
                          使用演示账户登录
                        </Button>
                      </Space>
                    </Paragraph>
                  </Card>
                </>
              )}

              {/* 平台介绍 */}
              <Divider plain>平台功能</Divider>
              <Space direction="vertical" size="small">
                <Text type="secondary">
                  <StockOutlined /> 实时股票行情监控
                </Text>
                <Text type="secondary">
                  <StockOutlined /> AI智能交易决策
                </Text>
                <Text type="secondary">
                  <StockOutlined /> 虚拟交易模拟
                </Text>
                <Text type="secondary">
                  <StockOutlined /> 收益排行榜
                </Text>
                {activeTab === 'register' && (
                  <Text type="secondary" style={{ marginTop: 8 }}>
                    注册后即可获得干净的测试账号，无前置数据
                  </Text>
                )}
              </Space>
            </Space>
          </Card>
        </Flex>
      </Content>
    </Layout>
  );
};

export default Login;