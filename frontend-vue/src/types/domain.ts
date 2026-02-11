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

export type IntegrationConfig = {
  oss: {
    endpoint: string
    bucket: string
    accessKeyId?: string
    accessKeySecret?: string
    accessKeyIdMasked?: string
    accessKeySecretMasked?: string
    region?: string
  }
  tingwu: {
    appKey?: string
    appKeyMasked?: string
    endpoint?: string
  }
  jinaReader: {
    endpoint?: string
    apiKey?: string
    apiKeyMasked?: string
    timeoutSec?: number
    noCache?: boolean
  }
}
