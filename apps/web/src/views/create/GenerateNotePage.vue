<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Link, Download, Microphone, MagicStick, Check, Loading } from '@element-plus/icons-vue'
import { api } from '../../api/modules'
import PageBlock from '../../components/PageBlock.vue'
import { buildMarkdownName, downloadMarkdownFile } from '../../utils/markdown'
import { readTaskMeta, saveTaskMeta, setActiveTaskId } from './taskMeta'

const MarkdownPreview = defineAsyncComponent(() => import('../../components/markdown/MarkdownPreview.vue'))

const doneTaskStates = new Set(['success', 'succeeded', 'completed', 'done'])
const failedTaskStates = new Set(['failed', 'error', 'timeout'])
const cancelledTaskStates = new Set(['cancelled', 'canceled'])

const route = useRoute()
const router = useRouter()

const taskId = computed(() => String(route.params.taskId ?? ''))
const taskMeta = computed(() => (taskId.value ? readTaskMeta(taskId.value) : undefined))
const sourceUrlFirstValid = computed(() => taskMeta.value?.sourceUrlFirstValid)
const sourceType = computed<'bilibili' | 'web'>(() => {
  return taskMeta.value?.sourceType === 'web' ? 'web' : 'bilibili'
})
const createEntryPath = computed(() => (sourceType.value === 'web' ? '/create/web' : '/create/bilibili'))

const noteTitle = ref(taskMeta.value?.noteTitle ?? '')
const draftId = ref(taskMeta.value?.draftId)

const loading = ref(false)
const polling = ref(false)
const saveDraftLoading = ref(false)
const saveNoteLoading = ref(false)
const cancelLoading = ref(false)
const retryLoading = ref(false)
const autoSaving = ref(false)
const autoSaveDone = ref(false)

const task = ref<{
  status: string
  stage?: string
  progress?: number
  message?: string
  retryable?: boolean
  resultMd?: string
  debug?: {
    keyframeWarnings?: string[]
  }
  error?: string
} | null>(null)
let timer: number | undefined
let pageHideHandler: (() => void) | undefined

function resolveTitle(md: string) {
  const firstHeading = md
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '))
  if (firstHeading) {
    return firstHeading.replace('# ', '').trim()
  }
  return `未命名笔记-${new Date().toISOString().slice(0, 10)}`
}

const normalizedStatus = computed(() => (task.value?.status ?? 'generating').toLowerCase())
const taskStatus = computed<'generating' | 'success' | 'failed' | 'cancelled'>(() => {
  if (cancelledTaskStates.has(normalizedStatus.value)) return 'cancelled'
  if (failedTaskStates.has(normalizedStatus.value)) return 'failed'
  if (doneTaskStates.has(normalizedStatus.value)) return 'success'
  return 'generating'
})

const markdown = computed(() => (taskStatus.value === 'success' ? (task.value?.resultMd ?? '') : ''))
const taskError = computed(() => task.value?.error ?? '任务执行失败，请稍后重试')
const finalTitle = computed(() => noteTitle.value.trim() || resolveTitle(markdown.value))
const canOperate = computed(() => taskStatus.value === 'success' && markdown.value.trim().length > 0)
const canCancel = computed(() => taskStatus.value === 'generating' && !cancelLoading.value)
const canRetry = computed(() => taskStatus.value === 'failed' && Boolean(task.value?.retryable) && !retryLoading.value)
const shouldAutoSaveDraft = computed(() => {
  if (!canOperate.value) return false
  if (autoSaveDone.value || autoSaving.value) return false
  const persisted = taskMeta.value?.persisted
  return persisted !== 'draft' && persisted !== 'note'
})

const statusTagType = computed<'info' | 'success' | 'danger' | 'warning'>(() => {
  if (taskStatus.value === 'success') return 'success'
  if (taskStatus.value === 'cancelled') return 'warning'
  if (taskStatus.value === 'failed') return 'danger'
  return 'info'
})

