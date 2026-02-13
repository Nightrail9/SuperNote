<script setup lang="ts">
/**
 * BreadcrumbNav - 面包屑导航组件
 * 
 * 特点：
 * - 自动根据路由生成面包屑
 * - 首页显示
 * - 使用 > 分隔符
 * - 支持点击跳转
 */

import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

interface BreadcrumbItem {
  path: string
  title: string
  isLast: boolean
}

interface Props {
  /** 自定义标题映射 */
  titleMap?: Record<string, string>
}

const props = withDefaults(defineProps<Props>(), {
  titleMap: () => ({}),
})

// 路由标题映射
const routeTitleMap: Record<string, string> = {
  '/': '首页',
  '/create': '创作中心',
  '/create/bilibili': 'B站视频',
  '/create/web': '网页链接',
  '/create/generate': '生成任务',
  '/history': '历史记录',
  '/history/notes': '笔记列表',
  '/history/drafts': '草稿箱',
  '/settings': '系统设置',
  '/settings/models': '模型配置',
  '/settings/integrations': '集成配置',
  '/settings/prompts': '提示词管理',
  ...props.titleMap,
}

// 生成面包屑列表
const breadcrumbs = computed<BreadcrumbItem[]>(() => {
  const path = route.path
  const crumbs: BreadcrumbItem[] = []

  // 首页始终显示
  crumbs.push({
    path: '/',
    title: routeTitleMap['/'] || '首页',
    isLast: path === '/',
  })

  // 根据路径生成面包屑
  if (path.startsWith('/create')) {
    crumbs.push({
      path: '/create',
      title: routeTitleMap['/create'] || '创作中心',
      isLast: path === '/create',
    })

    if (path.includes('/bilibili')) {
      crumbs.push({
        path: '/create/bilibili',
        title: routeTitleMap['/create/bilibili'] || 'B站视频',
        isLast: path === '/create/bilibili' || path.includes('/generate'),
      })
    } else if (path.includes('/web')) {
      crumbs.push({
        path: '/create/web',
        title: routeTitleMap['/create/web'] || '网页链接',
        isLast: path === '/create/web' || path.includes('/generate'),
      })
    }

    if (path.includes('/generate')) {
      crumbs.push({
        path: path,
        title: routeTitleMap['/create/generate'] || '生成任务',
        isLast: true,
      })
    }
  } else if (path.startsWith('/history')) {
    crumbs.push({
      path: '/history',
      title: routeTitleMap['/history'] || '历史记录',
      isLast: path === '/history',
    })

    if (path.includes('/notes')) {
      crumbs.push({
        path: '/history/notes',
        title: routeTitleMap['/history/notes'] || '笔记列表',
        isLast: true,
      })
    } else if (path.includes('/drafts')) {
      crumbs.push({
        path: '/history/drafts',
        title: routeTitleMap['/history/drafts'] || '草稿箱',
        isLast: true,
      })
    }
  } else if (path.startsWith('/settings')) {
    crumbs.push({
      path: '/settings',
      title: routeTitleMap['/settings'] || '系统设置',
      isLast: path === '/settings',
    })

    if (path.includes('/models')) {
      crumbs.push({
        path: '/settings/models',
        title: routeTitleMap['/settings/models'] || '模型配置',
        isLast: true,
      })
    } else if (path.includes('/integrations')) {
      crumbs.push({
        path: '/settings/integrations',
        title: routeTitleMap['/settings/integrations'] || '集成配置',
        isLast: true,
      })
    } else if (path.includes('/prompts')) {
      crumbs.push({
        path: '/settings/prompts',
        title: routeTitleMap['/settings/prompts'] || '提示词管理',
        isLast: true,
      })
    }
  }

  return crumbs
})

function navigate(path: string) {
  if (path !== route.path) {
    router.push(path)
  }
}
</script>

<template>
  <nav class="breadcrumb-nav" aria-label="面包屑导航">
    <ol class="breadcrumb-list">
      <li
        v-for="(item, index) in breadcrumbs"
        :key="item.path"
        class="breadcrumb-item"
      >
        <!-- 分隔符 -->
        <span v-if="index > 0" class="breadcrumb-separator">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2L8 6L4 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>

        <!-- 面包屑项 -->
        <component
          :is="item.isLast ? 'span' : 'button'"
          class="breadcrumb-link"
          :class="{ 'is-last': item.isLast, 'is-clickable': !item.isLast }"
          :aria-current="item.isLast ? 'page' : undefined"
          @click="item.isLast ? null : navigate(item.path)"
        >
          {{ item.title }}
        </component>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.breadcrumb-nav {
  margin-bottom: 16px;
}

.breadcrumb-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
}

.breadcrumb-separator {
  display: flex;
  align-items: center;
  margin: 0 6px;
  color: var(--text-tertiary);
}

.breadcrumb-link {
  font-size: 13px;
  color: var(--text-secondary);
  background: none;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: default;
  transition: all 0.2s ease;
}

.breadcrumb-link.is-clickable {
  cursor: pointer;
}

.breadcrumb-link.is-clickable:hover {
  color: var(--primary-500);
  background: var(--bg-hover);
}

.breadcrumb-link.is-last {
  color: var(--text-primary);
  font-weight: 500;
}

/* 移动端适配 */
@media (max-width: 640px) {
  .breadcrumb-link {
    font-size: 12px;
    padding: 4px 6px;
  }
  
  .breadcrumb-separator {
    margin: 0 4px;
  }
}
</style>
