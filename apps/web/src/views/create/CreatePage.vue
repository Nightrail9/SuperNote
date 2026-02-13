<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../../api/modules'
import { getActiveTaskId, saveTaskMeta, setActiveTaskId } from './taskMeta'
import { useTaskConfigOptions } from './useTaskConfigOptions'
import type { LocalTranscriberConfig, NoteFormat } from '../../types/domain'

type CreateLocationState = {
  draft?: {
    id: string
    title?: string
    sourceUrl?: string
  }
}

type SourceEntry = {
  row: number
  line: string
}

type PreviewItem = {
  row: number
  order: number
  line: string
  valid: boolean
  reason?: string
}

const router = useRouter()
const initialDraft = (window.history.state as CreateLocationState | undefined)?.draft

const sourceText = ref(initialDraft?.sourceUrl ?? '')
const urlError = ref('')
const selectedPromptId = ref<string | undefined>(undefined)
const selectedFormats = ref<NoteFormat[]>([])

const generating = ref(false)
const activeTaskId = ref('')
const activeTaskLoading = ref(false)

const {
  modelsLoading,
  modelSelectOptions,
  defaultModelId,
  promptSelectOptions,
  defaultPromptId,
  refreshTaskConfigOptions,
} = useTaskConfigOptions()

const noteFormatOptions: Array<{ label: string; value: NoteFormat }> = [
  { label: '目录', value: 'toc' },
  { label: '原片截图', value: 'screenshot' },
]

const gpuAccelerated = ref(false)
const localTranscriberConfig = ref<LocalTranscriberConfig | null>(null)

async function loadLocalTranscriberConfig() {
  try {
    const response = await api.getLocalTranscriber()
    localTranscriberConfig.value = response.data
    gpuAccelerated.value = response.data.device === 'cuda'
  } catch {
    // 静默失败，使用默认值
  }
}

async function updateGpuDevice(enabled: boolean) {
  if (!localTranscriberConfig.value) return
  
  const newDevice = enabled ? 'cuda' : 'cpu'
  if (localTranscriberConfig.value.device === newDevice) return
  
  try {
    await api.updateLocalTranscriber({
      ...localTranscriberConfig.value,
      device: newDevice
    })
    localTranscriberConfig.value.device = newDevice
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '更新GPU设置失败')
    gpuAccelerated.value = !enabled
  }
}

watch(gpuAccelerated, (newValue) => {
  void updateGpuDevice(newValue)
})

watch(
  [defaultPromptId, promptSelectOptions],
  ([nextDefaultPromptId, nextPromptOptions]) => {
    if (!nextPromptOptions.length) {
      selectedPromptId.value = undefined
      return
    }
    const hasSelected = selectedPromptId.value
      ? nextPromptOptions.some((item) => item.value === selectedPromptId.value)
      : false
    if (!hasSelected) {
      selectedPromptId.value = nextDefaultPromptId
    }
  },
  { immediate: true }
)

function expandSourceLine(line: string): string[] {
  try {
    const base = new URL(line)
    const pageValue = base.searchParams.get('p')
    if (!pageValue) return [line]

    const rangeMatch = pageValue.match(/^(\d{1,4})\s*[-~～]\s*(\d{1,4})$/)
    if (!rangeMatch) return [line]

    const start = Number(rangeMatch[1])
    const end = Number(rangeMatch[2])
    if (!Number.isInteger(start) || !Number.isInteger(end)) return [line]

    const diff = Math.abs(end - start)
    if (diff > 200) return [line]

    const step = start <= end ? 1 : -1
    const expanded: string[] = []
    for (let page = start; step > 0 ? page <= end : page >= end; page += step) {
      const next = new URL(base.toString())
      next.searchParams.set('p', String(page))
      expanded.push(next.toString())
    }
    return expanded
  } catch {
    return [line]
  }
}

