<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageBlock from '../../components/PageBlock.vue'
import { api } from '../../api/modules'
import type { IntegrationConfig } from '../../types/domain'

type IntegrationModalType = 'oss' | 'tingwu' | 'jinaReader'

const defaultIntegrations: IntegrationConfig = {
  oss: {
    endpoint: '',
    bucket: '',
    region: '',
    accessKeyId: '',
    accessKeySecret: '',
  },
  tingwu: {
    endpoint: '',
    appKey: '',
  },
  jinaReader: {
    endpoint: 'https://r.jina.ai/',
    apiKey: '',
    timeoutSec: 30,
    noCache: false,
  },
}

function normalizeIntegrations(value: unknown): IntegrationConfig {
  const source = (value && typeof value === 'object' ? (value as Record<string, unknown>) : {}) as Record<string, unknown>
  const raw = source.integrations && typeof source.integrations === 'object' ? (source.integrations as Record<string, unknown>) : source
  const oss = (raw.oss && typeof raw.oss === 'object' ? raw.oss : {}) as Record<string, unknown>
  const tingwu = (raw.tingwu && typeof raw.tingwu === 'object' ? raw.tingwu : {}) as Record<string, unknown>
  const jinaReader = (raw.jinaReader && typeof raw.jinaReader === 'object' ? raw.jinaReader : {}) as Record<string, unknown>

  return {
    oss: {
      ...defaultIntegrations.oss,
      ...oss,
    },
    tingwu: {
      ...defaultIntegrations.tingwu,
      ...tingwu,
    },
    jinaReader: {
      ...defaultIntegrations.jinaReader,
      ...jinaReader,
      timeoutSec:
        typeof jinaReader.timeoutSec === 'number' && Number.isFinite(jinaReader.timeoutSec)
          ? Math.max(3, Math.min(180, Math.floor(jinaReader.timeoutSec)))
          : defaultIntegrations.jinaReader.timeoutSec,
      noCache: typeof jinaReader.noCache === 'boolean' ? jinaReader.noCache : defaultIntegrations.jinaReader.noCache,
    },
  }
}

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)

const form = reactive<IntegrationConfig>(structuredClone(defaultIntegrations))
const masked = reactive({
  ossAccessKeyIdMasked: '',
  ossAccessKeySecretMasked: '',
  tingwuAppKeyMasked: '',
  jinaReaderApiKeyMasked: '',
})

const showModal = ref(false)
const modalType = ref<IntegrationModalType>('oss')
const modalForm = reactive({
  oss: {
    endpoint: '',
    bucket: '',
    region: '',
    accessKeyId: '',
    accessKeySecret: '',
  },
  tingwu: {
    endpoint: '',
    appKey: '',
  },
  jinaReader: {
    endpoint: 'https://r.jina.ai/',
    apiKey: '',
    timeoutSec: 30,
    noCache: false,
  },
})

function getPayload(): IntegrationConfig {
  return {
    oss: {
      endpoint: form.oss.endpoint || '',
      bucket: form.oss.bucket || '',
      region: form.oss.region,
      accessKeyId: form.oss.accessKeyId,
      accessKeySecret: form.oss.accessKeySecret,
    },
    tingwu: {
      endpoint: form.tingwu.endpoint,
      appKey: form.tingwu.appKey,
    },
    jinaReader: {
      endpoint: form.jinaReader.endpoint,
      apiKey: form.jinaReader.apiKey,
      timeoutSec: form.jinaReader.timeoutSec,
      noCache: form.jinaReader.noCache,
    },
  }
}

async function loadIntegrations() {
  loading.value = true
  try {
    const response = await api.getIntegrations()
    const data = normalizeIntegrations(response.data)
    Object.assign(form.oss, data.oss)
    Object.assign(form.tingwu, data.tingwu)
    Object.assign(form.jinaReader, data.jinaReader)
    masked.ossAccessKeyIdMasked = data.oss.accessKeyIdMasked ?? ''
    masked.ossAccessKeySecretMasked = data.oss.accessKeySecretMasked ?? ''
    masked.tingwuAppKeyMasked = data.tingwu.appKeyMasked ?? ''
    masked.jinaReaderApiKeyMasked = data.jinaReader.apiKeyMasked ?? ''
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '加载集成配置失败')
  } finally {
    loading.value = false
  }
}

