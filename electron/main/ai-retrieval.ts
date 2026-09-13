import { getDb, qAll } from './db'
import type { ContextSnippet } from './ai-context'

export function retrieveNotes(query: string): ContextSnippet[] {
  // Limit work, escape LIKE metacharacters, and support Chinese without an external tokenizer.
  const parts = query.slice(0, 1000).toLowerCase().match(/[a-z0-9_]{2,}|[\u3400-\u9fff]+/g) || []
  const tokens = [...new Set(parts.flatMap(part => /^[\u3400-\u9fff]+$/.test(part) && part.length > 2
    ? Array.from({ length: part.length - 1 }, (_, index) => part.slice(index, index + 2)) : [part]))].slice(0, 24)
  if (!tokens.length) return []
  const conditions = tokens.map(() => "(lower(title) LIKE ? ESCAPE '\\' OR lower(body) LIKE ? ESCAPE '\\')")
  const params = tokens.flatMap(token => { const escaped = `%${token.replace(/[\\%_]/g, '\\$&')}%`; return [escaped, escaped] })
  const rows = qAll(getDb(), `SELECT id, title, body FROM notes WHERE deleted_at IS NULL AND kind = 'note' AND (${conditions.join(' OR ')}) ORDER BY updated_at DESC, id LIMIT 80`, params) as { id: string; title: string; body: string }[]
  return rows.map(row => {
    const title = row.title.toLowerCase(), body = row.body.toLowerCase()
    const score = tokens.reduce((sum, token) => sum + (title.includes(token) ? 3 : 0) + (body.includes(token) ? 1 : 0), 0)
    const offsets = tokens.map(token => body.indexOf(token)).filter(offset => offset >= 0)
    const start = Math.max(0, (offsets.length ? Math.min(...offsets) : 0) - 120)
    return { id: row.id, title: row.title, text: row.body.slice(start, start + 1200), score }
  }).filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 4)
}
