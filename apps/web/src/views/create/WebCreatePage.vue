<script setup lang="ts">
import { Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { getActiveTaskId, readCreatePreferences, saveCreatePreferences, saveTaskMeta, setActiveTaskId } from './taskMeta'
import { useTaskConfigOptions } from './useTaskConfigOptions'
import { api } from '../../api/modules'
import type { NoteFormat } from '../../types/domain'

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
const selectedPromptId = ref<string | undefined>(undefined)
const includeToc = ref(false)

function persistCreatePreferences() {
  saveCreatePreferences('web', {
    promptId: selectedPromptId.value,
    includeToc: includeToc.value,
  })
}

function restoreCreatePreferences() {
  const stored = readCreatePreferences('web')
  if (!stored) {
    return
  }
  if (typeof stored.promptId === 'string') {
    selectedPromptId.value = stored.promptId
  }
  if (typeof stored.includeToc === 'boolean') {
    includeToc.value = stored.includeToc
  }
}

const generating = ref(false)
const {
  modelsLoading,
  modelSelectOptions,
  defaultModelId,
  promptSelectOptions,
  defaultPromptId,
  refreshTaskConfigOptions,
} = useTaskConfigOptions()

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

watch(selectedPromptId, () => {
  persistCreatePreferences()
})

watch(includeToc, () => {
  persistCreatePreferences()
})

function handleWindowFocus() {
  void refreshTaskConfigOptions()
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void refreshTaskConfigOptions()
  }
}

async function handleGenerate() {
  if (activeTaskId.value) {
    await router.push(`/create/web/generate/${activeTaskId.value}`)
    return
  }

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
    const formats: NoteFormat[] = includeToc.value ? ['toc'] : []
    const result = await api.generateNote(
      formattedSourceText,
      selectedPromptId.value ?? defaultPromptId.value,
      defaultModelId.value,
      'web',
      formats
    )
    const firstValid = normalizedPreview.find((item) => item.valid)
    saveTaskMeta(result.data.taskId, {
      sourceType: 'web',
      sourceText: sourceText.value,
      sourceUrlFirstValid: firstValid?.line,
      modelId: defaultModelId.value,
      promptId: selectedPromptId.value ?? defaultPromptId.value,
      formats,
    })
    setActiveTaskId('web', result.data.taskId)
    activeTaskId.value = result.data.taskId
    sourceText.value = ''
    urlError.value = ''
    ElMessage.success('生成任务已提交')
    await router.push(`/create/web/generate/${result.data.taskId}`)
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '创建任务失败')
  } finally {
    generating.value = false
  }
}

const generateButtonType = computed(() => (activeTaskId.value ? 'warning' : 'primary'))
const generateButtonLabel = computed(() => (activeTaskId.value ? '生成中' : '生成笔记'))

async function refreshActiveTask() {
  const taskId = getActiveTaskId('web')
  activeTaskId.value = taskId ?? ''
  if (!taskId) {
    return
  }
  try {
    const response = await api.getTask(taskId)
    const status = String(response.data.status ?? '').toLowerCase()
    if (status !== 'generating' && status !== 'pending') {
      setActiveTaskId('web')
      activeTaskId.value = ''
    }
  } catch (error) {
    if ((error as { code?: string }).code === 'TASK_NOT_FOUND') {
      setActiveTaskId('web')
      activeTaskId.value = ''
    }
    return
  }
}

onMounted(() => {
  restoreCreatePreferences()
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
      <h2 class="page-block-title">
        网页链接生成笔记
      </h2>
      <p class="page-desc">
        输入网页链接并选择模型后，系统将使用 Jina Reader 抓取正文并生成笔记
      </p>
    </div>

    <div class="create-workspace create-workspace--web reveal-step-2">
      <el-card
        class="page-block create-main-panel"
        shadow="never"
      >
        <el-text tag="strong">
          网页链接（支持多行）
        </el-text>
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
        <el-alert
          v-if="urlError"
          class="field-alert"
          type="error"
          :closable="false"
          :title="urlError"
          show-icon
        />
        <el-text
          size="small"
          type="info"
        >
          将按系统配置默认项生成；若无可用模型，请先前往系统配置 > 模型配置启用模型
        </el-text>
      </el-card>

      <el-card
        class="page-block create-side-panel note-preference-card"
        shadow="never"
      >
        <div class="note-options-grid">
          <div class="create-option-row">
            <div class="option-title-row">
              <el-text tag="strong">
                提示词
              </el-text>
              <el-tag
                size="small"
                effect="plain"
                type="success"
              >
                可选增强
              </el-tag>
            </div>
            <el-select
              v-model="selectedPromptId"
              clearable
              placeholder="默认（使用系统默认提示词）"
            >
              <el-option
                v-for="item in promptSelectOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <el-text
              size="small"
              type="info"
            >
              支持按场景切换模板内容，如精简、详细或小红书风格
            </el-text>
          </div>

          <div class="create-option-row">
            <div class="option-title-row">
              <el-text tag="strong">
                笔记格式
              </el-text>
              <el-tag
                size="small"
                effect="plain"
              >
                输出控制
              </el-tag>
            </div>
            <el-checkbox
              v-model="includeToc"
              class="toc-option-check"
            >
              生成目录（TOC）
            </el-checkbox>
            <el-text
              size="small"
              type="info"
            >
              目录用于快速跳读，适合长文档或多段网页内容
            </el-text>
          </div>
        </div>

        <div class="note-generate-action">
          <el-button
            :type="generateButtonType"
            size="large"
            :loading="generating"
            @click="handleGenerate"
          >
            <el-icon
              v-if="activeTaskId"
              class="generate-status-icon is-rotating"
            >
              <Loading />
            </el-icon>
            {{ generateButtonLabel }}
          </el-button>
          <el-text
            size="small"
            type="info"
            class="generate-hint"
          >
            建议：长内容开启目录，便于快速定位章节
          </el-text>
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
.create-workspace--web {
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

.toc-option-check {
  margin-right: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  background: var(--bg-surface);
  transition: border-color 140ms ease, background-color 140ms ease;
}

.toc-option-check.is-checked {
  border-color: var(--brand);
  background: rgba(39, 103, 73, 0.05);
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

.generate-status-icon {
  margin-right: 4px;
}

.generate-status-icon.is-rotating {
  animation: generate-button-spin 1.6s linear infinite;
}

@keyframes generate-button-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .create-workspace--web {
    grid-template-columns: 1fr;
  }

  .note-preference-card {
    height: auto;
  }
}
</style>