async function saveIntegrations() {
  saving.value = true
  try {
    await api.updateIntegrations(getPayload())
    ElMessage.success('集成配置已保存')
    await loadIntegrations()
    return true
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '保存失败')
    return false
  } finally {
    saving.value = false
  }
}

const rows = computed(() => {
  return [
    {
      key: 'oss' as const,
      name: '阿里云 OSS',
      endpoint: form.oss.endpoint || '-',
      secret: masked.ossAccessKeyIdMasked || masked.ossAccessKeySecretMasked || '未配置',
      desc: form.oss.bucket ? `Bucket: ${form.oss.bucket}` : 'Bucket 未配置',
    },
    {
      key: 'tingwu' as const,
      name: '通义听悟',
      endpoint: form.tingwu.endpoint || '-',
      secret: masked.tingwuAppKeyMasked || '未配置',
      desc: '语音转写与视频流程依赖',
    },
    {
      key: 'jinaReader' as const,
      name: 'Jina Reader',
      endpoint: form.jinaReader.endpoint || '-',
      secret: masked.jinaReaderApiKeyMasked || '未配置',
      desc: `超时 ${form.jinaReader.timeoutSec ?? 30}s / ${form.jinaReader.noCache ? '绕过缓存' : '允许缓存'}`,
    },
  ]
})

function openModal(type: IntegrationModalType) {
  modalType.value = type
  if (type === 'oss') {
    modalForm.oss.endpoint = form.oss.endpoint || ''
    modalForm.oss.bucket = form.oss.bucket || ''
    modalForm.oss.region = form.oss.region || ''
    modalForm.oss.accessKeyId = ''
    modalForm.oss.accessKeySecret = ''
  }
  if (type === 'tingwu') {
    modalForm.tingwu.endpoint = form.tingwu.endpoint || ''
    modalForm.tingwu.appKey = ''
  }
  if (type === 'jinaReader') {
    modalForm.jinaReader.endpoint = form.jinaReader.endpoint || 'https://r.jina.ai/'
    modalForm.jinaReader.apiKey = ''
    modalForm.jinaReader.timeoutSec = form.jinaReader.timeoutSec ?? 30
    modalForm.jinaReader.noCache = Boolean(form.jinaReader.noCache)
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

async function testInList(type: IntegrationModalType) {
  testing.value = true
  try {
    if (type === 'oss') {
      const response = await api.testOss(getPayload().oss)
      response.data.ok ? ElMessage.success(response.data.message || 'OSS 连接成功') : ElMessage.error(response.data.message || 'OSS 连接失败')
      return
    }
    if (type === 'tingwu') {
      const response = await api.testTingwu(getPayload().tingwu)
      response.data.ok ? ElMessage.success(response.data.message || '听悟连接成功') : ElMessage.error(response.data.message || '听悟连接失败')
      return
    }
    const response = await api.testJinaReader(getPayload().jinaReader)
    response.data.ok ? ElMessage.success(response.data.message || 'Jina Reader 连接成功') : ElMessage.error(response.data.message || 'Jina Reader 连接失败')
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '测试失败')
  } finally {
    testing.value = false
  }
}

async function testInModal() {
  testing.value = true
  try {
    if (modalType.value === 'oss') {
      const payload = {
        ...getPayload().oss,
        endpoint: modalForm.oss.endpoint,
        bucket: modalForm.oss.bucket,
        region: modalForm.oss.region,
        accessKeyId: modalForm.oss.accessKeyId || form.oss.accessKeyId,
        accessKeySecret: modalForm.oss.accessKeySecret || form.oss.accessKeySecret,
      }
      const response = await api.testOss(payload)
      response.data.ok ? ElMessage.success(response.data.message || 'OSS 连接成功') : ElMessage.error(response.data.message || 'OSS 连接失败')
      return
    }

    if (modalType.value === 'tingwu') {
      const payload = {
        endpoint: modalForm.tingwu.endpoint,
        appKey: modalForm.tingwu.appKey || form.tingwu.appKey,
      }
      const response = await api.testTingwu(payload)
      response.data.ok ? ElMessage.success(response.data.message || '听悟连接成功') : ElMessage.error(response.data.message || '听悟连接失败')
      return
    }

    const payload = {
      endpoint: modalForm.jinaReader.endpoint,
      apiKey: modalForm.jinaReader.apiKey || form.jinaReader.apiKey,
      timeoutSec: modalForm.jinaReader.timeoutSec,
      noCache: modalForm.jinaReader.noCache,
    }
    const response = await api.testJinaReader(payload)
    response.data.ok ? ElMessage.success(response.data.message || 'Jina Reader 连接成功') : ElMessage.error(response.data.message || 'Jina Reader 连接失败')
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '测试失败')
  } finally {
    testing.value = false
  }
}