const statusLabel = computed(() => {
  if (taskStatus.value === 'success') return '已完成'
  if (taskStatus.value === 'cancelled') return '已取消'
  if (taskStatus.value === 'failed') return '执行失败'
  return '生成中'
})

const stageLabelMap: Record<string, string> = {
  pending: '任务排队中',
  validate: '正在校验链接和配置',
  parse: '正在解析视频信息',
  download: '正在下载视频',
  extract_frames: '正在提取关键帧',
  local_transcribe: '正在本地转写视频',
  transcribe: '正在进行视频转录',
  crawl: '正在抓取网页内容',
  merge: '正在整理转录结果',
  generate: '正在生成笔记内容',
  done: '生成完成',
  server: '服务处理异常',
}

const keyframeWarningCount = computed(() => task.value?.debug?.keyframeWarnings?.length ?? 0)

const steps = [
  { title: '解析', description: '解析视频/网页', icon: Link },
  { title: '获取', description: '下载内容', icon: Download },
  { title: '处理', description: '转录/提取', icon: Microphone },
  { title: '生成', description: 'AI 整理', icon: MagicStick },
]

const currentStep = computed(() => {
  const s = (task.value?.stage ?? '').toLowerCase()
  if (doneTaskStates.has(s)) return 4
  if (failedTaskStates.has(s) || cancelledTaskStates.has(s)) return -1

  switch (s) {
    case 'pending':
    case 'validate':
    case 'parse':
      return 0
    case 'download':
    case 'extract_frames':
    case 'crawl':
      return 1
    case 'local_transcribe':
    case 'transcribe':
      return 2
    case 'merge':
    case 'generate':
      return 3
    default:
      return 0
  }
})

const progressValue = computed(() => {
  const raw = Number(task.value?.progress)
  if (!Number.isFinite(raw)) {
    return taskStatus.value === 'success' ? 100 : 0
  }
  return Math.max(0, Math.min(100, Math.floor(raw)))
})

const progressStageLabel = computed(() => {
  const stage = (task.value?.stage ?? '').toLowerCase()
  return stageLabelMap[stage] ?? '正在处理任务'
})

const progressMessage = computed(() => {
  return task.value?.message?.trim() || progressStageLabel.value
})

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

function resolveAbsoluteApiUrl(path: string): string {
  const base = resolveApiBaseUrl()
  if (/^https?:\/\//i.test(base)) {
    return `${base}${path}`
  }
  return `${window.location.origin}${base}${path}`
}

function syncActiveTaskStatus() {
  if (!taskId.value) return
  if (taskStatus.value === 'generating') {
    setActiveTaskId(sourceType.value, taskId.value)
    return
  }
  setActiveTaskId(sourceType.value)
}

async function fetchTask() {
  if (!taskId.value) return
  loading.value = true
  try {
    const response = await api.getTask(taskId.value)
    task.value = response.data
    syncActiveTaskStatus()
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '获取任务失败')
  } finally {
    loading.value = false
  }
}

function stopPolling() {
  if (timer) {
    window.clearInterval(timer)
    timer = undefined
  }
  polling.value = false
}

function startPolling() {
  stopPolling()
  polling.value = true
  timer = window.setInterval(async () => {
    await fetchTask()
    const status = (task.value?.status ?? 'generating').toLowerCase()
    if (doneTaskStates.has(status) || failedTaskStates.has(status) || cancelledTaskStates.has(status)) {
      stopPolling()
    }
  }, 1500)
}

function markPersisted(type: 'draft' | 'note') {
  if (!taskId.value) return
  autoSaveDone.value = true
  saveTaskMeta(taskId.value, {
    ...taskMeta.value,
    draftId: draftId.value,
    noteTitle: noteTitle.value.trim() || undefined,
    persisted: type,
  })
}

