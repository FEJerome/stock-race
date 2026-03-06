// 认证相关API
import { request } from './request'
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  UserInfo,
  ChangePasswordRequest,
  UpdateUserRequest,
  WechatLoginRequest,
} from '@/types/api'

export const authApi = {
  // 用户登录
  login(data: LoginRequest): Promise<LoginResponse> {
    return request.post<LoginResponse>('/v1/auth/login', data)
  },

  // 用户注册
  register(data: RegisterRequest): Promise<LoginResponse> {
    return request.post<LoginResponse>('/v1/auth/register', data)
  },

  // 获取当前用户信息
  getCurrentUser(): Promise<UserInfo> {
    return request.get<UserInfo>('/v1/users/me')
  },

  // 更新用户信息
  updateUser(data: UpdateUserRequest): Promise<UserInfo> {
    return request.put<UserInfo>('/v1/users/me', data)
  },

  // 修改密码
  changePassword(data: ChangePasswordRequest): Promise<void> {
    return request.post<void>('/v1/users/me/change-password', data)
  },

  // 退出登录
  logout(): Promise<void> {
    return request.post<void>('/v1/auth/logout')
  },

  // 微信登录
  wechatLogin(data: WechatLoginRequest): Promise<LoginResponse> {
    return request.post<LoginResponse>('/v1/auth/wechat-login', data)
  },
}
