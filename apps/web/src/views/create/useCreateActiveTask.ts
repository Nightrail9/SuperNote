import { ElMessage, ElMessageBox } from 'element-plus'
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'

import { api } from '../../api/modules'
import { getActiveTaskId, removeTaskMeta, setActiveTaskId } from './taskMeta'

type SourceType = 'bilibili' | 'web'

const doneStates = new Set(['success', 'succeeded', 'completed', 'done'])

export function useCreateActiveTask(sourceType: SourceType, buildRoutePath: (taskId: string) => string) {
  const router = useRouter()

  const activeTaskId = ref('')
  const activeTaskRefreshing = ref(false)
  const handledTaskNotices = new Set<string>()
  let activeTaskTimer: number | undefined

  function stopActiveTaskPolling() {
    if (activeTaskTimer) {
      window.clearInterval(activeTaskTimer)
      activeTaskTimer = undefined
    }
  }

  function startActiveTaskPolling() {
    stopActiveTaskPolling()
    activeTaskTimer = window.setInterval(() => {
      void refreshActiveTask()
    }, 3000)
  }

  async function deleteFinishedTask(taskId: string) {
    try {
      await api.deleteTask(taskId)
      removeTaskMeta(taskId)
      ElMessage.success('本次任务已删除')
    } catch (error) {
      ElMessage.error((error as { message?: string }).message ?? '删除任务失败')
    }
  }

  async function notifyTaskFinished(taskId: string, retryableFailed: boolean) {
    if (handledTaskNotices.has(taskId)) {
      return
    }
    handledTaskNotices.add(taskId)

    const routePath = buildRoutePath(taskId)
    const title = retryableFailed ? '任务处理失败' : '任务已处理完成'
    const message = retryableFailed
      ? '任务在 AI 笔记整理阶段失败。你可以前往任务页执行重试，或删除本次任务内容。'
      : '任务已处理完成。你可以前往查看生成结果，或删除本次任务内容。'

    try {
      await ElMessageBox.confirm(message, title, {
        type: retryableFailed ? 'warning' : 'success',
        confirmButtonText: retryableFailed ? '前往任务页重试' : '前往查看',
        cancelButtonText: '删除本次任务',
        distinguishCancelAndClose: true,
        closeOnClickModal: false,
        closeOnPressEscape: false,
        showClose: false,
      })
      await router.push(routePath)
    } catch (action) {
      if (action === 'cancel') {
        await deleteFinishedTask(taskId)
      }
    }
  }

  async function refreshActiveTask() {
    if (activeTaskRefreshing.value) {
      return
    }
    activeTaskRefreshing.value = true
    const taskId = getActiveTaskId(sourceType)
    activeTaskId.value = taskId ?? ''
    if (!taskId) {
      stopActiveTaskPolling()
      activeTaskRefreshing.value = false
      return
    }
    startActiveTaskPolling()
    try {
      const response = await api.getTask(taskId)
      const status = String(response.data.status ?? '').toLowerCase()
      const stage = String(response.data.stage ?? '').toLowerCase()
      const retryable = Boolean(response.data.retryable)
      const keepGenerating = status === 'generating' || status === 'pending'
      if (!keepGenerating) {
        setActiveTaskId(sourceType)
        activeTaskId.value = ''
        stopActiveTaskPolling()

        if (doneStates.has(status)) {
          await notifyTaskFinished(taskId, false)
          return
        }

        if (status === 'failed' && stage === 'generate' && retryable) {
          await notifyTaskFinished(taskId, true)
        }
      }
    } catch (error) {
      if ((error as { code?: string }).code === 'TASK_NOT_FOUND') {
        setActiveTaskId(sourceType)
        activeTaskId.value = ''
        stopActiveTaskPolling()
      }
      return
    } finally {
      activeTaskRefreshing.value = false
    }
  }

  onBeforeUnmount(() => {
    stopActiveTaskPolling()
  })

  return {
    activeTaskId,
    refreshActiveTask,
  }
}
