<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'

import { api } from '../../api/modules'
import PageBlock from '../../components/PageBlock.vue'
import type { ModelConfig, ModelProvider } from '../../types/domain'
import { toArrayData } from '../../utils/api-data'

type EditableModel = ModelConfig & {
  apiKeyMasked?: string
}

type ModelForm = {
  id: string
  provider: ModelProvider
  apiKey: string
  apiKeyMasked: string
  hasApiKey: boolean
  baseUrl: string
  modelName: string
  enabled: boolean
  isDefault: boolean
}

const providerLabelMap: Record<ModelProvider, string> = {
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
  openai_compatible: 'OpenAI Compatible',
}

const providerOptions: Array<{ value: ModelProvider; label: string }> = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'openai_compatible', label: 'OpenAI Compatible' },
]

function createEmptyModelForm(): ModelForm {
  return {
    id: '',
    provider: 'openai_compatible',
    apiKey: '',
    apiKeyMasked: '',
    hasApiKey: false,
    baseUrl: '',
    modelName: '',
    enabled: true,
    isDefault: false,
  }
}

function shortErrorMessage(error: unknown, fallback: string): string {
  const value = error as { code?: string; message?: string }
  const code = String(value?.code ?? '').toUpperCase()
  const message = String(value?.message ?? '')
  if (code === 'TEST_MODEL_FAILED') return message || '连接测试失败'
  return message || fallback
}

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const testingListId = ref('')
const models = ref<EditableModel[]>([])

const showModelModal = ref(false)
const modelEditingId = ref<string | null>(null)
const modelForm = ref<ModelForm>(createEmptyModelForm())

const orderedModels = computed(() => {
  return [...models.value].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1
    if (!a.isDefault && b.isDefault) return 1
    if (a.enabled && !b.enabled) return -1
    if (!a.enabled && b.enabled) return 1
    return a.id.localeCompare(b.id)
  })
})

const baseUrlPlaceholder = computed(() => {
  if (modelForm.value.provider === 'gemini') return '例如: https://generativelanguage.googleapis.com/v1beta'
  return '例如: https://api.openai.com/v1'
})

const modelPlaceholder = computed(() => {
  if (modelForm.value.provider === 'gemini') return '例如: gemini-2.5-flash'
  if (modelForm.value.provider === 'chatgpt') return '例如: gpt-5-mini'
  return '例如: deepseek-chat'
})

function normalizeBaseUrl(input: string): string {
  return input.trim().replace(/\/+$/, '')
}

function isGeminiNativeUrl(input: string): boolean {
  try {
    const url = new URL(input)
    return url.hostname.includes('generativelanguage.googleapis.com')
  } catch {
    return false
  }
}

function normalizeOpenAIBase(input: string): string {
  let normalized = normalizeBaseUrl(input)
  normalized = normalized.replace(/\/(chat\/completions|completions|responses)$/i, '')
  if (/\/v\d+$/i.test(normalized)) return normalized
  return `${normalized}/v1`
}

const requestPreviewUrl = computed(() => {
  const rawBaseUrl = modelForm.value.baseUrl.trim()
  if (!rawBaseUrl) return ''

  if (modelForm.value.provider === 'gemini' && isGeminiNativeUrl(rawBaseUrl)) {
    const normalized = normalizeBaseUrl(rawBaseUrl).replace(/\/openai$/i, '')
    const model = modelForm.value.modelName.trim() || '{model}'
    return `${normalized}/models/${model}:generateContent`
  }

  return `${normalizeOpenAIBase(rawBaseUrl)}/chat/completions`
})

function updateModelForm<K extends keyof ModelForm>(field: K, value: ModelForm[K]) {
  modelForm.value = {
    ...modelForm.value,
    [field]: value,
  }
}

function toModelPayload(list: EditableModel[]): ModelConfig[] {
  return list.map((item) => ({
    id: item.id.trim(),
    provider: item.provider,
    enabled: Boolean(item.enabled),
    isDefault: Boolean(item.isDefault),
    baseUrl: item.baseUrl?.trim() || undefined,
    apiKey: item.apiKey?.trim() || undefined,
    modelName: item.modelName.trim(),
    timeoutMs: item.timeoutMs,
  }))
}

function ensureDefaultModel(list: EditableModel[]): EditableModel[] {
  if (list.length === 0) return list
  if (list.some((item) => item.isDefault)) return list
  return list.map((item, index) => ({ ...item, isDefault: index === 0 }))
}