async function saveFromModal() {
  if (modalType.value === 'oss') {
    form.oss.endpoint = modalForm.oss.endpoint
    form.oss.bucket = modalForm.oss.bucket
    form.oss.region = modalForm.oss.region
    if (modalForm.oss.accessKeyId.trim()) form.oss.accessKeyId = modalForm.oss.accessKeyId.trim()
    if (modalForm.oss.accessKeySecret.trim()) form.oss.accessKeySecret = modalForm.oss.accessKeySecret.trim()
  }

  if (modalType.value === 'tingwu') {
    form.tingwu.endpoint = modalForm.tingwu.endpoint
    if (modalForm.tingwu.appKey.trim()) form.tingwu.appKey = modalForm.tingwu.appKey.trim()
  }

  if (modalType.value === 'jinaReader') {
    form.jinaReader.endpoint = modalForm.jinaReader.endpoint
    if (modalForm.jinaReader.apiKey.trim()) form.jinaReader.apiKey = modalForm.jinaReader.apiKey.trim()
    form.jinaReader.timeoutSec = Math.max(3, Math.min(180, Math.floor(Number(modalForm.jinaReader.timeoutSec || 30))))
    form.jinaReader.noCache = Boolean(modalForm.jinaReader.noCache)
  }

  const ok = await saveIntegrations()
  if (ok) closeModal()
}

onMounted(() => {
  void loadIntegrations()
})
</script>

