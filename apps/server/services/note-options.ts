export const NOTE_FORMAT_VALUES = ['toc', 'screenshot'] as const;

export type NoteFormat = (typeof NOTE_FORMAT_VALUES)[number];

const formatMap: Record<NoteFormat, string> = {
  toc: '1. **目录**: 在正文前生成基于 `##` 标题的目录。',
  screenshot: [
    '2. **原片截图**: 在正文关键位置插入视频截图标记，帮助读者理解内容。',
    '- 在以下情况必须插入截图：展示重要概念、操作步骤、界面效果、数据可视化、对比示例时',
    '- 每个主要小节（## 标题下）至少插入 1-2 个截图标记',
    '- 格式必须为：`*Screenshot-[mm:ss]`（注意星号开头）',
    '- 时间戳必须对应视频中的真实时间点，选择最能说明当前段落内容的画面',
    '- 截图标记单独一行，位于相关段落之后',
  ].join('\n'),
};

export function normalizeNoteFormats(value: unknown): NoteFormat[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: NoteFormat[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }
    const trimmed = item.trim() as NoteFormat;
    if (!NOTE_FORMAT_VALUES.includes(trimmed) || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function buildPromptWithOptions(basePrompt: string, formats: NoteFormat[] = []): string {
  const additions: string[] = [];
  if (formats.length > 0) {
    additions.push(...formats.map((item) => formatMap[item]));
  }
  if (additions.length === 0) {
    return basePrompt;
  }
  return `${basePrompt.trim()}\n\n${additions.join('\n')}`;
}