async function loadAll() {
  loading.value = true
  try {
    const modelsRes = await api.getModels()
    const nextModels = toArrayData<ModelConfig>(modelsRes.data).map((item) => ({
      ...item,
      id: item.id,
      provider: item.provider,
      modelName: item.modelName ?? '',
      baseUrl: item.baseUrl ?? '',
      apiKeyMasked: item.apiKeyMasked,
    }))
    models.value = ensureDefaultModel(nextModels)
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '加载配置失败')
  } finally {
    loading.value = false
  }
}

async function persistModels(next: EditableModel[], successMessage: string) {
  const payload = toModelPayload(ensureDefaultModel(next))
  if (payload.length === 0) {
    ElMessage.warning('至少保留一条模型配置')
    return false
  }

  saving.value = true
  try {
    await api.updateModels(payload)
    ElMessage.success(successMessage)
    await loadAll()
    return true
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '保存模型失败')
    return false
  } finally {
    saving.value = false
  }
}

function openCreateModelModal() {
  modelEditingId.value = null
  modelForm.value = createEmptyModelForm()
  showModelModal.value = true
}

function openEditModelModal(item: EditableModel) {
  modelEditingId.value = item.id
  modelForm.value = {
    id: item.id,
    provider: item.provider,
    apiKey: '',
    apiKeyMasked: item.apiKeyMasked || '',
    hasApiKey: Boolean(item.apiKeyMasked),
    baseUrl: item.baseUrl ?? '',
    modelName: item.modelName,
    enabled: Boolean(item.enabled),
    isDefault: Boolean(item.isDefault),
  }
  showModelModal.value = true
}

function closeModelModal() {
  showModelModal.value = false
  modelEditingId.value = null
}

async function activateModel(id: string) {
  const next = models.value.map((item) => ({
    ...item,
    isDefault: item.id === id,
  }))
  await persistModels(next, '默认模型已更新')
}

async function deleteModel(id: string) {
  if (models.value.length <= 1) {
    ElMessage.warning('至少保留一个模型服务')
    return
  }
  const ok = window.confirm(`确定删除模型服务 "${id}" 吗？`)
  if (!ok) return
  const next = models.value.filter((item) => item.id !== id)
  await persistModels(next, '模型服务已删除')
}

async function saveModel() {
  const id = modelForm.value.id.trim()
  if (!id) {
    ElMessage.warning('请填写服务名称')
    return
  }
  if (!modelForm.value.modelName.trim()) {
    ElMessage.warning('请填写模型名称')
    return
  }
  if (!modelEditingId.value && !modelForm.value.apiKey.trim()) {
    ElMessage.warning('新增服务时必须填写 API Key')
    return
  }
  const duplicated = models.value.some((item) => item.id === id && item.id !== modelEditingId.value)
  if (duplicated) {
    ElMessage.warning('服务名称已存在，请更换')
    return
  }

  const record: EditableModel = {
    id,
    provider: modelForm.value.provider,
    enabled: modelForm.value.enabled,
    isDefault: modelForm.value.isDefault,
    baseUrl: modelForm.value.baseUrl.trim() || undefined,
    modelName: modelForm.value.modelName.trim(),
  }

  if (modelForm.value.apiKey.trim()) {
    record.apiKey = modelForm.value.apiKey.trim()
  }

  const next = modelEditingId.value
    ? models.value.map((item) => (item.id === modelEditingId.value ? { ...item, ...record } : item))
    : [...models.value, record]

  const finalNext = modelForm.value.isDefault
    ? next.map((item) => ({ ...item, isDefault: item.id === id }))
    : ensureDefaultModel(next)

  const success = await persistModels(finalNext, modelEditingId.value ? '模型服务已更新' : '模型服务已添加')
  if (success) closeModelModal()
}

async function testModelInModal() {
  testing.value = true
  try {
    const response = await api.testModelConnection({
      id: modelEditingId.value || modelForm.value.id || undefined,
      provider: modelForm.value.provider,
      baseUrl: modelForm.value.baseUrl.trim() || undefined,
      apiKey: modelForm.value.apiKey.trim() || undefined,
      modelName: modelForm.value.modelName.trim() || undefined,
    })
    const data = response.data as { ok?: boolean; message?: string; latencyMs?: number }
    if (data.ok) ElMessage.success(data.message || `连接测试成功（延迟 ${data.latencyMs ?? 0} ms）`)
    else ElMessage.error(data.message || '连接测试失败')
  } catch (error) {
    ElMessage.error(shortErrorMessage(error, '连接测试失败'))
  } finally {
    testing.value = false
  }
}

