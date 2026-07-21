import { ipcMain, dialog } from 'electron'
import { getDb, schedulePersist } from './db'

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
  stmt.bind(params as any); stmt.step(); stmt.reset()
}

const uuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })

export function registerNoteIpcs(ipc: typeof ipcMain): void {
  ipc.handle('notes:list', () => all('SELECT * FROM notes ORDER BY sort, created_at'))
  ipc.handle('notes:get', (_e, id: string) => all('SELECT * FROM notes WHERE id=?', [id])[0])
  ipc.handle('notes:upsert', (_e, n) => {
    const id = n.id ?? uuid()
    run(`INSERT INTO notes(id,title,body,parent_id,sort,tags,kind) VALUES(?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title, body=excluded.body, parent_id=excluded.parent_id,
           sort=excluded.sort, tags=excluded.tags, kind=excluded.kind, updated_at=datetime('now')`,
      [id, n.title ?? '未命名', n.body ?? '', n.parent_id ?? null, n.sort ?? 0, n.tags ?? null, n.kind ?? 'note'])
    schedulePersist(); return id
  })
  ipc.handle('notes:patch', (_e, id: string, patch) => {
    if (patch.title !== undefined) run('UPDATE notes SET title=?, updated_at=datetime("now") WHERE id=?', [patch.title, id])
    if (patch.body !== undefined) run('UPDATE notes SET body=?, updated_at=datetime("now") WHERE id=?', [patch.body, id])
    if (patch.tags !== undefined) run('UPDATE notes SET tags=?, updated_at=datetime("now") WHERE id=?', [patch.tags, id])
    schedulePersist(); return true
  })
  ipc.handle('notes:delete', (_e, id: string) => {
    run('DELETE FROM notes WHERE id=?', [id]); schedulePersist(); return true
  })

  // mindmaps
  ipc.handle('mindmap:list', () => all('SELECT * FROM mindmaps ORDER BY updated_at DESC'))
  ipc.handle('mindmap:get', (_e, id: string) => all('SELECT * FROM mindmaps WHERE id=?', [id])[0])
  ipc.handle('mindmap:upsert', (_e, m) => {
    const id = m.id ?? uuid()
    run(`INSERT INTO mindmaps(id,title,body,drawing,annotations) VALUES(?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, body=excluded.body, drawing=excluded.drawing, annotations=excluded.annotations, updated_at=datetime('now')`,
      [id, m.title ?? '思维导图', m.body ?? '', m.drawing ?? null, m.annotations ?? null])
    schedulePersist(); return id
  })
  ipc.handle('mindmap:delete', (_e, id: string) => {
    run('DELETE FROM mindmaps WHERE id=?', [id]); schedulePersist(); return true
  })

  // export note to file
  ipc.handle('notes:export', async (_e, id: string) => {
    const n = all<any>('SELECT * FROM notes WHERE id=?', [id])[0]
    if (!n) return false
    const res = await dialog.showSaveDialog({
      title: '导出',
      defaultPath: `${(n.title || 'note').replace(/[\\/:*?"<>|]/g, '_')}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (res.canceled || !res.filePath) return false
    const fs = await import('fs/promises')
    await fs.writeFile(res.filePath, `# ${n.title}\n\n${n.body}\n`, 'utf-8')
    return true
  })
}