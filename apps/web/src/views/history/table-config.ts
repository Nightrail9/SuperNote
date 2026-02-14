export type HistoryTableColumn = {
  key: string
  label: string
  minWidth?: number
  flex?: number
  freeze?: 'right'
  align?: 'left' | 'center' | 'right'
}

export const HISTORY_PAGE_SIZE = 5
export const HISTORY_FIXED_BODY_ROWS = 5

export const NOTE_TABLE_COLUMNS: HistoryTableColumn[] = [
  { key: 'title', label: '标题', minWidth: 320, flex: 2.4 },
  { key: 'source', label: '来源', minWidth: 220, flex: 1.45 },
  { key: 'updatedAt', label: '更新时间', minWidth: 220, flex: 1.45 },
  { key: 'actions', label: '操作', minWidth: 240, flex: 1.35, freeze: 'right', align: 'center' },
]

export const DRAFT_TABLE_COLUMNS: HistoryTableColumn[] = [
  { key: 'title', label: '草稿标题', minWidth: 340, flex: 2.4 },
  { key: 'lastAutoSavedAt', label: '最后自动保存', minWidth: 220, flex: 1.45 },
  { key: 'updatedAt', label: '更新时间', minWidth: 220, flex: 1.45 },
  { key: 'actions', label: '操作', minWidth: 240, flex: 1.35, freeze: 'right', align: 'center' },
]

export function resolveSourceLabel(sourceUrl: string) {
  const raw = sourceUrl.trim().toLowerCase()
  if (!raw) return '未知来源'
  if (raw.includes('bilibili.com') || raw.includes('b23.tv')) return 'Bilibili'
  if (raw.includes('youtube.com') || raw.includes('youtu.be')) return 'YouTube'

  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, '')
    return host || '其他'
  } catch {
    return '其他'
  }
}
