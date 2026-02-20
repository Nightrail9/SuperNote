export type GenerateTaskMeta = {
  sourceType?: 'bilibili' | 'web'
  generationMode?: 'merge_all' | 'per_link'
  sourceText?: string
  sourceUrlFirstValid?: string
  draftId?: string
  noteTitle?: string
  modelId?: string
  promptId?: string
  formats?: string[]
  persisted?: 'draft' | 'note'
}

type SourceType = 'bilibili' | 'web'

export type CreatePreferences = {
  promptId?: string
  formats?: string[]
  includeToc?: boolean
  generationMode?: 'merge_all' | 'per_link'
}

function taskMetaKey(taskId: string) {
  return `supernote-task-meta:${taskId}`
}

function activeTaskKey(sourceType: SourceType) {
  return `supernote-active-task:${sourceType}`
}

function createPreferencesKey(sourceType: SourceType) {
  return `supernote-create-preferences:${sourceType}`
}

let legacyTaskMetaCleaned = false

function cleanLegacyTaskMeta() {
  if (typeof window === 'undefined' || legacyTaskMetaCleaned) {
    return
  }

  try {
    const legacyKeys: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith('bilinote-task-meta:')) {
        legacyKeys.push(key)
      }
    }

    for (const key of legacyKeys) {
      window.localStorage.removeItem(key)
    }
  } catch {
    return
  } finally {
    legacyTaskMetaCleaned = true
  }
}

export function saveTaskMeta(taskId: string, meta: GenerateTaskMeta) {
  if (typeof window === 'undefined' || !taskId) {
    return
  }
  cleanLegacyTaskMeta()
  try {
    window.localStorage.setItem(taskMetaKey(taskId), JSON.stringify(meta))
  } catch {
    return
  }
}

export function readTaskMeta(taskId: string): GenerateTaskMeta | undefined {
  if (typeof window === 'undefined' || !taskId) {
    return undefined
  }
  cleanLegacyTaskMeta()
  try {
    const raw = window.localStorage.getItem(taskMetaKey(taskId))
    if (!raw) {
      return undefined
    }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return undefined
    }
    return parsed as GenerateTaskMeta
  } catch {
    return undefined
  }
}

export function removeTaskMeta(taskId: string) {
  if (typeof window === 'undefined' || !taskId) {
    return
  }
  cleanLegacyTaskMeta()
  try {
    window.localStorage.removeItem(taskMetaKey(taskId))
  } catch {
    return
  }
}

export function setActiveTaskId(sourceType: SourceType, taskId?: string) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const key = activeTaskKey(sourceType)
    if (taskId?.trim()) {
      window.localStorage.setItem(key, taskId.trim())
      return
    }
    window.localStorage.removeItem(key)
  } catch {
    return
  }
}

export function getActiveTaskId(sourceType: SourceType): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  try {
    const raw = window.localStorage.getItem(activeTaskKey(sourceType))
    return raw?.trim() ? raw.trim() : undefined
  } catch {
    return undefined
  }
}

export function saveCreatePreferences(sourceType: SourceType, preferences: CreatePreferences) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(createPreferencesKey(sourceType), JSON.stringify(preferences))
  } catch {
    return
  }
}

export function readCreatePreferences(sourceType: SourceType): CreatePreferences | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  try {
    const raw = window.localStorage.getItem(createPreferencesKey(sourceType))
    if (!raw) {
      return undefined
    }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return undefined
    }

    const data = parsed as Record<string, unknown>
    const preferences: CreatePreferences = {}

    if (typeof data.promptId === 'string') {
      preferences.promptId = data.promptId
    }
    if (Array.isArray(data.formats)) {
      preferences.formats = data.formats.filter((item): item is string => typeof item === 'string')
    }
    if (typeof data.includeToc === 'boolean') {
      preferences.includeToc = data.includeToc
    }
    if (data.generationMode === 'per_link' || data.generationMode === 'merge_all') {
      preferences.generationMode = data.generationMode
    }

    return preferences
  } catch {
    return undefined
  }
}
