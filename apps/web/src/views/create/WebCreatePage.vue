<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../../api/modules'
import { getActiveTaskId, saveTaskMeta, setActiveTaskId } from './taskMeta'
import { useTaskConfigOptions } from './useTaskConfigOptions'

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

function splitSourceEntries(text: string): SourceEntry[] {
  const rows = text.split('\n')
  const entries: SourceEntry[] = []
  rows.forEach((rowText, rowIndex) => {
    rowText
      .split(/[\s,，]+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        entries.push({ row: rowIndex + 1, line })
      })
  })
  return entries
}

function validateWebUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '仅支持 http/https 链接'
    }
    const host = parsed.hostname.toLowerCase()
    if (host === 'bilibili.com' || host.endsWith('.bilibili.com') || host === 'b23.tv' || host.endsWith('.b23.tv')) {
      return '检测到 B 站链接，请切换到“B站链接生成笔记”入口'
    }
    return ''
  } catch {
    return '请输入合法链接'
  }
}

function buildPreviewItems(entries: SourceEntry[]): PreviewItem[] {
  return entries.map((entry, index) => {
    const reason = validateWebUrl(entry.line)
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

function normalizeSourceText(text: string) {
  return splitSourceEntries(text)
    .map((entry) => entry.line)
    .join('\n')
}

const router = useRouter()
const sourceText = ref('')
const urlError = ref('')
const activeTaskId = ref('')
const activeTaskLoading = ref(false)

const generating = ref(false)
const {
  modelsLoading,
  modelSelectOptions,
  defaultModelId,
  defaultPromptId,
  refreshTaskConfigOptions,
} = useTaskConfigOptions()

function handleWindowFocus() {
  void refreshTaskConfigOptions()
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void refreshTaskConfigOptions()
  }
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
    const result = await api.generateNote(formattedSourceText, defaultPromptId.value, defaultModelId.value, 'web')
    const firstValid = normalizedPreview.find((item) => item.valid)
    saveTaskMeta(result.data.taskId, {
      sourceType: 'web',
      sourceText: sourceText.value,
      sourceUrlFirstValid: firstValid?.line,
      modelId: defaultModelId.value,
      promptId: defaultPromptId.value,
    })
    setActiveTaskId('web', result.data.taskId)
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
  const taskId = getActiveTaskId('web')
  activeTaskId.value = taskId ?? ''
  if (!taskId) {
    return
  }
  activeTaskLoading.value = true
  try {
    const response = await api.getTask(taskId)
    const status = String(response.data.status ?? '').toLowerCase()
    if (['success', 'failed', 'cancelled', 'done', 'error', 'timeout'].includes(status)) {
      setActiveTaskId('web')
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
    setActiveTaskId('web')
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
      <h2 class="page-block-title">网页链接生成笔记</h2>
      <p class="page-desc">输入网页链接并选择模型后，系统将使用 Jina Reader 抓取正文并生成笔记</p>
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

    <div class="create-workspace create-workspace--single reveal-step-2">
      <el-card class="page-block create-main-panel" shadow="never">
        <el-text tag="strong">网页链接（支持多行）</el-text>
        <ol class="field-intro-list">
          <li>每行输入 1 个网页链接，或用空格、逗号分隔多个链接</li>
          <li>支持 http/https 链接，提交前会自动清洗和校验</li>
          <li>抓取内容将直接用于大模型生成笔记</li>
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
        <div class="create-main-actions">
          <el-button type="primary" :loading="generating" @click="handleGenerate">生成笔记</el-button>
        </div>
        <el-alert v-if="urlError" class="field-alert" type="error" :closable="false" :title="urlError" show-icon />
        <el-text size="small" type="info">将按系统配置默认项生成；若无可用模型，请先前往系统配置 > 模型配置启用模型</el-text>
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
</style>