function splitSourceEntries(text: string): SourceEntry[] {
  const rows = text.split('\n')
  const entries: SourceEntry[] = []
  rows.forEach((rowText, rowIndex) => {
    rowText
      .split(/[\s,，]+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const expandedLines = expandSourceLine(line)
        expandedLines.forEach((expandedLine) => {
          entries.push({ row: rowIndex + 1, line: expandedLine })
        })
      })
  })
  return entries
}

function validateBiliUrl(url: string) {
  try {
    const host = new URL(url).hostname
    const ok = host === 'bilibili.com' || host.endsWith('.bilibili.com') || host === 'b23.tv' || host.endsWith('.b23.tv')
    if (!ok) {
      return '仅支持 bilibili.com 或 b23.tv 链接'
    }
    return ''
  } catch {
    return '请输入合法链接'
  }
}

function buildPreviewItems(entries: SourceEntry[]): PreviewItem[] {
  return entries.map((entry, index) => {
    const reason = validateBiliUrl(entry.line)
    if (!reason) {
      return { row: entry.row, order: index + 1, line: entry.line, valid: true }
    }
    return {
      row: entry.row,
      order: index + 1,
      line: entry.line,
      valid: false,
      reason,
    }
  })
}

function handleWindowFocus() {
  void refreshTaskConfigOptions()
  void loadLocalTranscriberConfig()
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void refreshTaskConfigOptions()
    void loadLocalTranscriberConfig()
  }
}

function normalizeSourceText(text: string) {
  return splitSourceEntries(text)
    .map((entry) => entry.line)
    .join('\n')
}

async function handleGenerate() {
  if (modelsLoading.value) {
    ElMessage.info('模型列表加载中，请稍候再试')
    return
  }

  if (!modelSelectOptions.value.length || !defaultModelId.value) {
    ElMessage.warning('未检测到可用模型，请先前往系统配置 > 模型配置启用模型')
    return
  }

  const formattedSourceText = normalizeSourceText(sourceText.value)
  sourceText.value = formattedSourceText

  if (!formattedSourceText.trim()) {
    urlError.value = '请至少输入一条链接'
    return
  }

  const normalizedPreview = buildPreviewItems(splitSourceEntries(formattedSourceText))
  const firstInvalid = normalizedPreview.find((item) => !item.valid)
  if (firstInvalid) {
    urlError.value = `第${firstInvalid.row}行（第${firstInvalid.order}条）：${firstInvalid.reason ?? '链接不合法'}`
    ElMessage.warning('检测到无效链接，请先清理后再生成')
    return
  }

  urlError.value = ''
  generating.value = true
  try {
    const formatsWithGpu = gpuAccelerated.value
      ? [...selectedFormats.value, 'gpu']
      : selectedFormats.value
    const result = await api.generateNote(
      formattedSourceText,
      selectedPromptId.value ?? defaultPromptId.value,
      defaultModelId.value,
      'bilibili',
      formatsWithGpu
    )
    const firstValid = normalizedPreview.find((item) => item.valid)
    saveTaskMeta(result.data.taskId, {
      sourceType: 'bilibili',
      sourceText: sourceText.value,
      sourceUrlFirstValid: firstValid?.line,
      draftId: initialDraft?.id,
      noteTitle: initialDraft?.title,
      modelId: defaultModelId.value,
      promptId: selectedPromptId.value ?? defaultPromptId.value,
      formats: formatsWithGpu,
      gpuAccelerated: gpuAccelerated.value,
    })
    setActiveTaskId('bilibili', result.data.taskId)
    activeTaskId.value = result.data.taskId
    sourceText.value = ''
    urlError.value = ''
    ElMessage.success('生成任务已提交')
    await router.push(`/create/generate/${result.data.taskId}`)
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '创建任务失败')
  } finally {
    generating.value = false
  }
}

