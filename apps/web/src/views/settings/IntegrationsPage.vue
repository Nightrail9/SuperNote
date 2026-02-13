<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageBlock from '../../components/PageBlock.vue'
import { api } from '../../api/modules'
import type { IntegrationConfig, LocalTranscriberConfig, VideoUnderstandingConfig, VideoUnderstandingPreset } from '../../types/domain'

const loading = ref(false)
const savingJina = ref(false)
const testingJina = ref(false)
const savingLocal = ref(false)
const testingLocal = ref(false)
const checkingEnv = ref(false)
const envResults = ref<{
  ffmpeg: { ok: boolean; version: string; path: string }
  cuda: { ok: boolean; details: string }
  whisper: { ok: boolean; version: string; path: string }
} | null>(null)
const savingVideo = ref(false)
const activePresetId = ref('')

const integrations = reactive<IntegrationConfig>({
  jinaReader: {
    endpoint: 'https://r.jina.ai/',
    apiKey: '',
    timeoutSec: 30,
    noCache: false,
  },
})

const localTranscriber = reactive<LocalTranscriberConfig>({
  engine: 'whisper_cli',
  command: 'whisper',
  ffmpegBin: 'tools/ffmpeg/bin/ffmpeg.exe',
  model: 'small',
  language: 'zh',
  device: 'auto',
  beamSize: 5,
  temperature: 0,
  timeoutMs: 1800000,
})

const videoForm = reactive<VideoUnderstandingConfig>({
  enabled: true,
  maxFrames: 24,
  sceneThreshold: 0.3,
  perSceneMax: 2,
  minSceneGapSec: 2,
  dedupeHashDistance: 6,
  blackFrameLumaThreshold: 18,
  blurVarianceThreshold: 80,
  extractWidth: 640,
  timeoutMs: 120000,
})

const videoPresets = ref<VideoUnderstandingPreset[]>([])

const videoQualityLabel = computed(() => {
  if (!videoForm.enabled) return '已关闭'
  if (videoForm.maxFrames >= 30) return '高覆盖'
  if (videoForm.maxFrames >= 20) return '均衡'
  return '高性能'
})

function applyPreset(preset: VideoUnderstandingPreset) {
  Object.assign(videoForm, { ...videoForm, ...preset.config })
  activePresetId.value = preset.id
  ElMessage.success(`已应用预设：${preset.label}`)
}

async function loadAll() {
  loading.value = true
  try {
    const [integrationsResp, localResp, videoResp, presetResp] = await Promise.all([
      api.getIntegrations(),
      api.getLocalTranscriber(),
      api.getVideoUnderstanding(),
      api.getVideoUnderstandingPresets(),
    ])

    if (integrationsResp.data?.jinaReader) {
      Object.assign(integrations.jinaReader, integrationsResp.data.jinaReader)
    }
    Object.assign(localTranscriber, localResp.data)
    Object.assign(videoForm, videoResp.data)
    videoPresets.value = Array.isArray(presetResp.data?.items) ? presetResp.data.items : []
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '加载配置失败')
  } finally {
    loading.value = false
  }
}

async function saveJina() {
  savingJina.value = true
  try {
    await api.updateIntegrations({ jinaReader: integrations.jinaReader })
    ElMessage.success('Jina Reader 配置已保存')
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '保存 Jina Reader 配置失败')
  } finally {
    savingJina.value = false
  }
}

async function testJina() {
  testingJina.value = true
  try {
    const response = await api.testJinaReader(integrations.jinaReader)
    response.data.ok ? ElMessage.success(response.data.message) : ElMessage.error(response.data.message)
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? 'Jina Reader 测试失败')
  } finally {
    testingJina.value = false
  }
}

async function saveLocalTranscriber() {
  savingLocal.value = true
  try {
    await api.updateLocalTranscriber(localTranscriber)
    ElMessage.success('本地转写配置已保存')
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '保存本地转写配置失败')
  } finally {
    savingLocal.value = false
  }
}

async function testLocalTranscriber() {
  testingLocal.value = true
  try {
    const response = await api.testLocalTranscriber(localTranscriber)
    response.data.ok ? ElMessage.success(response.data.message) : ElMessage.error(response.data.message)
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '本地转写测试失败')
  } finally {
    testingLocal.value = false
  }
}

async function checkEnv() {
  checkingEnv.value = true
  try {
    const response = await api.envCheck()
    envResults.value = response.data
    if (response.data.cuda.ok) {
      ElMessage.success('检测到 CUDA 可用！')
    } else {
      ElMessage.warning('未检测到 CUDA，将使用 CPU 进行转写。')
    }
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '环境检测失败')
  } finally {
    checkingEnv.value = false
  }
}

async function saveVideoUnderstanding() {
  savingVideo.value = true
  try {
    await api.updateVideoUnderstanding(videoForm)
    ElMessage.success('关键帧参数已保存')
  } catch (error) {
    ElMessage.error((error as { message?: string }).message ?? '保存关键帧参数失败')
  } finally {
    savingVideo.value = false
  }
}

