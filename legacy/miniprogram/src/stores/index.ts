// Pinia Store 入口
import { createPinia } from 'pinia'

export const pinia = createPinia()

export * from './auth'
export * from './user'
export * from './market'
export * from './ai'
export * from './trading'
