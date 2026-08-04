import { ipcMain } from 'electron'
import { getDb, qAll } from './db'

export function registerSearchIpcs(ipc: typeof ipcMain): void {
  ipc.handle('search:all', (_e, q: string) => {
    const requestedTags = [...(q || '').matchAll(/#([^\s#,，]+)/g)].map((match) => match[1].toLowerCase())
    const requestedTypes = [...(q || '').matchAll(/\btype:([\w-]+)/gi)].map((match) => match[1].toLowerCase())
    const textQuery = (q || '').replace(/#[^\s#,，]+/g, '').replace(/\btype:[\w-]+/gi, '').trim()
    const k = '%' + (textQuery || q || '').replace(/[%_\\]/g, (c) => '\\' + c) + '%'
    const tagSql = requestedTags.length ? requestedTags.map(() => 'tags LIKE ? ESCAPE \'\\\'').join(' AND ') : ''
    const tagArgs = requestedTags.map((tag) => `%${tag}%`)

    // FTS5 search. Normalize user input so symbols cannot turn into FTS syntax errors.
    const ftsQuery = textQuery.replace(/[^\p{L}\p{N}_]+/gu, ' ').trim()
    const ftsConvs = ftsQuery ? qAll(getDb(), `SELECT c.id, c.title FROM conversations c JOIN fts_conversations f ON c.rowid = f.rowid WHERE fts_conversations MATCH ? AND c.deleted_at IS NULL LIMIT 15`, [ftsQuery]) : []
    const ftsMsg = ftsQuery ? qAll(getDb(), `SELECT m.id, m.conversation_id, m.role, m.content FROM messages m JOIN fts_messages f ON m.rowid = f.rowid WHERE fts_messages MATCH ? AND m.deleted_at IS NULL LIMIT 30`, [ftsQuery]) : []
    const ftsNotes = ftsQuery ? qAll(getDb(), `SELECT n.id, n.title, n.body FROM notes n JOIN fts_notes f ON n.rowid = f.rowid WHERE fts_notes MATCH ? AND n.deleted_at IS NULL LIMIT 20`, [ftsQuery]) : []
    const ftsHL = ftsQuery ? qAll(getDb(), `SELECT h.id, h.book_id, h.page, h.text, h.href FROM highlights h JOIN fts_highlights f ON h.rowid = f.rowid WHERE fts_highlights MATCH ? LIMIT 30`, [ftsQuery]) : []

    // Fallback LIKE search for entities without FTS
    const convs = qAll(getDb(), `SELECT id, title FROM conversations WHERE title LIKE ? ESCAPE '\\' AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 10`, [k])
    const notes2 = qAll(getDb(), `SELECT id, title, body, tags FROM notes WHERE (${textQuery ? '(title LIKE ? ESCAPE \'\\\' OR body LIKE ? ESCAPE \'\\\' OR tags LIKE ? ESCAPE \'\\\')' : '1=1'}) ${tagSql ? 'AND ' + tagSql : ''} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20`, textQuery ? [k, k, k, ...tagArgs] : tagArgs)
    const mindmaps = qAll(getDb(), `SELECT id, title, body FROM mindmaps WHERE (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\') AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20`, [k, k])
    const cards = qAll(getDb(), `SELECT id, deck_id, front, back, tags FROM cards WHERE (${textQuery ? '(front LIKE ? ESCAPE \'\\\' OR back LIKE ? ESCAPE \'\\\' OR tags LIKE ? ESCAPE \'\\\')' : '1=1'}) ${tagSql ? 'AND ' + tagSql : ''} ORDER BY updated_at DESC LIMIT 20`, textQuery ? [k, k, k, ...tagArgs] : tagArgs)
    const books = qAll(getDb(), `SELECT id, title, author FROM books WHERE (title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\') AND deleted_at IS NULL ORDER BY added_at DESC LIMIT 10`, [k, k])
    const blocks = textQuery ? qAll(getDb(), `SELECT id,source_type,source_id,text,anchor,metadata FROM content_blocks WHERE text LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 30`, [k]) : []

    const kps = qAll(getDb(), `SELECT id, title, description FROM knowledge_points WHERE (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\') AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20`, [k, k])
    qAll(getDb(), `SELECT l.* FROM links l JOIN knowledge_points kp ON kp.id = l.target_id WHERE kp.title LIKE ? ESCAPE '\\' AND l.link_type='references' LIMIT 15`, [k])

    const snippet = (s: string | undefined) => {
      if (!s) return ''
      const i = s.toLowerCase().indexOf(String(q).toLowerCase())
      if (i < 0) return s.slice(0, 120)
      return (i > 30 ? '...' : '') + s.slice(Math.max(0, i - 30), i + 90) + (i + 90 < s.length ? '...' : '')
    }

    const unique = <T extends { id: string }>(items: T[]): T[] => [...new Map(items.map((item) => [item.id, item])).values()]
    const allows = (type: string) => !requestedTypes.length || requestedTypes.includes(type) || (type === 'note' && requestedTypes.includes('notes')) || (type === 'book' && requestedTypes.includes('reading'))
    const scored = <T extends { title?: string; snippet?: string }>(items: T[]) => items.map((item) => {
      const haystack = `${item.title || ''} ${item.snippet || ''}`.toLowerCase()
      const needle = textQuery.toLowerCase()
      const score = !needle ? 0 : (String(item.title || '').toLowerCase().startsWith(needle) ? 100 : haystack.indexOf(needle) >= 0 ? 50 - Math.min(40, haystack.indexOf(needle)) : 0)
      return { ...item, score }
    }).sort((a, b) => b.score - a.score)
    return {
      query: q,
      conversations: allows('chat') ? scored(unique([...ftsConvs, ...convs].map((c: any) => ({ id: c.id, title: c.title!, kind: 'conv' })))) : [],
      messages: allows('chat') ? scored([...ftsMsg.map((m: any) => ({ id: m.id, conversation_id: m.conversation_id, role: m.role, snippet: snippet(m.content), kind: 'msg' }))]) : [],
      notes: allows('note') ? scored(unique([...ftsNotes, ...notes2].map((n: any) => ({ id: n.id, title: n.title!, snippet: snippet(n.body), tags: n.tags || '', kind: 'note' })))) : [],
      mindmaps: allows('mindmap') ? scored(mindmaps.map((m: any) => ({ id: m.id, title: m.title!, snippet: snippet(m.body), kind: 'mindmap' }))) : [],
      books: allows('book') ? scored(books.map((b: any) => ({ id: b.id, title: b.title!, author: b.author, kind: 'book' }))) : [],
      blocks: allows('block') || allows('note') ? scored(blocks.map((b: any) => ({ id: b.id, source_type: b.source_type, source_id: b.source_id, snippet: snippet(b.text), anchor: b.anchor, stale: Boolean(b.stale), kind: 'block' }))) : [],
      cards: allows('card') || allows('review') ? scored(cards.map((c: any) => ({ id: c.id, deck_id: c.deck_id, snippet: snippet(c.front), back: snippet(c.back), tags: c.tags || '', kind: 'card' }))) : [],
      highlights: allows('highlight') || allows('reading') ? scored(ftsHL.map((h: any) => ({ id: h.id, book_id: h.book_id, page: h.page, href: h.href, snippet: snippet(h.text), kind: 'highlight' }))) : [],
      kps: allows('kp') ? scored(kps.map((k: any) => ({ id: k.id, title: k.title!, snippet: snippet(k.description), kind: 'kp' }))) : [],
    }
  })
}
