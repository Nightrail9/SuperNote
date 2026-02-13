const DEFAULT_ARRAY_KEYS = ['items', 'list', 'models', 'prompts', 'data', 'rows', 'records'] as const

export function toArrayData<T>(value: unknown, keys: readonly string[] = DEFAULT_ARRAY_KEYS): T[] {
  if (Array.isArray(value)) {
    return value as T[]
  }

  if (!value || typeof value !== 'object') {
    return []
  }

  const record = value as Record<string, unknown>
  for (const key of keys) {
    const candidate = record[key]
    if (Array.isArray(candidate)) {
      return candidate as T[]
    }
  }

  return []
}
