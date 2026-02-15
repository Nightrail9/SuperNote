export type Note = {
  id: string
  title: string
  sourceUrl: string
  contentMd: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export type Draft = {
  id: string
  sourceUrl?: string
  title?: string
  contentMd: string
  lastAutoSavedAt: string
  updatedAt: string
}

export type ModelProvider = 'gemini' | 'chatgpt' | 'openai_compatible'

export type ModelConfig = {
  id: string
  provider: ModelProvider
  enabled: boolean
  isDefault: boolean
  baseUrl?: string
  apiKey?: string
  apiKeyMasked?: string
  modelName: string
  timeoutMs?: number
}

export type PromptConfig = {
  id: string
  name: string
  template: string
  variables: string[]
  isDefault: boolean
  updatedAt: string
}

export type NoteFormat = 'toc' | 'screenshot'

export type IntegrationConfig = {
  jinaReader: {
    endpoint?: string
    apiKey?: string
    apiKeyMasked?: string
    timeoutSec?: number
    noCache?: boolean
  }
}

export type LocalTranscriberConfig = {
  engine: 'whisper_cli'
  command?: string
  ffmpegBin?: string
  model: string
  language: string
  device: 'cpu' | 'cuda'
  cudaChecked: boolean
  cudaAvailable: boolean
  cudaEnabledOnce: boolean
  beamSize: number
  temperature: number
  timeoutMs: number
}

export type VideoUnderstandingConfig = {
  enabled: boolean
  maxFrames: number
  sceneThreshold: number
  perSceneMax: number
  minSceneGapSec: number
  dedupeHashDistance: number
  blackFrameLumaThreshold: number
  blurVarianceThreshold: number
  extractWidth: number
  timeoutMs: number
}

export type VideoUnderstandingPreset = {
  id: string
  label: string
  appliesTo: string
  config: Omit<VideoUnderstandingConfig, 'enabled'>
}
