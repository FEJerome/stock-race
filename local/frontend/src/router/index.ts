import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '@/views/Dashboard.vue'
import Agents from '@/views/Agents.vue'
import AgentDetail from '@/views/AgentDetail.vue'
import Market from '@/views/Market.vue'
import Leaderboard from '@/views/Leaderboard.vue'
import Settings from '@/views/Settings.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Dashboard',
      component: Dashboard
    },
    {
      path: '/agents',
      name: 'Agents',
      component: Agents
    },
    {
      path: '/agents/:id',
      name: 'AgentDetail',
      component: AgentDetail,
      props: true
    },
    {
      path: '/market',
      name: 'Market',
      component: Market
    },
    {
      path: '/leaderboard',
      name: 'Leaderboard',
      component: Leaderboard
    },
    {
      path: '/settings',
      name: 'Settings',
      component: Settings
    }
  ]
})

export default router
