import { ipcMain } from 'electron'
import { getDb } from './db'

function all<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql)
  stmt.bind(params as any)
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as T)
  stmt.free()
  return rows
}

function esc(s: string): string {
  // tiny safe-escape for LIKE wildcards
  return (s || '').replace(/[%_\\]/g, (c) => '\\' + c)
}

export function registerSearchIpcs(ipc: typeof ipcMain): void {
  ipc.handle('search:all', (_e, q: string) => {
    const k = '%' + esc(q) + '%'
    type Row = { id: string; title?: string; body?: string; content?: string; text?: string; front?: string; back?: string; conversation_id?: string; role?: string; book_id?: string; page?: number; note?: string; deck_id?: string; author?: string }
    const convs = all<Row>(`SELECT id, title FROM conversations WHERE title LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 10`, [k])
    const msgs = all<Row>(`SELECT id, conversation_id, role, content FROM messages WHERE content LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 30`, [k])
    const notes = all<Row>(`SELECT id, title, body FROM notes WHERE title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 20`, [k, k])
    const mindmaps = all<Row>(`SELECT id, title, body FROM mindmaps WHERE title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 20`, [k, k])
    const highlights = all<Row>(`SELECT id, book_id, page, text, note FROM highlights WHERE text LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 30`, [k, k])
    const cards = all<Row>(`SELECT id, deck_id, front, back FROM cards WHERE front LIKE ? ESCAPE '\\' OR back LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 20`, [k, k])
    const books = all<Row>(`SELECT id, title, author FROM books WHERE title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\' ORDER BY added_at DESC LIMIT 10`, [k, k])

    const snippet = (s: string | undefined) => {
      if (!s) return ''
      const i = s.toLowerCase().indexOf(String(q).toLowerCase())
      if (i < 0) return s.slice(0, 120)
      return (i > 30 ? '…' : '') + s.slice(Math.max(0, i - 30), i + 90) + (i + 90 < s.length ? '…' : '')
    }

    return {
      query: q,
      conversations: convs.map((c) => ({ id: c.id, title: c.title!, kind: 'conv' })),
      messages: msgs.map((m) => ({ id: m.id, conversation_id: m.conversation_id, role: m.role, snippet: snippet(m.content), kind: 'msg' })),
      notes: notes.map((n) => ({ id: n.id, title: n.title!, snippet: snippet(n.body), kind: 'note' })),
      mindmaps: mindmaps.map((m) => ({ id: m.id, title: m.title!, snippet: snippet(m.body), kind: 'mindmap' })),
      highlights: highlights.map((h) => ({ id: h.id, book_id: h.book_id, page: h.page, snippet: snippet(h.text), note: snippet(h.note), kind: 'highlight' })),
      cards: cards.map((c) => ({ id: c.id, deck_id: c.deck_id, snippet: snippet(c.front), back: snippet(c.back), kind: 'card' })),
      books: books.map((b) => ({ id: b.id, title: b.title!, author: b.author, kind: 'book' }))
    }
  })
}