<template>
  <PageBlock title="集成配置" description="统一维护 OSS、听悟与 Jina Reader 等外部能力及密钥信息" header-outside show-author-info>
    <div class="integrations-page" v-loading="loading">
      <div class="section-head">
        <div>
          <p class="section-title">集成服务列表</p>
          <p class="section-desc">统一管理 OSS、通义听悟与 Jina Reader</p>
        </div>
      </div>

      <div class="provider-table integration-table">
        <div class="table-header integration-header">
          <div>集成项</div>
          <div>Endpoint</div>
          <div>密钥状态</div>
          <div>说明</div>
          <div class="col-actions">操作</div>
        </div>

        <div v-for="row in rows" :key="row.key" class="table-row integration-row">
          <div class="provider-name">{{ row.name }}</div>
          <div class="snippet">{{ row.endpoint }}</div>
          <div class="apikey-masked" :class="{ empty: row.secret === '未配置' }">{{ row.secret }}</div>
          <div class="snippet">{{ row.desc }}</div>
          <div class="col-actions">
            <button class="btn-icon" :disabled="testing || saving" @click="testInList(row.key)" title="测试连接">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
            </button>
            <button class="btn-icon" :disabled="saving" @click="openModal(row.key)" title="编辑">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="showModal"
      :title="modalType === 'oss' ? '编辑阿里云 OSS' : modalType === 'tingwu' ? '编辑通义听悟' : '编辑 Jina Reader'"
      width="560px"
      append-to-body
      :teleported="true"
      align-center
      destroy-on-close
      @closed="closeModal"
    >
      <div class="modal-body" v-if="modalType === 'oss'">
        <div class="form-group">
          <label>Endpoint</label>
          <input v-model="modalForm.oss.endpoint" class="form-input" placeholder="oss-cn-hangzhou.aliyuncs.com" />
        </div>
        <div class="form-group">
          <label>Bucket</label>
          <input v-model="modalForm.oss.bucket" class="form-input" placeholder="your-bucket" />
        </div>
        <div class="form-group">
          <label>Region</label>
          <input v-model="modalForm.oss.region" class="form-input" placeholder="oss-cn-hangzhou" />
        </div>
        <div class="form-group">
          <label>AccessKeyId</label>
          <input v-model="modalForm.oss.accessKeyId" class="form-input" :placeholder="masked.ossAccessKeyIdMasked || 'AK***'" />
        </div>
        <div class="form-group">
          <label>AccessKeySecret</label>
          <input v-model="modalForm.oss.accessKeySecret" class="form-input" :placeholder="masked.ossAccessKeySecretMasked || '***'" />
        </div>
      </div>

      <div class="modal-body" v-else-if="modalType === 'tingwu'">
        <div class="form-group">
          <label>Endpoint</label>
          <input v-model="modalForm.tingwu.endpoint" class="form-input" placeholder="tingwu.cn-beijing.aliyuncs.com" />
        </div>
        <div class="form-group">
          <label>AppKey</label>
          <input v-model="modalForm.tingwu.appKey" class="form-input" :placeholder="masked.tingwuAppKeyMasked || 'app_key'" />
        </div>
      </div>

      <div class="modal-body" v-else>
        <div class="form-group">
          <label>Endpoint</label>
          <input v-model="modalForm.jinaReader.endpoint" class="form-input" placeholder="https://r.jina.ai/" />
        </div>
        <div class="form-group">
          <label>API Key</label>
          <input v-model="modalForm.jinaReader.apiKey" class="form-input" :placeholder="masked.jinaReaderApiKeyMasked || 'jina_xxx（可选）'" />
        </div>
        <div class="form-group">
          <label>Timeout (秒)</label>
          <el-input-number v-model="modalForm.jinaReader.timeoutSec" :min="3" :max="180" :step="1" />
        </div>
        <div class="form-group">
          <label>缓存策略</label>
          <el-switch v-model="modalForm.jinaReader.noCache" active-text="每次绕过缓存" inactive-text="允许缓存" />
        </div>
      </div>

      <template #footer>
        <div class="modal-footer">
          <el-button @click="closeModal">取消</el-button>
          <el-button :loading="testing" @click="testInModal">测试连接</el-button>
          <el-button type="primary" :loading="saving" @click="saveFromModal">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </PageBlock>
</template>

<style scoped>
.integrations-page {
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
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-soft);
  align-items: center;
}

.table-row:last-child {
  border-bottom: none;
}

.integration-header,
.integration-row {
  grid-template-columns: 170px 1.2fr 0.8fr 1fr 120px;
}

.provider-name {
  font-weight: 600;
  color: #2f2a22;
}

.snippet {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  word-break: break-all;
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

.form-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
}

.form-input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: var(--focus-ring);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 980px) {
  .integration-header,
  .integration-row {
    grid-template-columns: 1fr 1fr 130px;
  }

  .integration-header > :nth-child(4),
  .integration-row > :nth-child(4) {
    display: none;
  }
}

@media (max-width: 760px) {
  .section-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .integration-header,
  .integration-row {
    grid-template-columns: 1fr;
  }

  .integration-header > :nth-child(4),
  .integration-row > :nth-child(4) {
    display: block;
  }

  .col-actions {
    justify-content: flex-start;
  }
}
</style>
