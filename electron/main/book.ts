import { app, ipcMain, dialog, protocol, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync, rmSync } from 'fs'
import { getDb, schedulePersist } from './db'

const uuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })

function booksDir(): string {
  const d = join(app.getPath('userData'), 'data', 'books')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function all<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql)
  stmt.bind(params as any)
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as T)
  stmt.reset()
  return rows
}

function run(sql: string, params: unknown[] = []): void {
  const stmt = getDb().prepare(sql)
  stmt.bind(params as any)
  stmt.step()
  stmt.reset()
}

export function registerBookProtocol(): void {
  // scheme: book://<bookId> returns the file bytes (used as URL by pdfjs / epubjs via fetch)
  protocol.handle('book', async (req) => {
    const host = req.url.replace('book://', '').split('/')[0].split('?')[0]
    if (!host) return new Response('bad book id', { status: 400 })
    const book = all<{ id: string; file_path: string }>('SELECT id, file_path FROM books WHERE id=?', [host])[0]
    if (!book) return new Response('not found', { status: 404 })
    if (!existsSync(book.file_path)) return new Response('file missing', { status: 410 })
    const buf = await import('fs/promises').then((f) => f.readFile(book.file_path))
    const ext = book.file_path.toLowerCase().endsWith('.epub') ? 'application/epub+zip' : 'application/pdf'
    return new Response(buf, { headers: { 'Content-Type': ext } })
  })
}

export function registerBookIpcs(ipc: typeof ipcMain): void {
  ipc.handle('book:import', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: '导入电子书',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'PDF / EPUB', extensions: ['pdf', 'epub'] }
      ]
    })
    if (res.canceled || res.filePaths.length === 0) return []

    const addedIds: string[] = []
    for (const src of res.filePaths) {
      const id = uuid()
      const ext = src.toLowerCase().endsWith('.epub') ? 'epub' : 'pdf'
      const dst = join(booksDir(), `${id}.${ext}`)
      copyFileSync(src, dst)
      const base = src.replace(/\\/g, '/').split('/').pop() || '未命名'
      const title = base.replace(/\.(pdf|epub)$/i, '')
      run(
        `INSERT INTO books(id,title,kind,file_path) VALUES(?,?,?,?)`,
        [id, title, ext, dst]
      )
      addedIds.push(id)
    }
    schedulePersist()
    return addedIds
  })

  ipc.handle('book:list', () => all('SELECT * FROM books ORDER BY added_at DESC'))

  ipc.handle('book:update', (_e, id: string, patch: Partial<{ title: string; author: string; total_pages: number; last_page: number }>) => {
    const sets: string[] = []
    const vals: unknown[] = []
    if (patch.title !== undefined) { sets.push('title=?'); vals.push(patch.title) }
    if (patch.author !== undefined) { sets.push('author=?'); vals.push(patch.author) }
    if (patch.total_pages !== undefined) { sets.push('total_pages=?'); vals.push(patch.total_pages) }
    if (patch.last_page !== undefined) { sets.push('last_page=?'); vals.push(patch.last_page) }
    if (!sets.length) return false
    vals.push(id)
    run(`UPDATE books SET ${sets.join(',')} WHERE id=?`, vals)
    schedulePersist()
    return true
  })

  ipc.handle('book:delete', (_e, id: string) => {
    const book = all<{ file_path: string }>('SELECT file_path FROM books WHERE id=?', [id])[0]
    if (book?.file_path && existsSync(book.file_path)) {
      try { rmSync(book.file_path) } catch { /* ignore */ }
    }
    run('DELETE FROM highlights WHERE book_id=?', [id])
    run('DELETE FROM bookmarks WHERE book_id=?', [id])
    run('DELETE FROM books WHERE id=?', [id])
    schedulePersist()
    return true
  })

  // ---- highlights ----
  ipc.handle('book:highlight:add', (_e, h) => {
    const id = h.id ?? uuid()
    run(
      `INSERT INTO highlights(id,book_id,page,text,color,note,link_conv_id,link_msg_id,rect_x,rect_y,rect_w,rect_h) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, h.bookId, h.page, h.text, h.color ?? 'yellow', h.note ?? null, h.linkConvId ?? null, h.linkMsgId ?? null,
       h.rectX ?? null, h.rectY ?? null, h.rectW ?? null, h.rectH ?? null]
    )
    schedulePersist()
    return id
  })

  ipc.handle('book:highlight:list', (_e, bookId: string) =>
    all('SELECT * FROM highlights WHERE book_id=? ORDER BY page, created_at', [bookId])
  )

  ipc.handle('book:highlight:update', (_e, id: string, patch: Partial<{ note: string; color: string; linkConvId: string; linkMsgId: string }>) => {
    if (patch.note !== undefined) run('UPDATE highlights SET note=? WHERE id=?', [patch.note, id])
    if (patch.color !== undefined) run('UPDATE highlights SET color=? WHERE id=?', [patch.color, id])
    if (patch.linkConvId !== undefined) run('UPDATE highlights SET link_conv_id=? WHERE id=?', [patch.linkConvId, id])
    if (patch.linkMsgId !== undefined) run('UPDATE highlights SET link_msg_id=? WHERE id=?', [patch.linkMsgId, id])
    schedulePersist()
    return true
  })

  ipc.handle('book:highlight:delete', (_e, id: string) => {
    run('DELETE FROM highlights WHERE id=?', [id])
    schedulePersist()
    return true
  })

  // ---- bookmarks ----
  ipc.handle('book:bookmark:add', (_e, b) => {
    const id = b.id ?? uuid()
    run('INSERT INTO bookmarks(id,book_id,page,label,href) VALUES(?,?,?,?,?)',
      [id, b.bookId, b.page ?? 0, b.label ?? null, b.href ?? null])
    schedulePersist()
    return id
  })

  ipc.handle('book:bookmark:list', (_e, bookId: string) =>
    all('SELECT * FROM bookmarks WHERE book_id=? ORDER BY page', [bookId])
  )

  ipc.handle('book:bookmark:delete', (_e, id: string) => {
    run('DELETE FROM bookmarks WHERE id=?', [id]); schedulePersist(); return true
  })

  ipc.handle('book:stat', () => {
    const total = all<{ c: number }>('SELECT COUNT(*) c FROM highlights')[0]?.c ?? 0
    const books = all<{ c: number }>('SELECT COUNT(*) c FROM books')[0]?.c ?? 0
    return { highlights: total, books }
  })

  // ---- page_annotations (pen/highlight/shape overlay) ----
  ipc.handle('book:ann:list', (_e, bookId: string, page: number) =>
    all('SELECT * FROM page_annotations WHERE book_id=? AND page=? ORDER BY created_at', [bookId, page])
  )
  ipc.handle('book:ann:listAll', (_e, bookId: string) =>
    all('SELECT * FROM page_annotations WHERE book_id=? ORDER BY page, created_at', [bookId])
  )
  ipc.handle('book:ann:save', (_e, a) => {
    const id = a.id ?? uuid()
    run(`INSERT INTO page_annotations(id,book_id,page,type,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type, data=excluded.data`,
      [id, a.bookId, a.page, a.type, a.data ?? '{}'])
    schedulePersist(); return id
  })
  ipc.handle('book:ann:delete', (_e, id: string) => { run('DELETE FROM page_annotations WHERE id=?', [id]); schedulePersist(); return true })
  ipc.handle('book:ann:clear', (_e, bookId: string, page: number) => {
    run('DELETE FROM page_annotations WHERE book_id=? AND page=?', [bookId, page])
    schedulePersist(); return true
  })
}