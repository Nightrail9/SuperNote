<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageBlock from '../../components/PageBlock.vue'
import { api } from '../../api/modules'
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

function openEditModal(item: PromptConfig) {
  editingId.value = item.id
  form.value = {
    id: item.id,
    name: item.name,
    template: item.template,
    isDefault: item.isDefault,
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
  <PageBlock title="提示词配置" description="管理生成模板与默认提示词，确保不同场景输出风格一致" header-outside show-author-info>
    <div class="prompts-page" v-loading="loading">
      <div class="section-head">
        <div>
          <p class="section-title">提示词模板</p>
          <p class="section-desc">支持新增、编辑、删除，并可指定默认模板</p>
        </div>
        <el-button type="primary" :loading="saving" @click="openCreateModal">添加模板</el-button>
      </div>

      <div class="prompt-table">
        <div class="table-head">
          <div>状态</div>
          <div>模板名称</div>
          <div>内容摘要</div>
          <div>更新时间</div>
          <div class="ops">操作</div>
        </div>

        <div v-for="item in orderedPrompts" :key="item.id" class="table-row" :class="{ active: item.isDefault }">
          <div>
            <el-button size="small" :type="item.isDefault ? 'success' : 'default'" :disabled="item.isDefault || saving" @click="setDefault(item.id)">
              {{ item.isDefault ? '默认' : '设为默认' }}
            </el-button>
          </div>
          <div class="name">{{ item.name }}</div>
          <div class="snippet">{{ item.template.slice(0, 80) || '未填写模板内容' }}</div>
          <div class="time">{{ item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '-' }}</div>
          <div class="ops">
            <el-button text @click="openEditModal(item)">编辑</el-button>
            <el-button text type="danger" :disabled="prompts.length <= 1" @click="removePrompt(item.id)">删除</el-button>
          </div>
        </div>

        <div v-if="orderedPrompts.length === 0" class="empty">暂无提示词模板</div>
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
            <el-input v-model="form.name" placeholder="请输入模板名称" />
          </el-form-item>

          <el-form-item label="模板内容">
            <el-input v-model="form.template" type="textarea" :rows="16" placeholder="请填写完整提示词内容" />
          </el-form-item>

          <el-form-item>
            <el-checkbox v-model="form.isDefault">保存后设为默认模板</el-checkbox>
          </el-form-item>
        </el-form>
      </div>

      <template #footer>
        <div class="modal-actions">
          <el-button @click="closeModal">取消</el-button>
          <el-button type="primary" :loading="saving" @click="savePromptFromModal">保存</el-button>
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

.prompt-table {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.table-head,
.table-row {
  display: grid;
  grid-template-columns: 110px 180px 1fr 180px 120px;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
}

.table-head {
  background: #f6ecdf;
  border-bottom: 1px solid var(--border-soft);
  font-size: 12px;
  font-weight: 600;
  color: #5b4d3c;
}

.table-row {
  border-bottom: 1px solid var(--border-soft);
}

.table-row:last-child {
  border-bottom: none;
}

.table-row.active {
  background: #f3f9f7;
}

.name {
  font-weight: 600;
  color: #2f2a22;
}

.snippet {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.ops {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.empty {
  padding: 24px;
  color: var(--el-text-color-secondary);
  text-align: center;
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

@media (max-width: 960px) {
  .table-head,
  .table-row {
    grid-template-columns: 110px 1fr 1fr;
  }

  .time,
  .table-head .time,
  .ops {
    grid-column: auto;
  }
}

@media (max-width: 720px) {
  .section-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .table-head,
  .table-row {
    grid-template-columns: 1fr;
  }

  .ops {
    justify-content: flex-start;
  }
}
</style>
