<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue'
import { MdPreview } from 'md-editor-v3'

const props = defineProps<{
  source: string
}>()

const previewRoot = ref<HTMLElement | null>(null)
const instance = getCurrentInstance()
const editorId = `md-preview-${instance?.uid ?? Math.random().toString(36).slice(2)}`

function resolveApiBaseUrl(): string {
  const raw = String(import.meta.env.VITE_API_BASE_URL ?? '').trim()
  if (!raw) {
    return '/api'
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/$/, '')
  }
  const normalized = raw.startsWith('/') ? raw : `/${raw}`
  return normalized.replace(/\/$/, '') || '/api'
}

function resolveStaticPrefix(): string {
  const apiBase = resolveApiBaseUrl()
  if (/^https?:\/\//i.test(apiBase)) {
    try {
      return `${new URL(apiBase).origin}/static`
    } catch {
      return '/static'
    }
  }
  return '/static'
}

const resolvedSource = computed(() => {
  const markdown = props.source || '暂无内容'
  const staticPrefix = resolveStaticPrefix()
  return markdown.replace(/\]\(\s*(['"]?)(\/static\/[^)\s]+)\1\s*\)/g, (_match, quote: string, urlPath: string) => {
    const absoluteUrl = `${staticPrefix}${urlPath.replace(/^\/static/, '')}`
    return `](${quote}${absoluteUrl}${quote})`
  })
})

function normalizeAnchorText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[`~!@#$%^&*()+=\[\]{}\\|;:'",.<>/?]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function findScrollContainer(root: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = root.parentElement
  while (current) {
    const style = window.getComputedStyle(current)
    if (/(auto|scroll|overlay)/.test(style.overflowY)) {
      return current
    }
    current = current.parentElement
  }
  return null
}

function findHeadingElement(root: HTMLElement, rawHash: string): HTMLElement | null {
  const decoded = decodeURIComponent(rawHash).trim()
  if (!decoded) return null

  const exact = root.querySelector<HTMLElement>(`#${CSS.escape(decoded)}`)
  if (exact) return exact

  const normalizedTarget = normalizeAnchorText(decoded)
  if (!normalizedTarget) return null

  const headings = root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
  for (const heading of headings) {
    const id = heading.id || ''
    if (normalizeAnchorText(id) === normalizedTarget || normalizeAnchorText(heading.textContent || '') === normalizedTarget) {
      return heading
    }
  }

  return null
}

function handlePreviewClick(event: MouseEvent) {
  if (event.defaultPrevented) return
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

  const target = event.target as HTMLElement | null
  const anchor = target?.closest('a[href^="#"]') as HTMLAnchorElement | null
  const root = previewRoot.value
  if (!anchor || !root) return

  const hash = anchor.getAttribute('href')?.slice(1) ?? ''
  if (!hash) return

  const heading = findHeadingElement(root, hash)
  if (!heading) return

  event.preventDefault()

  const scrollContainer = findScrollContainer(root)
  if (!scrollContainer) {
    heading.scrollIntoView({ behavior: 'auto', block: 'start' })
    return
  }

  const containerRect = scrollContainer.getBoundingClientRect()
  const headingRect = heading.getBoundingClientRect()
  const top = scrollContainer.scrollTop + headingRect.top - containerRect.top - 8
  scrollContainer.scrollTo({ top: Math.max(top, 0), behavior: 'auto' })
}

onMounted(() => {
  previewRoot.value?.addEventListener('click', handlePreviewClick, true)
})

onBeforeUnmount(() => {
  previewRoot.value?.removeEventListener('click', handlePreviewClick, true)
})
</script>

<template>
  <div ref="previewRoot" class="markdown-preview-root">
    <MdPreview :editor-id="editorId" :model-value="resolvedSource" preview-theme="default" />
  </div>
</template>
