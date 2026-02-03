import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout,
  Menu,
  Button,
  Avatar,
  Dropdown,
  Space,
  Typography,
  theme,
  Grid,
  Badge,
  Tooltip,
  Divider,
} from 'antd';
import {
  DashboardOutlined,
  StockOutlined,
  RobotOutlined,
  LineChartOutlined,
  SettingOutlined,
  TrophyOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  QuestionCircleOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../store/auth.store';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;
const { Text } = Typography;

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const { token } = theme.useToken();

  const { user, logout } = useAuthStore();

  // 菜单项配置
  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表盘',
    },
    {
      key: '/trading',
      icon: <StockOutlined />,
      label: '交易',
    },
    {
      key: '/ai-accounts',
      icon: <RobotOutlined />,
      label: 'AI账户',
    },
    {
      key: '/competition',
      icon: <TrophyOutlined />,
      label: '排行榜',
    },
    {
      key: '/analytics',
      icon: <LineChartOutlined />,
      label: '分析',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '设置',
    },
    {
      key: '/test-api',
      icon: <ApiOutlined />,
      label: 'API测试',
    },
  ];

  // 用户菜单项
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人资料',
      onClick: () => navigate('/settings/profile'),
    },
    {
      key: 'divider',
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: () => {
        logout();
        navigate('/login');
      },
    },
  ];

  // 处理菜单点击
  const handleMenuClick = (e: { key: string }) => {
    navigate(e.key);
  };

  // 获取当前选中的菜单项
  const selectedKeys = [location.pathname];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 侧边栏 - 在大屏显示 */}
      {screens.md && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={240}
          collapsedWidth={80}
          style={{
            background: token.colorBgContainer,
            borderRight: `1px solid ${token.colorBorderSecondary}`,
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 1000,
          }}
        >
          {/* Logo区域 */}
          <div
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '0' : '0 24px',
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <Space>
              <StockOutlined
                style={{
                  fontSize: 24,
                  color: token.colorPrimary,
                }}
              />
              {!collapsed && (
                <Text strong style={{ fontSize: 16 }}>
                  Stock Race
                </Text>
              )}
            </Space>
          </div>

          {/* 导航菜单 */}
          <Menu
            mode="inline"
            selectedKeys={selectedKeys}
            items={menuItems}
            onClick={handleMenuClick}
            style={{
              borderRight: 0,
              marginTop: 16,
            }}
          />
        </Sider>
      )}

      {/* 主内容区域 */}
      <Layout style={{ marginLeft: screens.md ? (collapsed ? 80 : 240) : 0 }}>
        {/* 顶部导航栏 */}
        <Header
          style={{
            background: token.colorBgContainer,
            padding: screens.md ? '0 24px' : '0 16px',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 999,
            height: 64,
          }}
        >
          {/* 左侧：菜单切换按钮（仅移动端）和面包屑 */}
          <Space>
            {!screens.md && (
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                style={{ fontSize: 16 }}
              />
            )}

            {/* 移动端菜单抽屉可以在这里实现 */}
          </Space>

          {/* 右侧：用户操作区域 */}
          <Space size="middle">
            {/* 通知 */}
            <Tooltip title="通知">
              <Badge count={5} size="small">
                <Button
                  type="text"
                  icon={<BellOutlined />}
                  shape="circle"
                />
              </Badge>
            </Tooltip>

            {/* 帮助 */}
            <Tooltip title="帮助">
              <Button
                type="text"
                icon={<QuestionCircleOutlined />}
                shape="circle"
              />
            </Tooltip>

            {/* 用户信息 */}
            <Dropdown
              menu={{
                items: userMenuItems,
              }}
              placement="bottomRight"
              trigger={['click']}
            >
              <Space
                style={{
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: token.borderRadius,
                  transition: 'all 0.3s',
                  ':hover': {
                    background: token.colorFillTertiary,
                  },
                }}
              >
                <Avatar
                  src={user?.avatar}
                  icon={!user?.avatar && <UserOutlined />}
                  size="default"
                />
                {screens.md && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <Text strong style={{ fontSize: 14, lineHeight: 1.2 }}>
                        {user?.username}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.2 }}>
                        {user?.email}
                      </Text>
                    </div>
                  </>
                )}
              </Space>
            </Dropdown>
          </Space>
        </Header>

        {/* 主内容 */}
        <Content
          style={{
            margin: screens.md ? '24px 24px 0' : '16px 16px 0',
            padding: screens.md ? 24 : 16,
            background: token.colorBgContainer,
            borderRadius: token.borderRadiusLG,
            minHeight: 280,
            overflow: 'initial',
          }}
        >
          <Outlet />
        </Content>

        {/* 页脚 */}
        <div
          style={{
            textAlign: 'center',
            padding: '24px 0',
            color: token.colorTextSecondary,
            fontSize: 14,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            marginTop: 24,
          }}
        >
          <Space direction="vertical" size="small">
            <Text type="secondary">
              © 2026 Stock Race - AI股票竞赛平台
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              本平台仅供模拟交易，不构成投资建议
            </Text>
          </Space>
        </div>
      </Layout>

      {/* 移动端侧边栏抽屉 */}
      {!screens.md && (
        <div
          style={{
            position: 'fixed',
            top: 64,
            left: collapsed ? '-240px' : 0,
            width: 240,
            height: 'calc(100vh - 64px)',
            background: token.colorBgContainer,
            borderRight: `1px solid ${token.colorBorderSecondary}`,
            transition: 'left 0.3s',
            zIndex: 999,
            overflow: 'auto',
          }}
        >
          <Menu
            mode="inline"
            selectedKeys={selectedKeys}
            items={menuItems}
            onClick={(e) => {
              handleMenuClick(e);
              setCollapsed(true);
            }}
            style={{
              borderRight: 0,
              marginTop: 16,
            }}
          />
        </div>
      )}
    </Layout>
  );
};

export default MainLayout;