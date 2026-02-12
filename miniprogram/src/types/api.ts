// API 响应类型定义

// 通用响应结构
export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
}

// 分页响应结构
export interface PaginatedResponse<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

// 登录请求
export interface LoginRequest {
  username: string
  password: string
}

// 登录响应
export interface LoginResponse {
  token: string
  user: UserInfo
}

// 用户信息
export interface UserInfo {
  id: string
  username: string
  nickname?: string
  avatar?: string
  email?: string
  phone?: string
  createdAt: string
  updatedAt: string
}

// 注册请求
export interface RegisterRequest {
  username: string
  password: string
  confirmPassword: string
  nickname?: string
}

// 修改密码请求
export interface ChangePasswordRequest {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

// 更新用户信息请求
export interface UpdateUserRequest {
  nickname?: string
  avatar?: string
  email?: string
  phone?: string
}

// 微信登录请求
export interface WechatLoginRequest {
  code: string
  userInfo?: {
    nickName?: string
    avatarUrl?: string
    gender?: number
    city?: string
    province?: string
    country?: string
  }
}
