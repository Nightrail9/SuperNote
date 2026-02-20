import { http } from './http'
import type {
  Draft,
  GeneratedResultItem,
  GenerationMode,
  IntegrationConfig,
  LocalTranscriberConfig,
  NoteFormat,
  ModelConfig,
  Note,
  PromptConfig,
  VideoUnderstandingConfig,
  VideoUnderstandingPreset,
} from '../types/domain'

type ListResponse<T> = {
  items: T[]
  total: number
}

export const api = {
  generateNote(
    sourceUrl: string,
    promptId?: string,
    modelId?: string,
    sourceType: 'bilibili' | 'web' = 'bilibili',
    formats?: NoteFormat[],
    generationMode: GenerationMode = 'merge_all'
  ) {
    return http.post<{ taskId: string }>('/notes/generate', {
      sourceUrl,
      promptId,
      modelId,
      sourceType,
      formats,
      generationMode,
    })
  },
  getTask(taskId: string) {
    return http.get<{
      status: string
      stage?: string
      progress?: number
      message?: string
      retryable?: boolean
      resolvedTitle?: string
      sourceType?: 'bilibili' | 'web'
      generationMode?: GenerationMode
      formats?: NoteFormat[]
      resultItems?: GeneratedResultItem[]
      resultMd?: string
      createdAt?: string
      updatedAt?: string
      elapsedMs?: number
      debug?: {
        keyframeStats?: Array<{
          url: string
          sceneCount: number
          candidateCount: number
          afterBlackFilter: number
          afterBlurFilter: number
          afterDedupe: number
          finalCount: number
          elapsedMs: number
        }>
        keyframeWarnings?: string[]
      }
      error?: string
    }>(`/tasks/${taskId}`)
  },
  cancelTask(taskId: string) {
    return http.post<{ success: boolean; message: string }>(`/tasks/${taskId}/cancel`)
  },
  retryTask(taskId: string) {
    return http.post<{ success: boolean; message: string }>(`/tasks/${taskId}/retry`)
  },
  refineTask(taskId: string) {
    return http.post<{ success: boolean; message: string }>(`/tasks/${taskId}/refine`)
  },
  deleteTask(taskId: string) {
    return http
      .post<{ success: boolean; message: string }>(`/tasks/${taskId}/delete`)
      .catch(() => http.delete<{ success: boolean; message: string }>(`/tasks/${taskId}`))
  },
  createDraft(payload: { sourceUrl?: string; title?: string; contentMd: string }) {
    return http.post<{ draftId: string; updatedAt: string }>('/drafts', payload)
  },
  updateDraft(id: string, payload: { title?: string; contentMd: string }) {
    return http.put<{ updatedAt: string }>(`/drafts/${id}`, payload)
  },
  createNote(payload: { title: string; sourceUrl: string; contentMd: string; tags?: string[] }) {
    return http.post<{ noteId: string; updatedAt: string }>('/notes', payload)
  },
  getNote(id: string) {
    return http.get<Note>(`/notes/${id}`)
  },
  updateNote(id: string, payload: { title?: string; contentMd: string; tags?: string[] }) {
    return http.put<{ updatedAt: string }>(`/notes/${id}`, payload)
  },
  deleteNote(id: string) {
    return http.delete<{ success: boolean }>(`/notes/${id}`)
  },
  listNotes(params?: { page?: number; pageSize?: number; keyword?: string }) {
    return http.get<ListResponse<Note>>('/notes', { params })
  },
  listDrafts(params?: { page?: number; pageSize?: number }) {
    return http.get<ListResponse<Draft>>('/drafts', { params })
  },
  getDraft(id: string) {
    return http.get<Draft>(`/drafts/${id}`)
  },
  deleteDraft(id: string) {
    return http.delete<{ success: boolean }>(`/drafts/${id}`)
  },
  publishDraft(id: string, payload?: { title?: string; tags?: string[] }) {
    return http.post<{ noteId: string }>(`/drafts/${id}/publish`, payload ?? {})
  },
  getModels() {
    return http.get<ModelConfig[]>('/settings/models')
  },
  updateModels(payload: ModelConfig[]) {
    return http.put<{ success: boolean }>('/settings/models', payload)
  },
  detectModels(payload: Partial<ModelConfig>) {
    return http.post<unknown>('/settings/models/detect', payload)
  },
  testModelConnection(payload: Partial<ModelConfig>) {
    return http.post<unknown>('/settings/models/test', payload)
  },
  getPrompts() {
    return http.get<PromptConfig[]>('/settings/prompts')
  },
  updatePrompts(payload: PromptConfig[]) {
    return http.put<{ success: boolean }>('/settings/prompts', payload)
  },
  getIntegrations() {
    return http.get<IntegrationConfig>('/settings/integrations')
  },
  updateIntegrations(payload: IntegrationConfig) {
    return http.put<{ success: boolean }>('/settings/integrations', payload)
  },
  testJinaReader(payload: IntegrationConfig['jinaReader']) {
    return http.post<{ ok: boolean; message: string }>('/settings/integrations/jina-reader/test', { jinaReader: payload })
  },
  getLocalTranscriber() {
    return http.get<LocalTranscriberConfig>('/settings/local-transcriber')
  },
  updateLocalTranscriber(payload: Partial<LocalTranscriberConfig>) {
    return http.put<{ success: boolean; message?: string }>('/settings/local-transcriber', payload)
  },
  testLocalTranscriber(payload: Partial<LocalTranscriberConfig>) {
    return http.post<{ ok: boolean; message: string }>('/settings/local-transcriber/test', payload)
  },
  getVideoUnderstandingPresets() {
    return http.get<{
      items: VideoUnderstandingPreset[]
    }>('/settings/video-understanding/presets')
  },
  getVideoUnderstanding() {
    return http.get<VideoUnderstandingConfig>('/settings/video-understanding')
  },
  updateVideoUnderstanding(payload: Partial<VideoUnderstandingConfig>) {
    return http.put<{ success: boolean }>('/settings/video-understanding', payload)
  },
  envCheck() {
    return http.get<{
      ffmpeg: { ok: boolean; version: string; path: string }
      cuda: { ok: boolean; details: string }
      videoCuda: { ok: boolean; details: string }
      whisper: { ok: boolean; version: string; path: string }
    }>('/settings/env-check')
  },
}
