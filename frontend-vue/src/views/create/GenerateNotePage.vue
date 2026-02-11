<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../../api/modules'
import PageBlock from '../../components/PageBlock.vue'
import { buildMarkdownName, downloadMarkdownFile } from '../../utils/markdown'
import { readTaskMeta, saveTaskMeta } from './taskMeta'

const MarkdownPreview = defineAsyncComponent(() => import('../../components/markdown/MarkdownPreview.vue'))

const doneTaskStates = new Set(['success', 'succeeded', 'completed', 'done'])
const failedTaskStates = new Set(['failed', 'error', 'timeout'])

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

const task = ref<{ status: string; stage?: string; progress?: number; message?: string; resultMd?: string; error?: string } | null>(null)
let timer: number | undefined

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
const taskStatus = computed<'generating' | 'success' | 'failed'>(() => {
  if (failedTaskStates.has(normalizedStatus.value)) return 'failed'
  if (doneTaskStates.has(normalizedStatus.value)) return 'success'
  return 'generating'
})

const markdown = computed(() => (taskStatus.value === 'success' ? (task.value?.resultMd ?? '') : ''))
const taskError = computed(() => task.value?.error ?? '任务执行失败，请稍后重试')
const finalTitle = computed(() => noteTitle.value.trim() || resolveTitle(markdown.value))
const canOperate = computed(() => taskStatus.value === 'success' && markdown.value.trim().length > 0)
const statusTagType = computed<'info' | 'success' | 'danger'>(() => {
  if (taskStatus.value === 'success') return 'success'
  if (taskStatus.value === 'failed') return 'danger'
  return 'info'
})

const statusLabel = computed(() => {
  if (taskStatus.value === 'success') return '已完成'
  if (taskStatus.value === 'failed') return '执行失败'
  return '生成中'
})

const stageLabelMap: Record<string, string> = {
  pending: '任务排队中',
  validate: '正在校验链接和配置',
  transcribe: '正在进行视频转录',
  crawl: '正在抓取网页内容',
  merge: '正在整理转录结果',
  generate: '正在生成笔记内容',
  done: '生成完成',
  server: '服务处理异常',
}

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

async function fetchTask() {
  if (!taskId.value) return
  loading.value = true
  try {
    const response = await api.getTask(taskId.value)
    task.value = response.data
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
    if (doneTaskStates.has(status) || failedTaskStates.has(status)) {
      stopPolling()
    }
  }, 1500)
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
    if (taskId.value) {
      saveTaskMeta(taskId.value, {
        ...taskMeta.value,
        draftId: draftId.value,
        noteTitle: noteTitle.value.trim() || undefined,
      })
    }
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
    if (taskId.value) {
      saveTaskMeta(taskId.value, {
        ...taskMeta.value,
        draftId: draftId.value,
        noteTitle: noteTitle.value.trim() || undefined,
      })
    }
    ElMessage.success('笔记已保存')
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '保存笔记失败')
  } finally {
    saveNoteLoading.value = false
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
})

onBeforeUnmount(() => {
  stopPolling()
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
        <el-button v-if="taskStatus === 'success'" @click="handleDownload">下载 .md</el-button>
      </div>

      <el-alert
        v-if="taskStatus === 'generating'"
        title="任务正在生成中"
        :description="progressMessage"
        type="info"
        :closable="false"
        show-icon
      />
      <el-alert v-else-if="taskStatus === 'failed'" :title="taskError" type="error" :closable="false" show-icon />

      <el-space v-if="taskStatus === 'generating' && (polling || loading)">
        <el-text type="info">正在获取最新任务状态...</el-text>
      </el-space>

      <div v-if="taskStatus === 'generating'" class="task-progress-panel">
        <div class="task-progress-meta">
          <el-text>{{ progressStageLabel }}</el-text>
          <el-text type="info">{{ progressValue }}%</el-text>
        </div>
        <el-progress :percentage="progressValue" :stroke-width="10" :show-text="false" />
      </div>

      <template v-if="canOperate">
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
</style>