async function testModelInList(item: EditableModel) {
  testingListId.value = item.id
  try {
    const response = await api.testModelConnection({
      id: item.id,
      provider: item.provider,
      modelName: item.modelName,
      baseUrl: item.baseUrl,
    })
    const data = response.data as { ok?: boolean; message?: string; latencyMs?: number }
    if (data.ok) ElMessage.success(data.message || `连接测试成功（延迟 ${data.latencyMs ?? 0} ms）`)
    else ElMessage.error(data.message || '连接测试失败')
  } catch (error) {
    ElMessage.error(shortErrorMessage(error, '连接测试失败'))
  } finally {
    testingListId.value = ''
  }
}

onMounted(() => {
  void loadAll()
})
</script>

<template>
  <PageBlock
    title="模型配置"
    description="配置模型服务、默认模型与连接状态，供生成流程统一调用"
    header-outside
    show-author-info
  >
    <div
      v-loading="loading"
      class="settings-page"
    >
      <section class="section-block">
        <div class="section-head">
          <div>
            <p class="section-title">
              模型服务配置
            </p>
            <p class="section-desc">
              支持多服务管理、激活默认、编辑、删除和连接测试
            </p>
          </div>
          <el-button
            type="primary"
            :loading="saving"
            @click="openCreateModelModal"
          >
            添加模型
          </el-button>
        </div>

        <div class="provider-table">
          <div class="table-header">
            <div class="col-status">
              状态
            </div>
            <div class="col-name">
              名称
            </div>
            <div class="col-provider">
              类型
            </div>
            <div class="col-model">
              模型
            </div>
            <div class="col-apikey">
              API Key
            </div>
            <div class="col-actions">
              操作
            </div>
          </div>

          <div
            v-for="item in orderedModels"
            :key="item.id"
            class="table-row"
            :class="{ active: item.isDefault }"
          >
            <div class="col-status">
              <button
                class="btn-activate"
                :class="{ active: item.isDefault }"
                :disabled="item.isDefault || saving"
                @click="activateModel(item.id)"
              >
                {{ item.isDefault ? '已激活' : '激活' }}
              </button>
            </div>

            <div class="col-name">
              <span class="provider-name">{{ item.id }}</span>
            </div>
            <div class="col-provider">
              <span class="provider-type">{{ providerLabelMap[item.provider] }}</span>
            </div>
            <div class="col-model">
              <span class="model-name">{{ item.modelName || '未配置' }}</span>
            </div>
            <div class="col-apikey">
              <span
                class="apikey-masked"
                :class="{ empty: !item.apiKeyMasked }"
              >{{ item.apiKeyMasked || '未配置' }}</span>
            </div>

            <div class="col-actions">
              <button
                class="btn-icon"
                :disabled="saving || testingListId === item.id"
                title="测试连接"
                @click="testModelInList(item)"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </button>
              <button
                class="btn-icon"
                :disabled="saving"
                title="编辑"
                @click="openEditModelModal(item)"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                class="btn-icon danger"
                :disabled="saving || models.length <= 1"
                title="删除"
                @click="deleteModel(item.id)"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>

          <div
            v-if="models.length === 0"
            class="empty-hint"
          >
            暂无模型配置，请先添加
          </div>
        </div>
      </section>
    </div>

    <el-dialog
      v-model="showModelModal"
      :title="modelEditingId ? '编辑模型服务' : '添加模型服务'"
      width="560px"
      append-to-body
      :teleported="true"
      align-center
      destroy-on-close
      @closed="closeModelModal"
    >
      <div class="modal-body">
        <div class="form-group">
          <label>服务名称</label>
          <input
            type="text"
            class="form-input"
            :value="modelForm.id"
            placeholder="例如: openai-prod"
            @input="updateModelForm('id', ($event.target as HTMLInputElement).value)"
          >
          <span class="form-hint">唯一标识，用于区分不同模型服务</span>
        </div>

        <div class="form-group">
          <label>类型</label>
          <select
            class="form-select"
            :value="modelForm.provider"
            @change="updateModelForm('provider', ($event.target as HTMLSelectElement).value as ModelProvider)"
          >
            <option
              v-for="opt in providerOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>API Key</label>
          <input
            type="text"
            class="form-input"
            :value="modelForm.apiKey"
            :placeholder="modelEditingId && modelForm.hasApiKey ? modelForm.apiKeyMasked : '输入 API Key'"
            @input="updateModelForm('apiKey', ($event.target as HTMLInputElement).value)"
          >
          <span
            v-if="modelEditingId && modelForm.hasApiKey"
            class="form-hint"
          >已配置 API Key，留空表示不修改</span>
        </div>

        <div class="form-group">
          <label>Base URL</label>
          <input
            type="text"
            class="form-input"
            :value="modelForm.baseUrl"
            :placeholder="baseUrlPlaceholder"
            @input="updateModelForm('baseUrl', ($event.target as HTMLInputElement).value)"
          >
          <span
            v-if="requestPreviewUrl"
            class="form-hint"
          >预览: {{ requestPreviewUrl }}</span>
        </div>

        <div class="form-group">
          <label>模型</label>
          <input
            type="text"
            class="form-input"
            :value="modelForm.modelName"
            :placeholder="modelPlaceholder"
            @input="updateModelForm('modelName', ($event.target as HTMLInputElement).value)"
          >
        </div>

        <div class="form-group">
          <label class="toggle-label">
            <span>启用状态</span>
            <div
              class="toggle-switch"
              :class="{ active: modelForm.enabled }"
              @click="updateModelForm('enabled', !modelForm.enabled)"
            >
              <div class="toggle-slider" />
            </div>
          </label>
        </div>

        <div class="form-group">
          <label class="toggle-label">
            <span>设为默认</span>
            <div
              class="toggle-switch"
              :class="{ active: modelForm.isDefault }"
              @click="updateModelForm('isDefault', !modelForm.isDefault)"
            >
              <div class="toggle-slider" />
            </div>
          </label>
        </div>
      </div>

      <template #footer>
        <div class="modal-footer">
          <el-button @click="closeModelModal">
            取消
          </el-button>
          <el-button
            :loading="testing"
            @click="testModelInModal"
          >
            测试连接
          </el-button>
          <el-button
            type="primary"
            :loading="saving"
            @click="saveModel"
          >
            保存
          </el-button>
        </div>
      </template>
    </el-dialog>
  </PageBlock>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.provider-table {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.table-header {
  display: grid;
  grid-template-columns: 90px 1fr 130px 1fr 1.2fr 120px;
  gap: 10px;
  padding: 12px 14px;
  background: #f6ecdf;
  border-bottom: 1px solid var(--border-soft);
  font-size: 12px;
  font-weight: 600;
  color: #5b4d3c;
}

.table-row {
  display: grid;
  grid-template-columns: 90px 1fr 130px 1fr 1.2fr 120px;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-soft);
  align-items: center;
}