async function tryAutoSaveDraft(options?: { silent?: boolean; fireAndForget?: boolean }) {
  if (!shouldAutoSaveDraft.value) {
    return
  }
  const silent = options?.silent === true
  const fireAndForget = options?.fireAndForget === true
  autoSaving.value = true

  try {
    const payload = {
      sourceUrl: taskMeta.value?.sourceText || sourceUrlFirstValid.value,
      title: finalTitle.value,
      contentMd: markdown.value,
    }

    if (fireAndForget) {
      const url = draftId.value
        ? resolveAbsoluteApiUrl(`/drafts/${encodeURIComponent(draftId.value)}`)
        : resolveAbsoluteApiUrl('/drafts')
      const method = draftId.value ? 'PUT' : 'POST'
      void fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      })
      autoSaveDone.value = true
      return
    }

    if (draftId.value) {
      await api.updateDraft(draftId.value, { title: finalTitle.value, contentMd: markdown.value })
    } else {
      const response = await api.createDraft(payload)
      draftId.value = response.data.draftId
    }
    markPersisted('draft')
    if (!silent) {
      ElMessage.success('已自动保存为草稿')
    }
  } catch (error) {
    if (!silent) {
      ElMessage.error((error as { message?: string }).message ?? '自动保存草稿失败')
    }
  } finally {
    autoSaving.value = false
  }
}

async function saveDraft() {
  if (!canOperate.value) {
    ElMessage.warning('生成完成后才可保存草稿')
    return
  }

  saveDraftLoading.value = true
  try {
    if (draftId.value) {
      await api.updateDraft(draftId.value, { title: finalTitle.value, contentMd: markdown.value })
    } else {
      const response = await api.createDraft({
        sourceUrl: taskMeta.value?.sourceText || sourceUrlFirstValid.value,
        title: finalTitle.value,
        contentMd: markdown.value,
      })
      draftId.value = response.data.draftId
    }
    markPersisted('draft')
    ElMessage.success('草稿已保存')
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '保存草稿失败')
  } finally {
    saveDraftLoading.value = false
  }
}

async function saveNote() {
  if (!canOperate.value) {
    ElMessage.warning('生成完成后才可保存笔记')
    return
  }
  if (!sourceUrlFirstValid.value) {
    ElMessage.error('缺少源链接，无法保存为笔记，请回到创作中心重新发起任务')
    return
  }

  saveNoteLoading.value = true
  try {
    await api.createNote({
      title: finalTitle.value,
      sourceUrl: sourceUrlFirstValid.value,
      contentMd: markdown.value,
    })
    markPersisted('note')
    ElMessage.success('笔记已保存')
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '保存笔记失败')
  } finally {
    saveNoteLoading.value = false
  }
}

async function handleCancelTask() {
  if (!canCancel.value || !taskId.value) {
    return
  }
  cancelLoading.value = true
  try {
    await api.cancelTask(taskId.value)
    ElMessage.success('任务已取消')
    await fetchTask()
    stopPolling()
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '取消任务失败')
  } finally {
    cancelLoading.value = false
  }
}

async function handleRetryTask() {
  if (!canRetry.value || !taskId.value) {
    return
  }
  retryLoading.value = true
  try {
    await api.retryTask(taskId.value)
    ElMessage.success('已开始重试生成')
    await fetchTask()
    if (taskStatus.value === 'generating') {
      startPolling()
    }
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '重试任务失败')
  } finally {
    retryLoading.value = false
  }
}

function handleDownload() {
  if (!canOperate.value) {
    ElMessage.warning('任务完成后可下载')
    return
  }
  downloadMarkdownFile(markdown.value, buildMarkdownName(finalTitle.value))
}

onMounted(async () => {
  if (!taskId.value) return
  await fetchTask()
  if (taskStatus.value === 'generating') {
    startPolling()
  }

  pageHideHandler = () => {
    void tryAutoSaveDraft({ silent: true, fireAndForget: true })
  }
  window.addEventListener('pagehide', pageHideHandler)
})

onBeforeRouteLeave(async () => {
  await tryAutoSaveDraft({ silent: true })
})

onBeforeUnmount(() => {
  stopPolling()
  if (pageHideHandler) {
    window.removeEventListener('pagehide', pageHideHandler)
    pageHideHandler = undefined
  }
})
</script>

