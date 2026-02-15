<script setup lang="ts">
import { Link, Download, Microphone, MagicStick, Timer } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import { readTaskMeta, saveTaskMeta, setActiveTaskId } from './taskMeta'
import { api } from '../../api/modules'
import PageBlock from '../../components/PageBlock.vue'
import { buildMarkdownName, downloadMarkdownFile } from '../../utils/markdown'

const MarkdownPreview = defineAsyncComponent(() => import('../../components/markdown/MarkdownPreview.vue'))

const doneTaskStates = new Set(['success', 'succeeded', 'completed', 'done'])
const failedTaskStates = new Set(['failed', 'error', 'timeout'])
const cancelledTaskStates = new Set(['cancelled', 'canceled'])

const route = useRoute()
const router = useRouter()

const taskId = computed(() => String(route.params.taskId ?? ''))
const taskMeta = computed(() => (taskId.value ? readTaskMeta(taskId.value) : undefined))
const sourceUrlFirstValid = computed(() => taskMeta.value?.sourceUrlFirstValid)

const noteTitle = ref(taskMeta.value?.noteTitle ?? '')
const draftId = ref(taskMeta.value?.draftId)

const loading = ref(false)
const polling = ref(false)
const saveDraftLoading = ref(false)
const saveNoteLoading = ref(false)
const cancelLoading = ref(false)
const retryLoading = ref(false)
const refineLoading = ref(false)
const autoSaving = ref(false)
const autoSaveDone = ref(false)
const previewOpen = ref(false)

const task = ref<{
  status: string
  stage?: string
  progress?: number
  message?: string
  retryable?: boolean
  resolvedTitle?: string
  resultMd?: string
  debug?: {
    keyframeWarnings?: string[]
  }
  error?: string
  createdAt?: string
  updatedAt?: string
  elapsedMs?: number
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
const canRefine = computed(() => canOperate.value && !refineLoading.value)
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
  merge: '正在整理转录结果',
  generate: '正在生成笔记内容',
  done: '生成完成',
  server: '服务处理异常',
}

const pipelineSteps = [
  { key: 'parse', title: '解析', description: '提取视频信息', icon: Link },
  { key: 'download', title: '获取', description: '下载与抽帧', icon: Download },
  { key: 'transcribe', title: '处理', description: '转写与整理', icon: Microphone },
  { key: 'generate', title: '生成', description: 'AI 输出笔记', icon: MagicStick },
]