onMounted(() => {
  void loadAll()
})
</script>

<template>
  <PageBlock title="本地引擎与集成" description="网页模式 + 本地转写 + 关键帧策略" header-outside show-author-info>
    <div class="settings-layout" v-loading="loading">
      <section class="hero-panel">
        <div class="hero-copy">
          <h3>纯本地视频链路已启用</h3>
          <p>视频场景使用本地转写与关键帧分析，网页模式继续使用 Jina Reader。</p>
        </div>
        <div class="hero-metrics">
          <div class="metric-chip">
            <span class="metric-label">转写引擎</span>
            <span class="metric-value">{{ localTranscriber.command }}</span>
          </div>
          <div class="metric-chip">
            <span class="metric-label">关键帧模式</span>
            <span class="metric-value">{{ videoQualityLabel }}</span>
          </div>
          <div class="metric-chip">
            <span class="metric-label">最大帧数</span>
            <span class="metric-value">{{ videoForm.maxFrames }}</span>
          </div>
        </div>
      </section>

      <section class="panel-card">
        <div class="card-heading">
          <div>
            <h4>Jina Reader（网页模式）</h4>
            <p>用于网页链接抓取与正文清洗。</p>
          </div>
          <span class="card-badge">Web</span>
        </div>
        <div class="form-grid two-col">
          <div class="field-item">
            <label>Endpoint</label>
            <input v-model="integrations.jinaReader.endpoint" class="form-input" placeholder="https://r.jina.ai/" />
          </div>
          <div class="field-item">
            <label>API Key（可选）</label>
            <input v-model="integrations.jinaReader.apiKey" class="form-input" placeholder="jina_xxx" />
          </div>
          <div class="field-item compact">
            <label>Timeout (秒)</label>
            <el-input-number v-model="integrations.jinaReader.timeoutSec" :min="3" :max="180" :step="1" />
          </div>
          <div class="field-item compact">
            <label>缓存策略</label>
            <el-switch v-model="integrations.jinaReader.noCache" active-text="绕过缓存" inactive-text="允许缓存" />
          </div>
        </div>
        <div class="action-row right">
          <el-button plain :loading="testingJina" @click="testJina">测试连接</el-button>
          <el-button type="primary" :loading="savingJina" @click="saveJina">保存配置</el-button>
        </div>
      </section>

      <section class="panel-card">
        <div class="card-heading">
          <div>
            <h4>本地转写引擎（B站模式）</h4>
            <p>使用本机命令行转写，不再依赖云端转写服务。</p>
          </div>
          <span class="card-badge">Local ASR</span>
        </div>
        <div class="form-grid three-col">
          <div class="field-item">
            <label>命令</label>
            <input v-model="localTranscriber.command" class="form-input" placeholder="whisper" />
          </div>
          <div class="field-item">
            <label>ffmpeg 路径</label>
            <input v-model="localTranscriber.ffmpegBin" class="form-input" placeholder="tools/ffmpeg/bin/ffmpeg.exe" />
          </div>
          <div class="field-item">
            <label>模型</label>
            <input v-model="localTranscriber.model" class="form-input" placeholder="small" />
          </div>
          <div class="field-item">
            <label>语言</label>
            <input v-model="localTranscriber.language" class="form-input" placeholder="zh" />
          </div>
          <div class="field-item">
            <label>设备</label>
            <el-select v-model="localTranscriber.device" style="width: 100%">
              <el-option label="auto" value="auto" />
              <el-option label="cpu" value="cpu" />
              <el-option label="cuda" value="cuda" />
            </el-select>
          </div>
          <div class="field-item">
            <label>beam size</label>
            <el-input-number v-model="localTranscriber.beamSize" :min="1" :max="10" :step="1" />
          </div>
          <div class="field-item">
            <label>temperature</label>
            <el-input-number v-model="localTranscriber.temperature" :min="0" :max="1" :step="0.1" />
          </div>
          <div class="field-item">
            <label>超时 (ms)</label>
            <el-input-number v-model="localTranscriber.timeoutMs" :min="30000" :max="1800000" :step="1000" />
          </div>
        </div>
        <div v-if="envResults" class="env-check-results">
          <div class="env-item" :class="{ ok: envResults.ffmpeg.ok }">
            <span class="env-label">FFmpeg:</span>
            <span class="env-val">{{ envResults.ffmpeg.ok ? envResults.ffmpeg.version : '未找到' }}</span>
          </div>
          <div class="env-item" :class="{ ok: envResults.whisper.ok }">
            <span class="env-label">Whisper:</span>
            <span class="env-val">{{ envResults.whisper.ok ? envResults.whisper.version : '未找到' }}</span>
          </div>
          <div class="env-item" :class="{ ok: envResults.cuda.ok }">
            <span class="env-label">CUDA 加速:</span>
            <span class="env-val">{{ envResults.cuda.details }}</span>
          </div>
        </div>
        <div class="action-row right">
          <el-button plain :loading="checkingEnv" @click="checkEnv">检测环境 (CUDA/FFmpeg)</el-button>
          <el-button plain :loading="testingLocal" @click="testLocalTranscriber">测试命令</el-button>
          <el-button type="primary" :loading="savingLocal" @click="saveLocalTranscriber">保存配置</el-button>
        </div>
      </section>

      <section class="panel-card">
        <div class="card-heading">
          <div>
            <h4>关键帧策略</h4>
            <p>按场景切分选帧，并叠加去重与黑屏过滤。</p>
          </div>
          <div class="switch-wrap">
            <span class="switch-label">启用关键帧</span>
            <el-switch v-model="videoForm.enabled" />
          </div>
        </div>
        <div class="preset-row">
          <button
            v-for="preset in videoPresets"
            :key="preset.id"
            type="button"
            class="preset-btn"
            :class="{ active: activePresetId === preset.id }"
            @click="applyPreset(preset)"
          >
            {{ preset.label }}（{{ preset.appliesTo }}）
          </button>
        </div>
        <div class="form-grid three-col" :class="{ disabled: !videoForm.enabled }">
          <div class="field-item"><label>最大关键帧数</label><el-input-number v-model="videoForm.maxFrames" :min="4" :max="120" /></div>
          <div class="field-item"><label>场景阈值</label><el-input-number v-model="videoForm.sceneThreshold" :min="0.05" :max="0.95" :step="0.01" /></div>
          <div class="field-item"><label>每场景帧数</label><el-input-number v-model="videoForm.perSceneMax" :min="1" :max="3" /></div>
          <div class="field-item"><label>最小场景间隔(秒)</label><el-input-number v-model="videoForm.minSceneGapSec" :min="0.2" :max="30" :step="0.1" /></div>
          <div class="field-item"><label>去重阈值</label><el-input-number v-model="videoForm.dedupeHashDistance" :min="1" :max="64" /></div>
          <div class="field-item"><label>黑屏亮度阈值</label><el-input-number v-model="videoForm.blackFrameLumaThreshold" :min="0" :max="255" /></div>
          <div class="field-item"><label>清晰度阈值</label><el-input-number v-model="videoForm.blurVarianceThreshold" :min="1" :max="10000" /></div>
          <div class="field-item"><label>抽帧宽度</label><el-input-number v-model="videoForm.extractWidth" :min="160" :max="1920" :step="10" /></div>
          <div class="field-item"><label>超时(ms)</label><el-input-number v-model="videoForm.timeoutMs" :min="15000" :max="600000" :step="1000" /></div>
        </div>
        <div class="action-row right">
          <el-button type="primary" :loading="savingVideo" @click="saveVideoUnderstanding">保存关键帧参数</el-button>
        </div>
      </section>
    </div>
  </PageBlock>
