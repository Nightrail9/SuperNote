<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'

import { api } from '../../api/modules'
import HistoryResizableTable from '../../components/history/HistoryResizableTable.vue'
import PageBlock from '../../components/PageBlock.vue'
import type { PromptConfig } from '../../types/domain'
import { toArrayData } from '../../utils/api-data'

type PromptForm = {
  id: string
  name: string
  template: string
  isDefault: boolean
}

function makePromptId() {
  return `prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const loading = ref(false)
const saving = ref(false)
const prompts = ref<PromptConfig[]>([])
const showModal = ref(false)
const editingId = ref<string | null>(null)
const form = ref<PromptForm>({ id: '', name: '', template: '', isDefault: false })

const PROMPT_FIXED_BODY_ROWS = 7
const tableColumns = [
  { key: 'status', label: '状态', minWidth: 118, flex: 1.1 },
  { key: 'name', label: '模板名称', minWidth: 220, flex: 1.35 },
  { key: 'snippet', label: '内容摘要', minWidth: 380, flex: 2.2 },
  { key: 'updatedAt', label: '更新时间', minWidth: 210, flex: 1.25 },
  { key: 'actions', label: '操作', minWidth: 160, flex: 1, freeze: 'right' as const, align: 'center' as const },
]

const orderedPrompts = computed(() => {
  return [...prompts.value].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1
    if (!a.isDefault && b.isDefault) return 1
    return a.name.localeCompare(b.name)
  })
})

function ensureDefault(list: PromptConfig[]): PromptConfig[] {
  if (list.length === 0) return list
  if (list.some((item) => item.isDefault)) return list
  return list.map((item, index) => ({ ...item, isDefault: index === 0 }))
}

async function loadPrompts() {
  loading.value = true
  try {
    const response = await api.getPrompts()
    const next = toArrayData<PromptConfig>(response.data)
    prompts.value = ensureDefault(next)
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '加载提示词失败')
  } finally {
    loading.value = false
  }
}

async function persistPrompts(next: PromptConfig[], successText: string) {
  if (next.length === 0) {
    ElMessage.warning('至少保留一个提示词模板')
    return false
  }

  const payload = ensureDefault(next).map((item) => ({
    ...item,
    name: item.name.trim(),
    template: item.template,
    updatedAt: new Date().toISOString(),
    variables: [],
  }))

  saving.value = true
  try {
    await api.updatePrompts(payload)
    ElMessage.success(successText)
    await loadPrompts()
    return true
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '保存失败')
    return false
  } finally {
    saving.value = false
  }
}

function openCreateModal() {
  editingId.value = null
  form.value = {
    id: makePromptId(),
    name: '新提示词模板',
    template: '',
    isDefault: false,
  }
  showModal.value = true
}

function openEditModal(item: PromptConfig | Record<string, any>) {
  const target = item as PromptConfig
  editingId.value = target.id
  form.value = {
    id: target.id,
    name: target.name,
    template: target.template,
    isDefault: target.isDefault,
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingId.value = null
}

async function setDefault(id: string) {
  const next = prompts.value.map((item) => ({ ...item, isDefault: item.id === id }))
  await persistPrompts(next, '默认提示词已更新')
}

async function removePrompt(id: string) {
  if (prompts.value.length <= 1) {
    ElMessage.warning('至少保留一个提示词模板')
    return
  }
  const ok = window.confirm('确定删除该提示词模板吗？')
  if (!ok) return
  const next = prompts.value.filter((item) => item.id !== id)
  await persistPrompts(next, '提示词模板已删除')
}

async function savePromptFromModal() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请填写模板名称')
    return
  }
  if (!form.value.template.trim()) {
    ElMessage.warning('请填写模板内容')
    return
  }
  const duplicated = prompts.value.some((item) => item.name.trim() === form.value.name.trim() && item.id !== editingId.value)
  if (duplicated) {
    ElMessage.warning('模板名称已存在，请更换')
    return
  }

  const record: PromptConfig = {
    id: form.value.id,
    name: form.value.name.trim(),
    template: form.value.template,
    variables: [],
    isDefault: form.value.isDefault,
    updatedAt: new Date().toISOString(),
  }

  const next = editingId.value
    ? prompts.value.map((item) => (item.id === editingId.value ? { ...item, ...record } : item))
    : [...prompts.value, record]

  const finalNext = form.value.isDefault
    ? next.map((item) => ({ ...item, isDefault: item.id === record.id }))
    : ensureDefault(next)

  const ok = await persistPrompts(finalNext, editingId.value ? '提示词模板已更新' : '提示词模板已添加')
  if (ok) closeModal()
}

onMounted(() => {
  void loadPrompts()
})
</script>

<template>
  <PageBlock
    title="提示词配置"
    description="管理生成模板与默认提示词，确保不同场景输出风格一致"
    header-outside
    show-author-info
  >
    <div
      v-loading="loading"
      class="prompts-page"
    >
      <div class="section-head">
        <div>
          <p class="section-title">
            提示词模板
          </p>
          <p class="section-desc">
            支持新增、编辑、删除，并可指定默认模板
          </p>
        </div>
        <el-button
          type="primary"
          :loading="saving"
          @click="openCreateModal"
        >
          添加模板
        </el-button>
      </div>

      <div class="prompts-table-wrap">
        <HistoryResizableTable
          :rows="orderedPrompts"
          :columns="tableColumns"
          :loading="loading"
          :fixed-body-rows="PROMPT_FIXED_BODY_ROWS"
          :max-body-rows="PROMPT_FIXED_BODY_ROWS"
          empty-text="暂无提示词模板"
        >
          <template #cell-status="{ row }">
            <el-button
              size="small"
              :type="row.isDefault ? 'success' : 'default'"
              :disabled="row.isDefault || saving"
              @click="setDefault(row.id)"
            >
              {{ row.isDefault ? '默认' : '设为默认' }}
            </el-button>
          </template>

          <template #cell-name="{ row }">
            <el-text class="name-text">
              {{ row.name }}
            </el-text>
          </template>

          <template #cell-snippet="{ row }">
            <el-tooltip
              :content="row.template || '未填写模板内容'"
              placement="top-start"
              :show-after="200"
            >
              <el-text class="snippet-text">
                {{ row.template?.slice(0, 80) || '未填写模板内容' }}
              </el-text>
            </el-tooltip>
          </template>

          <template #cell-updatedAt="{ row }">
            <el-text class="time-text">
              {{ row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '-' }}
            </el-text>
          </template>

          <template #cell-actions="{ row }">
            <div class="table-actions">
              <el-button
                text
                @click="openEditModal(row)"
              >
                编辑
              </el-button>
              <el-button
                text
                type="danger"
                :disabled="prompts.length <= 1"
                @click="removePrompt(row.id)"
              >
                删除
              </el-button>
            </div>
          </template>
        </HistoryResizableTable>
      </div>
    </div>

    <el-dialog
      v-model="showModal"
      :title="editingId ? '编辑提示词模板' : '添加提示词模板'"
      width="760px"
      append-to-body
      :teleported="true"
      align-center
      destroy-on-close
      @closed="closeModal"
    >
      <div class="modal-form">
        <el-form label-position="top">
          <el-form-item label="模板名称">
            <el-input
              v-model="form.name"
              placeholder="请输入模板名称"
            />
          </el-form-item>

          <el-form-item label="模板内容">
            <el-input
              v-model="form.template"
              type="textarea"
              :rows="16"
              placeholder="请填写完整提示词内容"
            />
          </el-form-item>

          <el-form-item>
            <el-checkbox v-model="form.isDefault">
              保存后设为默认模板
            </el-checkbox>
          </el-form-item>
        </el-form>
      </div>

      <template #footer>
        <div class="modal-actions">
          <el-button @click="closeModal">
            取消
          </el-button>
          <el-button
            type="primary"
            :loading="saving"
            @click="savePromptFromModal"
          >
            保存
          </el-button>
        </div>
      </template>
    </el-dialog>
  </PageBlock>
</template>

<style scoped>
.prompts-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #2f2a22;
}

.section-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.prompts-table-wrap {
  min-height: 0;
}

.name-text {
  font-weight: 600;
  color: #2f2a22;
}

.snippet-text {
  color: var(--el-text-color-secondary);
}

.time-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.table-actions {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.modal-form {
  max-height: min(62vh, 680px);
  overflow: auto;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 720px) {
  .section-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
