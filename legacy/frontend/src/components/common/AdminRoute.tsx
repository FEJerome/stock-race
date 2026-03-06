import React, { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin, Alert, Button, Result, notification } from 'antd';
import { useAuthStore } from '../../store/auth.store';
import authService from '../../services/auth.service';

interface AdminRouteProps {
  children: ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({
  children,
}) => {
  const location = useLocation();
  const { isAuthenticated, user, token, setUser, logout } = useAuthStore();
  const [isChecking, setIsChecking] = useState(true);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdminAuth = async () => {
      if (!isAuthenticated || !token) {
        setIsChecking(false);
        return;
      }

      try {
        // 验证token是否有效
        const isValid = await authService.validateToken(token);
        if (!isValid) {
          logout();
          setCheckError('会话已过期，请重新登录');
          setIsChecking(false);
          return;
        }

        // 获取当前用户信息
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);

        // 检查用户是否为管理员
        const userIsAdmin = currentUser?.role === 'admin';
        setIsAdmin(userIsAdmin);

        if (!userIsAdmin) {
          notification.warning({
            message: '权限不足',
            description: '您没有访问管理员界面的权限',
            duration: 3,
          });
        }
      } catch (error) {
        console.error('管理员认证检查失败:', error);
        setCheckError('认证检查失败，请重新登录');
      } finally {
        setIsChecking(false);
      }
    };

    checkAdminAuth();
  }, [isAuthenticated, token, setUser, logout]);

  if (isChecking) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
      }}>
        <Spin size="large" tip="检查管理员权限..." />
      </div>
    );
  }

  if (checkError) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '24px',
      }}>
        <Result
          status="warning"
          title="认证检查失败"
          subTitle={checkError}
          extra={[
            <Button
              type="primary"
              key="login"
              onClick={() => {
                logout();
                window.location.href = '/login';
              }}
            >
              重新登录
            </Button>,
          ]}
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    // 保存当前路径，登录后可以跳转回来
    return (
      <Navigate
        to="/login"
        state={{ from: location }}
        replace
      />
    );
  }

  if (!isAdmin) {
    // 非管理员用户重定向到首页
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;