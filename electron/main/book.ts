import { app, ipcMain, dialog, protocol, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { getDb, schedulePersist, uuid, qAll, qOne, qRun } from './db'

function booksDir(): string {
  const d = join(app.getPath('userData'), 'data', 'books')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

export function registerBookProtocol(): void {
  protocol.handle('book', async (req) => {
    const host = req.url.replace('book://', '').split('/')[0].split('?')[0]
    if (!host) return new Response('bad book id', { status: 400 })
    const book = qOne(getDb(), 'SELECT id, file_path FROM books WHERE id=? AND deleted_at IS NULL', [host])
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
      title: 'Import ebook',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF / EPUB', extensions: ['pdf', 'epub'] }]
    })
    if (res.canceled || res.filePaths.length === 0) return []

    const addedIds: string[] = []
    for (const src of res.filePaths) {
      const id = uuid()
      const ext = src.toLowerCase().endsWith('.epub') ? 'epub' : 'pdf'
      const dst = join(booksDir(), `${id}.${ext}`)
      copyFileSync(src, dst)
      const base = src.replace(/\\/g, '/').split('/').pop() || 'untitled'
      const title = base.replace(/\.(pdf|epub)$/i, '')
      qRun(getDb(), 'INSERT INTO books(id,title,kind,file_path) VALUES(?,?,?,?)', [id, title, ext, dst])
      addedIds.push(id)
    }
    schedulePersist()
    return addedIds
  })

  ipc.handle('book:list', () => qAll(getDb(), 'SELECT * FROM books WHERE deleted_at IS NULL ORDER BY added_at DESC'))

  ipc.handle('book:update', (_e, id: string, patch: any) => {
    const sets: string[] = []; const vals: any[] = []
    if (patch.title !== undefined) { sets.push('title=?'); vals.push(patch.title) }
    if (patch.author !== undefined) { sets.push('author=?'); vals.push(patch.author) }
    if (patch.total_pages !== undefined) { sets.push('total_pages=?'); vals.push(patch.total_pages) }
    if (patch.last_page !== undefined) { sets.push('last_page=?'); vals.push(patch.last_page) }
    if (!sets.length) return false
    vals.push(id)
    qRun(getDb(), `UPDATE books SET ${sets.join(',')} WHERE id=?`, vals)
    schedulePersist()
    return true
  })

  ipc.handle('book:delete', (_e, id: string) => {
    qRun(getDb(), 'UPDATE books SET deleted_at=unixepoch() WHERE id=?', [id])
    schedulePersist()
    return true
  })

  // highlights
  ipc.handle('book:highlight:add', (_e, h: any) => {
    const id = h.id ?? uuid()
    qRun(getDb(), `INSERT INTO highlights(id,book_id,page,text,color,note,link_conv_id,link_msg_id,rect_x,rect_y,rect_w,rect_h,href,rects_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, h.bookId, h.page, h.text, h.color ?? 'yellow', h.note ?? null, h.linkConvId ?? null, h.linkMsgId ?? null,
       h.rectX ?? null, h.rectY ?? null, h.rectW ?? null, h.rectH ?? null, h.href ?? null, h.rectsJson ?? null])
    qRun(getDb(), 'INSERT INTO content_blocks(id,source_type,source_id,block_type,text,anchor,metadata) VALUES(?,?,?,?,?,?,?)',
      [uuid(), 'highlight', id, 'book_highlight', h.text, h.href || `page:${h.page}`, JSON.stringify({ bookId: h.bookId, page: h.page, href: h.href ?? null })])
    schedulePersist()
    return id
  })

  ipc.handle('book:highlight:list', (_e, bookId: string) =>
    qAll(getDb(), 'SELECT * FROM highlights WHERE book_id=? ORDER BY page, created_at', [bookId])
  )

  ipc.handle('book:highlight:update', (_e, id: string, patch: any) => {
    if (patch.note !== undefined) qRun(getDb(), 'UPDATE highlights SET note=? WHERE id=?', [patch.note, id])
    if (patch.color !== undefined) qRun(getDb(), 'UPDATE highlights SET color=? WHERE id=?', [patch.color, id])
    if (patch.linkConvId !== undefined) qRun(getDb(), 'UPDATE highlights SET link_conv_id=? WHERE id=?', [patch.linkConvId, id])
    if (patch.linkMsgId !== undefined) qRun(getDb(), 'UPDATE highlights SET link_msg_id=? WHERE id=?', [patch.linkMsgId, id])
    if (patch.href !== undefined) qRun(getDb(), 'UPDATE highlights SET href=? WHERE id=?', [patch.href, id])
    schedulePersist()
    return true
  })

  ipc.handle('book:highlight:delete', (_e, id: string) => {
    qRun(getDb(), 'DELETE FROM highlights WHERE id=?', [id])
    schedulePersist()
    return true
  })

  // bookmarks
  ipc.handle('book:bookmark:add', (_e, b: any) => {
    const id = b.id ?? uuid()
    qRun(getDb(), 'INSERT INTO bookmarks(id,book_id,page,label,href) VALUES(?,?,?,?,?)', [id, b.bookId, b.page ?? 0, b.label ?? null, b.href ?? null])
    schedulePersist()
    return id
  })

  ipc.handle('book:bookmark:list', (_e, bookId: string) =>
    qAll(getDb(), 'SELECT * FROM bookmarks WHERE book_id=? ORDER BY page', [bookId])
  )

  ipc.handle('book:bookmark:delete', (_e, id: string) => {
    qRun(getDb(), 'DELETE FROM bookmarks WHERE id=?', [id])
    schedulePersist()
    return true
  })

  ipc.handle('book:stat', () => {
    const hCount = qOne(getDb(), 'SELECT COUNT(*) c FROM highlights')?.c ?? 0
    const bCount = qOne(getDb(), 'SELECT COUNT(*) c FROM books WHERE deleted_at IS NULL')?.c ?? 0
    return { highlights: hCount, books: bCount }
  })

  // page_annotations
  ipc.handle('book:ann:list', (_e, bookId: string, page: number) =>
    qAll(getDb(), 'SELECT * FROM page_annotations WHERE book_id=? AND page=? ORDER BY created_at', [bookId, page])
  )
  ipc.handle('book:ann:listAll', (_e, bookId: string) =>
    qAll(getDb(), 'SELECT * FROM page_annotations WHERE book_id=? ORDER BY page, created_at', [bookId])
  )
  ipc.handle('book:ann:save', (_e, a: any) => {
    const id = a.id ?? uuid()
    qRun(getDb(), `INSERT INTO page_annotations(id,book_id,page,type,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type, data=excluded.data`,
      [id, a.bookId, a.page, a.type, a.data ?? '{}'])
    schedulePersist()
    return id
  })
  ipc.handle('book:ann:delete', (_e, id: string) => {
    qRun(getDb(), 'DELETE FROM page_annotations WHERE id=?', [id])
    schedulePersist()
    return true
  })
  ipc.handle('book:ann:clear', (_e, bookId: string, page: number) => {
    qRun(getDb(), 'DELETE FROM page_annotations WHERE book_id=? AND page=?', [bookId, page])
    schedulePersist()
    return true
  })
}
