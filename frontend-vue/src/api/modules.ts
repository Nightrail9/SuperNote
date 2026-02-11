import type { Draft, IntegrationConfig, ModelConfig, Note, PromptConfig } from '../types/domain'
import { http } from './http'

type ListResponse<T> = {
  items: T[]
  total: number
}

export const api = {
  generateNote(sourceUrl: string, promptId?: string, modelId?: string, sourceType: 'bilibili' | 'web' = 'bilibili') {
    return http.post<{ taskId: string }>('/notes/generate', { sourceUrl, promptId, modelId, sourceType })
  },
  getTask(taskId: string) {
    return http.get<{
      status: string
      stage?: string
      progress?: number
      message?: string
      suggestedTitle?: string
      sourceType?: 'bilibili' | 'web'
      resultMd?: string
      error?: string
    }>(`/tasks/${taskId}`)
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
  testOss(payload: IntegrationConfig['oss']) {
    return http.post<{ ok: boolean; message: string }>('/settings/integrations/oss/test', { oss: payload })
  },
  testTingwu(payload: IntegrationConfig['tingwu']) {
    return http.post<{ ok: boolean; message: string }>('/settings/integrations/tingwu/test', { tingwu: payload })
  },
  testJinaReader(payload: IntegrationConfig['jinaReader']) {
    return http.post<{ ok: boolean; message: string }>('/settings/integrations/jina-reader/test', { jinaReader: payload })
  },
}
