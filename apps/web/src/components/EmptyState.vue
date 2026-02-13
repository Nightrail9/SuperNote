<script setup lang="ts">
import { computed } from 'vue'

/**
 * EmptyState - 统一空状态组件
 * 
 * 特点：
 * - SVG 线框风格插画
 * - 支持多种状态：empty（空列表）、search（搜索无结果）、error（错误）
 * - 可自定义标题、描述、操作按钮
 */

interface Props {
  /** 状态类型 */
  type?: 'empty' | 'search' | 'error'
  /** 自定义标题 */
  title?: string
  /** 自定义描述 */
  description?: string
  /** 操作按钮文本 */
  actionText?: string
  /** 是否有操作按钮 */
  showAction?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'empty',
  showAction: false,
})

const emit = defineEmits<{
  (e: 'action'): void
}>()

const defaultTitles: Record<string, string> = {
  empty: '暂无数据',
  search: '未找到结果',
  error: '出现错误',
}

const defaultDescriptions: Record<string, string> = {
  empty: '这里还没有任何内容，开始创建您的第一篇笔记吧',
  search: '没有找到匹配的内容，请尝试其他关键词',
  error: '加载数据时出现问题，请稍后重试',
}

const currentTitle = computed(() => props.title || defaultTitles[props.type])
const currentDescription = computed(() => props.description || defaultDescriptions[props.type])

function handleAction() {
  emit('action')
}
</script>

<template>
  <div class="empty-state">
    <!-- SVG 插画 -->
    <div class="empty-illustration">
      <!-- 空列表状态 -->
      <svg v-if="type === 'empty'" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- 文档轮廓 -->
        <rect x="30" y="20" width="60" height="80" rx="4" stroke="currentColor" stroke-width="2" fill="none"/>
        <!-- 折角 -->
        <path d="M75 20H75L90 35" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M75 20H90V35" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <!-- 文本行 -->
        <line x1="40" y1="45" x2="80" y2="45" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="40" y1="55" x2="70" y2="55" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="40" y1="65" x2="75" y2="65" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="40" y1="75" x2="60" y2="75" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <!-- 底部装饰 -->
        <circle cx="60" cy="100" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
        <line x1="56" y1="100" x2="64" y2="100" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>

      <!-- 搜索无结果状态 -->
      <svg v-else-if="type === 'search'" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- 放大镜 -->
        <circle cx="55" cy="50" r="22" stroke="currentColor" stroke-width="2" fill="none"/>
        <line x1="72" y1="67" x2="88" y2="83" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
        <!-- 问号 -->
        <text x="52" y="56" font-size="18" font-weight="bold" fill="currentColor" text-anchor="middle">?</text>
        <!-- 底部线条 -->
        <line x1="35" y1="100" x2="85" y2="100" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 4"/>
      </svg>

      <!-- 错误状态 -->
      <svg v-else-if="type === 'error'" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- 警告三角形 -->
        <path d="M60 20L95 95H25L60 20Z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
        <!-- 感叹号 -->
        <line x1="60" y1="45" x2="60" y2="70" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
        <circle cx="60" cy="82" r="3" fill="currentColor"/>
        <!-- 底部装饰 -->
        <line x1="35" y1="100" x2="85" y2="100" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </div>

    <!-- 文本内容 -->
    <div class="empty-content">
      <h3 class="empty-title">{{ currentTitle }}</h3>
      <p class="empty-description">{{ currentDescription }}</p>
    </div>

    <!-- 操作按钮 -->
    <el-button 
      v-if="showAction && actionText" 
      type="primary" 
      class="empty-action"
      @click="handleAction"
    >
      {{ actionText }}
    </el-button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-illustration {
  width: 120px;
  height: 120px;
  color: var(--text-tertiary);
  margin-bottom: 24px;
  opacity: 0.7;
}

.empty-illustration svg {
  width: 100%;
  height: 100%;
}

.empty-content {
  margin-bottom: 24px;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.empty-description {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  max-width: 300px;
  line-height: 1.6;
}

.empty-action {
  padding: 10px 24px;
  font-weight: 500;
}

/* 动画效果 */
.empty-illustration {
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .empty-illustration {
    animation: none;
  }
}
</style>
