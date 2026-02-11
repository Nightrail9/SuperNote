export function buildPageKeywordQuery(
  routeQuery: Record<string, unknown>,
  current: { page: number; keyword: string },
  patch: { page?: number; keyword?: string },
): Record<string, string> {
  const next: Record<string, string> = {}

  Object.entries(routeQuery).forEach(([key, value]) => {
    if (typeof value === 'string') {
      next[key] = value
      return
    }
    if (Array.isArray(value) && typeof value[0] === 'string') {
      next[key] = value[0]
    }
  })

  next.page = String(patch.page ?? current.page)
  next.keyword = patch.keyword !== undefined ? patch.keyword.trim() : current.keyword
  delete next.pageSize

  if (!next.keyword) {
    delete next.keyword
  }

  return next
}

export function resolveRowIndexById<T extends { id: string }>(rows: T[], index: number, id: string): number {
  return rows[index]?.id === id ? index : rows.findIndex((item) => item.id === id)
}