async function refreshActiveTask() {
  const taskId = getActiveTaskId('bilibili')
  activeTaskId.value = taskId ?? ''
  if (!taskId) {
    return
  }
  activeTaskLoading.value = true
  try {
    const response = await api.getTask(taskId)
    const status = String(response.data.status ?? '').toLowerCase()
    if (['success', 'failed', 'cancelled', 'done', 'error', 'timeout'].includes(status)) {
      setActiveTaskId('bilibili')
      activeTaskId.value = ''
    }
  } catch {
    return
  } finally {
    activeTaskLoading.value = false
  }
}

async function handleCancelActiveTask() {
  if (!activeTaskId.value) {
    return
  }
  activeTaskLoading.value = true
  try {
    await api.cancelTask(activeTaskId.value)
    ElMessage.success('任务已取消')
    setActiveTaskId('bilibili')
    activeTaskId.value = ''
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '取消任务失败')
  } finally {
    activeTaskLoading.value = false
  }
}

function handleContinueActiveTask() {
  if (!activeTaskId.value) {
    return
  }
  void router.push(`/create/generate/${activeTaskId.value}`)
}

onMounted(() => {
  void refreshTaskConfigOptions()
  void refreshActiveTask()
  void loadLocalTranscriberConfig()
  window.addEventListener('focus', handleWindowFocus)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', handleWindowFocus)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div class="create-page-stack">
    <div class="create-page-hero reveal-step-1">
      <h2 class="page-block-title">B站链接生成笔记</h2>
      <p class="page-desc">输入 B 站链接并选择模型后，开始生成并进入任务页查看进度</p>
      <el-card v-if="activeTaskId" class="active-task-banner" shadow="never">
        <div class="active-task-content">
          <el-icon class="task-icon is-loading"><Loading /></el-icon>
          <div class="task-info">
            <div class="task-title">正在进行笔记生成</div>
            <div class="task-id">任务ID: {{ activeTaskId.slice(0, 8) }}...</div>
          </div>
          <div class="task-actions">
            <el-button size="small" :loading="activeTaskLoading" @click="handleContinueActiveTask">
              <el-icon class="btn-icon"><VideoPlay /></el-icon>继续查看
            </el-button>
            <el-button size="small" type="danger" plain :loading="activeTaskLoading" @click="handleCancelActiveTask">
              <el-icon class="btn-icon"><CircleClose /></el-icon>取消
            </el-button>
          </div>
        </div>
      </el-card>
    </div>

    <div class="create-workspace create-workspace--bili reveal-step-2">
      <el-card class="page-block create-main-panel" shadow="never">
        <el-text tag="strong">视频链接（支持多行）</el-text>
        <ol class="field-intro-list">
          <li>每行输入 1 个 B 站链接，或用空格、逗号分隔多个链接</li>
          <li>支持批量页码：将链接改为 p=27-30 可自动展开</li>
          <li>提交前将自动清洗并验证链接</li>
        </ol>
        <div class="create-source-input-wrap">
          <el-input
            v-model="sourceText"
            class="create-source-input"
            :rows="12"
            type="textarea"
            placeholder="支持一行一个链接，也支持空格/逗号分隔&#10;生成前会自动校验链接合法性"
          />
        </div>
        <el-alert v-if="urlError" class="field-alert" type="error" :closable="false" :title="urlError" show-icon />
        <el-text size="small" type="info">将按系统配置默认项生成；若无可用模型，请先前往系统配置 > 模型配置启用模型</el-text>
      </el-card>

      <el-card class="page-block create-side-panel note-preference-card" shadow="never">
        <div class="note-options-grid">
          <div class="create-option-row">
            <div class="option-title-row">
              <el-text tag="strong">提示词</el-text>
              <el-tag size="small" effect="plain" type="success">可选增强</el-tag>
            </div>
            <el-select v-model="selectedPromptId" clearable placeholder="默认（使用系统默认提示词）">
              <el-option v-for="item in promptSelectOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-text size="small" type="info">支持按场景切换模板内容，如精简、详细或小红书风格</el-text>
          </div>
          <div class="create-option-row">
            <div class="option-title-row">
              <el-text tag="strong">笔记格式</el-text>
              <el-tag size="small" effect="plain">输出控制</el-tag>
            </div>
            <el-checkbox-group v-model="selectedFormats" class="note-format-checks">
              <el-checkbox v-for="item in noteFormatOptions" :key="item.value" :label="item.value">{{ item.label }}</el-checkbox>
            </el-checkbox-group>
            <el-text size="small" type="info">目录用于快速跳读；原片截图会自动替换为对应时间点图片</el-text>
          </div>
          <div class="create-option-row">
            <div class="option-title-row">
              <el-text tag="strong">硬件加速</el-text>
              <el-tag size="small" effect="plain" type="warning">性能优化</el-tag>
            </div>
            <el-checkbox v-model="gpuAccelerated" class="gpu-accelerate-check">启用 GPU 加速</el-checkbox>
            <el-text size="small" type="info">使用显卡加速视频处理，可显著提升生成速度</el-text>
          </div>
        </div>
        <div class="note-generate-action">
          <el-button type="primary" size="large" :loading="generating" @click="handleGenerate">生成笔记</el-button>
          <el-text size="small" type="info" class="generate-hint">建议：长视频勾选"目录"；教程类内容可搭配"原片截图"</el-text>
        </div>
      </el-card>
    </div>

    <div class="create-author-info">
      <p><span class="author-prefix">作者：</span>bobo</p>
      <p><span class="author-prefix">项目：</span>AI笔记工作台</p>
      <p><span class="author-prefix">邮箱：</span>2385227304@qq.com</p>
    </div>
  </div>
</template>

<style scoped>
.create-workspace--bili {
  grid-template-columns: minmax(0, 1.85fr) minmax(320px, 0.95fr);
}

.note-preference-card {
  position: static;
  align-self: stretch;
  height: 100%;
  overflow: hidden;
}

.note-preference-card :deep(.el-card__body) {
  padding: 18px;
  overflow-y: auto;
  max-height: 100%;
}

.note-options-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.create-option-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  background: var(--bg-soft);
}

.option-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.note-format-checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.note-format-checks :deep(.el-checkbox) {
  margin-right: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  background: var(--bg-surface);
  transition: border-color 140ms ease, background-color 140ms ease;
}

.note-format-checks :deep(.el-checkbox.is-checked) {
  border-color: var(--brand);
  background: rgba(39, 103, 73, 0.05);
}

.gpu-accelerate-check {
  margin-right: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  background: var(--bg-surface);
  transition: border-color 140ms ease, background-color 140ms ease;
}

.gpu-accelerate-check.is-checked {
  border-color: var(--accent);
  background: rgba(214, 158, 46, 0.05);
}

.create-generate-row {
  margin-top: 2px;
}

.create-generate-row :deep(.el-button--primary) {
  min-width: 168px;
  font-weight: 600;
}

.note-generate-action {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.note-generate-action :deep(.el-button--primary) {
  min-width: 168px;
  font-weight: 600;
}

.note-generate-action .generate-hint {
  margin-top: 8px;
  text-align: center;
}

.active-task-banner {
  background: linear-gradient(135deg, #e3f2fd 0%, #f0f7ff 100%);
  border: 1px solid #90caf9;
  margin-bottom: 16px;
}

.active-task-banner :deep(.el-card__body) {
  padding: 12px 16px;
}

.active-task-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.task-icon {
  font-size: 24px;
  color: #1976d2;
  flex-shrink: 0;
}

.task-icon.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.task-info {
  flex: 1;
  min-width: 0;
}

.task-title {
  font-weight: 600;
  color: #1565c0;
  font-size: 14px;
}

.task-id {
  font-size: 12px;
  color: #64b5f6;
  margin-top: 2px;
}

.task-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.task-actions .btn-icon {
  margin-right: 4px;
  font-size: 14px;
}

@media (max-width: 900px) {
  .create-workspace--bili {
    grid-template-columns: 1fr;
  }

  .note-preference-card {
    height: auto;
  }

  .note-format-checks {
    grid-template-columns: 1fr;
  }
}
</style>