<template>
  <PageBlock title="生成任务" description="查看任务进度，完成后下载并保存生成内容">
    <template v-if="!taskId">
      <el-button type="primary" @click="router.push(createEntryPath)">返回创作中心</el-button>
    </template>

    <template v-else>
      <div class="page-toolbar generate-task-toolbar">
        <div class="task-meta-row">
          <el-tag effect="dark" :type="statusTagType">{{ statusLabel }}</el-tag>
          <el-text type="info">任务 ID：{{ taskId }}</el-text>
        </div>
        <div class="page-toolbar toolbar-end">
          <el-button v-if="taskStatus === 'success'" @click="handleDownload">下载 .md</el-button>
          <el-button v-if="canCancel" type="danger" :loading="cancelLoading" @click="handleCancelTask">取消任务</el-button>
          <el-button v-if="canRetry" type="primary" :loading="retryLoading" @click="handleRetryTask">重试生成</el-button>
        </div>
      </div>

      <el-alert
        v-if="taskStatus === 'generating'"
        title="任务正在生成中"
        :description="progressMessage"
        type="info"
        :closable="false"
        show-icon
      />
      <el-alert
        v-else-if="taskStatus === 'cancelled'"
        title="任务已取消"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-alert v-else-if="taskStatus === 'failed'" :title="taskError" type="error" :closable="false" show-icon />

      <el-space v-if="taskStatus === 'generating' && (polling || loading)">
        <el-text type="info">正在获取最新任务状态...</el-text>
      </el-space>

      <div v-if="taskStatus === 'generating'" class="task-progress-panel">
        <el-steps :active="currentStep" finish-status="success" align-center style="margin-bottom: var(--space-8)">
          <el-step v-for="(step, index) in steps" :key="index" :title="step.title" :description="step.description">
            <template #icon>
              <el-icon v-if="index === currentStep" class="is-loading"><Loading /></el-icon>
              <component :is="step.icon" v-else />
            </template>
          </el-step>
        </el-steps>

        <div class="progress-info-row" style="display: flex; justify-content: space-between; margin-bottom: var(--space-2)">
           <el-text type="info" size="small">{{ progressMessage }}</el-text>
           <el-text type="primary" size="small" style="font-family: monospace">{{ progressValue }}%</el-text>
        </div>
        <el-progress 
          :percentage="progressValue" 
          :stroke-width="12" 
          :show-text="false" 
          striped 
          striped-flow 
          :duration="10"
        />
      </div>

      <template v-if="canOperate">
        <el-alert
          v-if="keyframeWarningCount > 0"
          type="warning"
          :closable="false"
          :title="`关键帧阶段出现 ${keyframeWarningCount} 条降级告警，已自动回退并继续生成`"
        />
        <el-alert
          v-if="shouldAutoSaveDraft"
          type="info"
          :closable="false"
          title="若未手动保存，离开或刷新页面时将自动保存为草稿"
        />
        <div class="md-preview">
          <MarkdownPreview :source="markdown" />
        </div>

        <el-space direction="vertical" class="full-width-stack">
          <el-input v-model="noteTitle" placeholder="笔记标题（可选，不填将从 Markdown 自动提取）" />
          <el-alert
            v-if="!sourceUrlFirstValid"
            type="warning"
            :closable="false"
            title="缺少源链接，无法保存为笔记，请回到创作中心重新发起任务"
          />
          <div class="page-toolbar toolbar-end">
            <el-button :loading="saveDraftLoading" @click="saveDraft">保存为草稿</el-button>
            <el-button type="primary" :loading="saveNoteLoading" :disabled="!sourceUrlFirstValid" @click="saveNote">
              保存为笔记
            </el-button>
          </div>
        </el-space>
      </template>
    </template>
  </PageBlock>
</template>

<style scoped>
.generate-task-toolbar {
  position: static;
}

.task-progress-panel {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  margin-top: var(--space-4);
  box-shadow: var(--shadow-sm);
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