</template>

<style scoped>
.settings-layout {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.panel-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-surface);
  padding: 16px;
  box-shadow: var(--shadow-sm);
  transition: var(--transition-base);
}

.panel-card:hover {
  box-shadow: var(--shadow-md);
  border-color: #cbd5e0;
}

.hero-panel {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  gap: 16px;
  border-radius: 14px;
  padding: 18px;
  background: linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-page) 100%);
  border: 1px solid var(--border);
}

.hero-copy h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary);
}

.hero-copy p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  min-width: 420px;
}

.metric-chip {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.metric-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--brand);
}

.card-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}

.card-heading h4 {
  margin: 0;
  font-size: 15px;
  color: var(--text-primary);
}

.card-heading p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.card-badge {
  border-radius: 999px;
  border: 1px solid var(--border);
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-soft);
}

.switch-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.switch-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.form-grid.two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.form-grid.disabled {
  opacity: 0.55;
  pointer-events: none;
}

.field-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-item label {
  font-size: 12px;
  color: var(--text-secondary);
}

.field-item.compact {
  max-width: 280px;
}

.form-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(39, 103, 73, 0.15);
}

.action-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.action-row.right {
  justify-content: flex-end;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.preset-btn {
  border: 1px solid var(--border);
  background: var(--bg-soft);
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-btn:hover {
  border-color: var(--brand);
  color: var(--brand);
  background: rgba(39, 103, 73, 0.05);
}

.preset-btn.active {
  color: white;
  border-color: var(--brand);
  background: var(--brand);
}

.env-check-results {
  margin-top: 14px;
  padding: 10px 14px;
  background: var(--bg-soft);
  border-radius: 8px;
  border: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.env-item {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.env-item.ok {
  color: var(--brand);
}

.env-item.ok .env-val {
  font-weight: 600;
}

.env-label {
  color: #475569;
}

@media (max-width: 980px) {
  .hero-panel {
    flex-direction: column;
  }

  .hero-metrics {
    min-width: 0;
  }

  .form-grid,
  .form-grid.three-col {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .form-grid,
  .form-grid.three-col {
    grid-template-columns: 1fr;
  }

  .card-heading {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
