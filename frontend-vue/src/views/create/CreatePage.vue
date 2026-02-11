<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../../api/modules'
import { saveTaskMeta } from './taskMeta'
import { useTaskConfigOptions } from './useTaskConfigOptions'

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

const generating = ref(false)

const {
  modelsLoading,
  modelSelectOptions,
  defaultModelId,
  defaultPromptId,
  refreshTaskConfigOptions,
} = useTaskConfigOptions()

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
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void refreshTaskConfigOptions()
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
    const result = await api.generateNote(formattedSourceText, defaultPromptId.value, defaultModelId.value, 'bilibili')
    const firstValid = normalizedPreview.find((item) => item.valid)
    saveTaskMeta(result.data.taskId, {
      sourceType: 'bilibili',
      sourceText: sourceText.value,
      sourceUrlFirstValid: firstValid?.line,
      draftId: initialDraft?.id,
      noteTitle: initialDraft?.title,
      modelId: defaultModelId.value,
      promptId: defaultPromptId.value,
    })
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

onMounted(() => {
  void refreshTaskConfigOptions()
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
    </div>

    <div class="create-workspace create-workspace--single reveal-step-2">
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