const currentStep = computed(() => {
  const s = (task.value?.stage ?? '').toLowerCase()
  if (doneTaskStates.has(s)) return 3
  if (failedTaskStates.has(s) || cancelledTaskStates.has(s)) return -1
  switch (s) {
    case 'pending':
    case 'validate':
    case 'parse':
      return 0
    case 'download':
    case 'extract_frames':
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

const progressMessage = computed(() => task.value?.message?.trim() || progressStageLabel.value)
const keyframeWarningCount = computed(() => task.value?.debug?.keyframeWarnings?.length ?? 0)
const markdownCharCount = computed(() => markdown.value.replace(/\s+/g, '').length)
const estimatedReadMinutes = computed(() => Math.max(1, Math.round(markdownCharCount.value / 380)))
const totalDurationLabel = computed(() => {
  const elapsedMs = Number(task.value?.elapsedMs)
  if (Number.isFinite(elapsedMs) && elapsedMs >= 0) {
    return formatDuration(elapsedMs)
  }
  const created = Date.parse(task.value?.createdAt ?? '')
  const ended = Date.parse(task.value?.updatedAt ?? '')
  if (!Number.isFinite(created) || !Number.isFinite(ended) || ended < created) {
    return ''
  }
  return formatDuration(ended - created)
})
const durationDisplay = computed(() => totalDurationLabel.value || '—')

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.floor(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}小时${minutes}分钟${seconds}秒`
  }
  if (minutes > 0) {
    return `${minutes}分${seconds}秒`
  }
  return `${seconds}秒`
}

function resolveStepState(index: number) {
  if (taskStatus.value === 'success') return 'done'
  if (taskStatus.value !== 'generating') {
    return index <= Math.max(0, currentStep.value) ? 'done' : 'todo'
  }
  if (index < currentStep.value) return 'done'
  if (index === currentStep.value) return 'active'
  return 'todo'
}

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
    setActiveTaskId('bilibili', taskId.value)
    return
  }
  setActiveTaskId('bilibili')
}

async function fetchTask() {
  if (!taskId.value) return
  loading.value = true
  try {
    const response = await api.getTask(taskId.value)
    task.value = response.data

    if (!noteTitle.value.trim()) {
      const resolvedTitle = response.data.resolvedTitle?.trim()
      if (resolvedTitle) {
        noteTitle.value = resolvedTitle
        saveTaskMeta(taskId.value, {
          ...taskMeta.value,
          noteTitle: resolvedTitle,
        })
      }
    }

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

async function handleRefineTask() {
  if (!canRefine.value || !taskId.value) {
    return
  }
  refineLoading.value = true
  try {
    await api.refineTask(taskId.value)
    autoSaveDone.value = false
    ElMessage.success('已开始再次整理')
    await fetchTask()
    if (taskStatus.value === 'generating') {
      startPolling()
    }
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '再次整理失败')
  } finally {
    refineLoading.value = false
  }
}

function handleDownload() {
  if (!canOperate.value) {
    ElMessage.warning('任务完成后可下载')
    return
  }
  downloadMarkdownFile(markdown.value, buildMarkdownName(finalTitle.value))
}

function openPreview() {
  if (!canOperate.value) {
    ElMessage.warning('任务完成后可预览')
    return
  }
  previewOpen.value = true
}

function closePreview() {
  previewOpen.value = false
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
  <PageBlock
    title="B站生成任务"
    description="查看 B站任务进度，完成后下载并保存生成内容"
  >
    <template v-if="!taskId">
      <el-button
        type="primary"
        @click="router.push('/create/bilibili')"
      >
        返回创作中心
      </el-button>
    </template>

    <template v-else>
      <div
        v-if="taskStatus !== 'success'"
        class="task-header"
      >
        <div class="task-meta-row">
          <el-tag
            effect="dark"
            :type="statusTagType"
          >
            {{ statusLabel }}
          </el-tag>
        </div>
        <div class="page-toolbar toolbar-end">
          <el-button
            v-if="canCancel"
            type="danger"
            :loading="cancelLoading"
            @click="handleCancelTask"
          >
            取消任务
          </el-button>
          <el-button
            v-if="canRetry"
            type="primary"
            :loading="retryLoading"
            @click="handleRetryTask"
          >
            重试生成
          </el-button>
        </div>
      </div>

      <div
        v-if="canOperate"
        class="card-corner-actions"
      >
        <el-button
          class="corner-btn-refine"
          :loading="refineLoading"
          @click="handleRefineTask"
        >
          重新AI整理
        </el-button>
        <el-button
          text
          class="corner-btn-download"
          @click="handleDownload"
        >
          下载 .md
        </el-button>
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
      <el-alert
        v-else-if="taskStatus === 'failed'"
        :title="taskError"
        type="error"
        :closable="false"
        show-icon
      />

      <el-card
        v-if="taskStatus === 'generating'"
        shadow="never"
        class="progress-card"
      >
        <div class="progress-head">
          <div class="progress-head-copy">
            <el-text tag="strong">
              B站视频处理流程
            </el-text>
            <el-text
              size="small"
              type="info"
            >
              {{ progressStageLabel }}
            </el-text>
          </div>
          <span class="progress-percent-chip">{{ progressValue }}%</span>
        </div>
        <el-progress
          :percentage="progressValue"
          :stroke-width="10"
          status=""
        />
        <div class="bili-stage-grid">
          <div
            v-for="(step, index) in pipelineSteps"
            :key="step.key"
            class="bili-stage-item"
            :class="`is-${resolveStepState(index)}`"
          >
            <el-icon class="stage-icon">
              <component :is="step.icon" />
            </el-icon>
            <div class="stage-copy">
              <span class="stage-title">{{ step.title }}</span>
              <span class="stage-desc">{{ step.description }}</span>
            </div>
          </div>
        </div>
        <div class="progress-message-strip">
          {{ progressMessage }}
        </div>
      </el-card>

      <template v-if="canOperate">
        <el-alert
          v-if="keyframeWarningCount > 0"
          type="warning"
          :closable="false"
          :title="`关键帧阶段出现 ${keyframeWarningCount} 条降级告警，已自动回退并继续生成`"
        />

        <div class="result-finish-shell">
          <el-card
            shadow="never"
            class="result-complete-card"
          >
            <div class="result-complete-main">
              <div class="result-complete-head">
                <el-tag
                  effect="dark"
                  type="success"
                  size="small"
                >
                  完成
                </el-tag>
                <el-text type="info">
                  B站视频笔记生成完成，可继续整理或直接发布
                </el-text>
              </div>
              <el-text
                tag="strong"
                size="large"
              >
                任务已完成，内容已可用
              </el-text>
              <div class="result-meta-chips">
                <span class="result-meta-chip">内容字数约 {{ markdownCharCount }}</span>
                <span class="result-meta-chip">预计阅读 {{ estimatedReadMinutes }} 分钟</span>
              </div>
            </div>
          </el-card>

          <div class="result-action-panel">
            <div class="result-action-head">
              <div class="result-action-head-copy">
                <el-text tag="strong">
                  结果处理
                </el-text>
                <el-text
                  size="small"
                  type="info"
                >
                  建议先预览，再保存为笔记
                </el-text>
              </div>
            </div>
            <el-input
              v-model="noteTitle"
              class="result-title-input"
              placeholder="笔记标题（可选，不填将从 Markdown 自动提取）"
            />
            <div class="result-core-actions">
              <el-button @click="openPreview">
                预览
              </el-button>
              <el-button
                :loading="saveDraftLoading"
                @click="saveDraft"
              >
                保存为草稿
              </el-button>
              <el-button
                type="primary"
                :loading="saveNoteLoading"
                :disabled="!sourceUrlFirstValid"
                @click="saveNote"
              >
                保存为笔记
              </el-button>
            </div>
            <el-alert
              v-if="!sourceUrlFirstValid"
              type="warning"
              :closable="false"
              title="缺少源链接，无法保存为笔记，请回到创作中心重新发起任务"
            />
          </div>
          <div class="result-duration-note">
            <el-icon class="result-duration-icon">
              <Timer />
            </el-icon>
            <span class="result-duration-label">本次生成总花费时长：</span>
            <strong class="result-duration-value">{{ durationDisplay }}</strong>
          </div>
        </div>

        <el-dialog
          v-model="previewOpen"
          title="生成结果预览"
          width="72%"
          align-center
          append-to-body
          class="history-preview-dialog task-preview-dialog"
          :z-index="3000"
          :close-on-click-modal="false"
          @closed="closePreview"
        >
          <el-card
            shadow="never"
            class="history-preview-card task-preview-card"
          >
            <div class="history-preview-body">
              <MarkdownPreview
                v-if="previewOpen"
                :source="markdown"
              />
            </div>
          </el-card>
        </el-dialog>
      </template>
    </template>
  </PageBlock>
</template>

<style scoped>
.task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

:deep(.page-block) {
  position: relative;
}

.card-corner-actions {
  position: absolute;
  right: 20px;
  top: 18px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.corner-btn-refine {
  border-color: rgba(217, 119, 6, 0.35);
  background: rgba(255, 247, 237, 0.9);
  color: #9a3412;
}

.corner-btn-refine:hover {
  border-color: rgba(194, 65, 12, 0.55);
  background: rgba(255, 237, 213, 0.95);
  color: #7c2d12;
}

.corner-btn-download {
  color: #9a3412;
  font-weight: 600;
}

.corner-btn-download:hover {
  color: #7c2d12;
}

.progress-card {
  border-radius: var(--radius-md);
  border: 1px solid rgba(234, 88, 12, 0.2);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 247, 237, 0.92) 100%);
}

.progress-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.progress-head-copy {
  display: grid;
  gap: 4px;
}

.progress-percent-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(217, 119, 6, 0.28);
  background: rgba(255, 237, 213, 0.72);
  color: #9a3412;
  font-size: 12px;
  font-weight: 700;
}

.bili-stage-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
  margin: var(--space-4) 0 var(--space-3);
}

.bili-stage-item {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(255, 255, 255, 0.75);
  padding: 10px;
}

.bili-stage-item.is-active {
  border-color: rgba(234, 88, 12, 0.5);
  box-shadow: 0 8px 18px -14px rgba(234, 88, 12, 0.7);
}

.bili-stage-item.is-done {
  border-color: rgba(22, 163, 74, 0.4);
}

.stage-icon {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #c2410c;
  background: rgba(251, 146, 60, 0.2);
}

.stage-copy {
  display: grid;
  gap: 2px;
}

.stage-title {
  font-size: 13px;
  font-weight: 600;
}

.stage-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.progress-message-strip {
  margin-top: var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(217, 119, 6, 0.24);
  background: rgba(255, 247, 237, 0.72);
  padding: 8px 10px;
  font-size: 12px;
  color: #9a3412;
}

.result-action-panel {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 251, 235, 0.9) 100%);
  box-shadow: 0 16px 30px -28px rgba(217, 119, 6, 0.5);
}

.result-complete-card {
  border-radius: var(--radius-md);
  border: 1px solid rgba(217, 119, 6, 0.28);
  background: linear-gradient(135deg, rgba(255, 247, 237, 0.95) 0%, rgba(255, 255, 255, 0.98) 100%);
  box-shadow: 0 20px 32px -28px rgba(217, 119, 6, 0.58);
}

.result-complete-main {
  display: grid;
  gap: 10px;
}

.result-finish-shell {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-2);
}

.result-complete-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.result-meta-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.result-meta-chip {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid rgba(217, 119, 6, 0.25);
  background: rgba(255, 237, 213, 0.62);
  color: #9a3412;
  font-size: 12px;
  font-weight: 600;
}

.result-action-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.result-action-head-copy {
  display: grid;
  gap: 2px;
}

.result-core-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.result-core-actions :deep(.el-button) {
  min-width: 112px;
}

.result-core-actions :deep(.el-button--primary) {
  min-width: 136px;
}

.history-preview-card {
  border-radius: 12px;
}

.history-preview-body {
  min-height: 460px;
  max-height: 62vh;
  overflow: auto;
}

.result-title-input {
  width: 100%;
}

.result-duration-note {
  margin-top: -4px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px dashed rgba(217, 119, 6, 0.35);
  background: rgba(255, 247, 237, 0.72);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #9a3412;
  font-size: 12px;
}

.result-duration-icon {
  color: #c2410c;
}

.result-duration-label {
  color: #9a3412;
}

.result-duration-value {
  color: #7c2d12;
}

@media (max-width: 768px) {
  .card-corner-actions {
    position: static;
    margin-top: var(--space-2);
    margin-bottom: var(--space-1);
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .bili-stage-grid {
    grid-template-columns: 1fr;
  }

  .result-action-panel {
    padding: var(--space-3);
  }

  .result-core-actions {
    justify-content: flex-start;
    width: 100%;
  }

  .result-core-actions :deep(.el-button) {
    flex: 1;
    min-width: 0;
  }
}
</style>
