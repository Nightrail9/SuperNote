/**
 * Theme Store
 *
 * 管理应用主题状态，支持亮色/暗色模式手动切换
 * 使用 Pinia 进行状态管理，localStorage 持久化
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'supernote-theme'
const DEFAULT_THEME: Theme = 'light'

/**
 * 从 localStorage 读取主题设置
 */
function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
  } catch {
    // localStorage 不可用
  }
  return null
}

/**
 * 保存主题设置到 localStorage
 */
function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // localStorage 不可用
  }
}

/**
 * 应用主题到 document
 */
function applyThemeToDocument(theme: Theme): void {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }

  // 添加过渡类，使主题切换更平滑
  document.body.classList.add('theme-transition')

  // 300ms 后移除过渡类，避免影响性能
  setTimeout(() => {
    document.body.classList.remove('theme-transition')
  }, 300)
}

export const useThemeStore = defineStore('theme', () => {
  // ============================================================================
  // State
  // ============================================================================

  const theme = ref<Theme>(readStoredTheme() ?? DEFAULT_THEME)
  const isInitialized = ref(false)

  // ============================================================================
  // Getters
  // ============================================================================

  const isDark = computed(() => theme.value === 'dark')
  const isLight = computed(() => theme.value === 'light')

  /**
   * 当前主题标签
   */
  const themeLabel = computed(() => (theme.value === 'dark' ? '暗色' : '亮色'))

  /**
   * 切换后的主题（用于按钮提示）
   */
  const nextThemeLabel = computed(() => (theme.value === 'dark' ? '亮色' : '暗色'))

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * 设置主题
   * @param newTheme - 新主题
   */
  function setTheme(newTheme: Theme): void {
    if (theme.value === newTheme) return

    theme.value = newTheme
    writeStoredTheme(newTheme)
    applyThemeToDocument(newTheme)
  }

  /**
   * 切换主题
   */
  function toggleTheme(): void {
    const newTheme = theme.value === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
  }

  /**
   * 初始化和应用主题
   * 应在应用启动时调用一次
   */
  function initialize(): void {
    if (isInitialized.value) return

    applyThemeToDocument(theme.value)
    isInitialized.value = true
  }

  return {
    // State
    theme,
    isInitialized,

    // Getters
    isDark,
    isLight,
    themeLabel,
    nextThemeLabel,

    // Actions
    setTheme,
    toggleTheme,
    initialize,
  }
})

/**
 * 初始化主题（在应用启动时调用）
 * 可以在 main.ts 中调用
 */
export function initializeTheme(): void {
  const store = useThemeStore()
  store.initialize()
}
