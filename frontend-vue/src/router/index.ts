import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { Edit, Files, Document, Clock, Setting, Tools } from '@element-plus/icons-vue'
import AppShell from '../layout/AppShell.vue'

export type AppMenuItem = {
  key: string
  label: string
  path?: string
  icon: unknown
  children?: AppMenuItem[]
}

export const appMenu: AppMenuItem[] = [
  {
    key: 'create',
    label: '创作中心',
    icon: Edit,
    children: [
      { key: 'create-bilibili', label: 'B站链接生成笔记', icon: Edit, path: '/create/bilibili' },
      { key: 'create-web', label: '网页链接生成笔记', icon: Edit, path: '/create/web' },
    ],
  },
  {
    key: 'history',
    label: '历史记录',
    icon: Clock,
    children: [
      { key: 'history-notes', label: '笔记', icon: Files, path: '/history/notes' },
      { key: 'history-drafts', label: '草稿箱', icon: Document, path: '/history/drafts' },
    ],
  },
  {
    key: 'settings',
    label: '系统配置',
    icon: Setting,
    children: [
      { key: 'settings-models', label: '模型配置', icon: Tools, path: '/settings/models' },
      { key: 'settings-integrations', label: '集成配置', icon: Tools, path: '/settings/integrations' },
      { key: 'settings-prompts', label: '提示词', icon: Tools, path: '/settings/prompts' },
    ],
  },
]

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: AppShell,
    children: [
      { path: '', redirect: '/create/bilibili' },
      { path: 'create', redirect: '/create/bilibili' },
      { path: 'create/bilibili', component: () => import('../views/create/CreatePage.vue') },
      { path: 'create/web', component: () => import('../views/create/WebCreatePage.vue') },
      { path: 'create/generate/:taskId', component: () => import('../views/create/GenerateNotePage.vue') },
      { path: 'history/notes', component: () => import('../views/history/NotesPage.vue') },
      { path: 'history/drafts', component: () => import('../views/history/DraftsPage.vue') },
      { path: 'settings/models', component: () => import('../views/settings/ModelsPage.vue') },
      { path: 'settings/integrations', component: () => import('../views/settings/IntegrationsPage.vue') },
      { path: 'settings/prompts', component: () => import('../views/settings/PromptsPage.vue') },
    ],
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