.table-row:last-child {
  border-bottom: none;
}

.table-row.active {
  background: #f3f9f7;
}

.btn-activate {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-secondary);
  cursor: pointer;
}

.btn-activate:hover:not(:disabled) {
  border-color: var(--brand);
  color: var(--brand);
}

.btn-activate.active {
  background: rgba(61, 126, 112, 0.1);
  border-color: rgba(61, 126, 112, 0.45);
  color: var(--brand-strong);
  cursor: default;
}

.provider-name {
  font-weight: 600;
  color: #2f2a22;
}

.provider-type {
  font-size: 12px;
  color: #1f2937;
  background: #f3f4f6;
  border-radius: 4px;
  padding: 3px 8px;
}

.model-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;
  font-size: 12px;
  color: #4d4438;
  background: #f5efe5;
  padding: 2px 6px;
  border-radius: 4px;
}

.apikey-masked {
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;
  color: #5f626a;
  word-break: break-all;
}

.apikey-masked.empty {
  color: #b88a1f;
}

.col-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.btn-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover {
  border-color: var(--brand);
  color: var(--brand);
  background: rgba(61, 126, 112, 0.06);
}

.btn-icon.danger:hover {
  border-color: #ef4444;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.05);
}

.empty-hint {
  padding: 18px 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.modal-body {
  max-height: min(62vh, 640px);
  overflow: auto;
  padding-right: 2px;
}

.form-group {
  margin-bottom: 14px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #2f2a22;
  margin-bottom: 6px;
}

.form-input,
.form-select {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: var(--focus-ring);
}

.form-hint {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 6px;
}

.toggle-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toggle-switch {
  width: 44px;
  height: 24px;
  background: #d1d5db;
  border-radius: 12px;
  position: relative;
  cursor: pointer;
}

.toggle-switch.active {
  background: var(--brand);
}

.toggle-slider {
  width: 20px;
  height: 20px;
  background: #fff;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
}

.toggle-switch.active .toggle-slider {
  transform: translateX(20px);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 980px) {
  .table-header,
  .table-row {
    grid-template-columns: 90px 1fr 1fr 120px;
  }

  .col-provider,
  .col-apikey {
    display: none;
  }
}

@media (max-width: 760px) {
  .section-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .table-header,
  .table-row {
    grid-template-columns: 1fr;
  }

  .col-actions {
    justify-content: flex-start;
  }
}
</style>
