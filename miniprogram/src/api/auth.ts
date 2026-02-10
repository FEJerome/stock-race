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
    return request.post<LoginResponse>('/auth/login', data)
  },

  // 用户注册
  register(data: RegisterRequest): Promise<LoginResponse> {
    return request.post<LoginResponse>('/auth/register', data)
  },

  // 获取当前用户信息
  getCurrentUser(): Promise<UserInfo> {
    return request.get<UserInfo>('/auth/me')
  },

  // 更新用户信息
  updateUser(data: UpdateUserRequest): Promise<UserInfo> {
    return request.put<UserInfo>('/auth/profile', data)
  },

  // 修改密码
  changePassword(data: ChangePasswordRequest): Promise<void> {
    return request.post<void>('/auth/change-password', data)
  },

  // 退出登录
  logout(): Promise<void> {
    return request.post<void>('/auth/logout')
  },

  // 微信登录
  wechatLogin(data: WechatLoginRequest): Promise<LoginResponse> {
    return request.post<LoginResponse>('/auth/wechat-login', data)
  },
}
