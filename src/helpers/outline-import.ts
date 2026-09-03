export type OutlineEntry = { title: string; page: number; depth: number }

function outlineHeading(line: string, hasRoot: boolean): { title: string; depth: number } | null {
  const markdown = line.match(/^(#{1,6})\s+(.+)$/)
  if (markdown) return { title: markdown[2].replace(/\*\*/g, '').trim(), depth: Math.min(5, markdown[1].length - 1) }
  const bold = line.match(/^\*\*(.+?)\*\*$/)
  const title = (bold?.[1] || line).trim()
  if (!title || /^[-*+]\s/.test(title)) return null
  const rootLike = /(?:基础过关|第?\s*[一二三四五六七八九十百零\d]+)\s*(?:阶|阶段|篇|部分|册|卷|单元)/.test(title)
  return { title, depth: rootLike || !hasRoot ? 0 : 1 }
}

export function parseImportedOutline(text: string, offset: number, maxPage: number): OutlineEntry[] {
  type Draft = { title: string; page?: number; depth: number }
  const drafts: Draft[] = []
  let hasRoot = false
  let headingDepth = -1
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const clean = line.replace(/^[-*+]\s+/, '').trim()
    const pageMatch = clean.match(/^(.+?)(?:\s*[：:]\s*|[.。·•…]{2,}\s*)(\d{1,5})\s*$/)
    if (pageMatch) {
      const title = pageMatch[1].replace(/^\*\*|\*\*$/g, '').trim()
      if (title) drafts.push({ title, page: Number(pageMatch[2]), depth: Math.max(0, headingDepth + 1) })
      continue
    }
    const heading = outlineHeading(line, hasRoot)
    if (!heading) continue
    drafts.push(heading)
    headingDepth = heading.depth
    if (heading.depth === 0) hasRoot = true
  }
  for (let index = 0; index < drafts.length; index++) {
    if (drafts[index].page != null) continue
    for (let child = index + 1; child < drafts.length; child++) {
      if (drafts[child].depth <= drafts[index].depth) break
      if (drafts[child].page != null) { drafts[index].page = drafts[child].page; break }
    }
  }
  const limit = Math.max(1, maxPage || Number.MAX_SAFE_INTEGER)
  return drafts
    .filter((item): item is Draft & { page: number } => Number.isFinite(item.page))
    .map((item) => ({ title: item.title, depth: item.depth, page: Math.min(limit, Math.max(1, Math.round(item.page + offset))) }))
}
