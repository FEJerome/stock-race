import React, { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin, Alert, Button, Result } from 'antd';
import { useAuthStore } from '../../store/auth.store';
import authService from '../../services/auth.service';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAuth?: boolean;
  redirectTo?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
  redirectTo = '/login',
}) => {
  const location = useLocation();
  const { isAuthenticated, token, setUser, setToken, logout } = useAuthStore();
  const [isChecking, setIsChecking] = useState(true);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      if (!requireAuth) {
        setIsChecking(false);
        return;
      }

      if (!token) {
        setIsChecking(false);
        return;
      }

      try {
        // 验证token是否有效
        const isValid = await authService.validateToken(token);
        if (!isValid) {
          logout();
          setCheckError('会话已过期，请重新登录');
        } else {
          // 获取当前用户信息
          const user = await authService.getCurrentUser();
          setUser(user);
        }
      } catch (error) {
        console.error('认证检查失败:', error);
        logout();
        setCheckError('认证检查失败，请重新登录');
      } finally {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [token, requireAuth, setUser, setToken, logout]);

  if (isChecking) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
      }}>
        <Spin size="large" tip="检查认证状态..." />
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
                window.location.href = redirectTo;
              }}
            >
              重新登录
            </Button>,
          ]}
        />
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) {
    // 保存当前路径，登录后可以跳转回来
    return (
      <Navigate
        to={redirectTo}
        state={{ from: location }}
        replace
      />
    );
  }

  if (!requireAuth && isAuthenticated) {
    // 如果不需要认证但用户已登录，重定向到首页
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;