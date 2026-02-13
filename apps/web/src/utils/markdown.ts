export function downloadMarkdownFile(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function buildMarkdownName(title: string) {
  const datePart = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
  const base = title.trim() || `note-${datePart}`
  return `${base.replace(/[\\/:*?"<>|]/g, '_')}.md`
}
