import { ipcMain, dialog } from 'electron'
import { getDb, schedulePersist, uuid, qAll, qOne, qRun } from './db'
import { registerIpc } from './ipc-helpers'

export function registerNoteIpcs(ipc: typeof ipcMain): void {
  ipc.handle('notes:list', () => qAll(getDb(), 'SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY sort, created_at'))
  ipc.handle('notes:get', (_e, id: string) => qOne(getDb(), 'SELECT * FROM notes WHERE id=?', [id]))
  registerIpc(ipc, 'notes:upsert', (_e, n: any) => {
    const id = n.id ?? uuid()
    qRun(getDb(), `INSERT INTO notes(id,title,body,parent_id,sort,tags,kind) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,parent_id=excluded.parent_id,sort=excluded.sort,tags=excluded.tags,kind=excluded.kind,updated_at=datetime('now')`, [id, n.title ?? 'untitled', n.body ?? '', n.parent_id ?? null, n.sort ?? 0, n.tags ?? null, n.kind ?? 'note'])
    schedulePersist(); return id
  })

  registerIpc(ipc, 'notes:patch', (_e, id: string, patch: any) => {
    if (patch.title !== undefined) qRun(getDb(), 'UPDATE notes SET title=?,updated_at=datetime("now") WHERE id=?', [patch.title, id])
    if (patch.body !== undefined) qRun(getDb(), 'UPDATE notes SET body=?,updated_at=datetime("now") WHERE id=?', [patch.body, id])
    if (patch.tags !== undefined) qRun(getDb(), 'UPDATE notes SET tags=?,updated_at=datetime("now") WHERE id=?', [patch.tags, id])
    if (patch.parent_id !== undefined) qRun(getDb(), 'UPDATE notes SET parent_id=?,updated_at=datetime("now") WHERE id=?', [patch.parent_id, id])
    schedulePersist(); return true
  })
  ipc.handle('notes:delete', (_e, id: string) => {
    qRun(getDb(), 'UPDATE notes SET deleted_at=unixepoch() WHERE id=?', [id])
    schedulePersist(); return true
  })

  // mindmaps
  ipc.handle('mindmap:list', () => qAll(getDb(), 'SELECT * FROM mindmaps WHERE deleted_at IS NULL ORDER BY updated_at DESC'))
  ipc.handle('mindmap:get', (_e, id: string) => qOne(getDb(), 'SELECT * FROM mindmaps WHERE id=?', [id]))
  ipc.handle('mindmap:upsert', (_e, m: any) => {
    const id = m.id ?? uuid()
    qRun(getDb(), `INSERT INTO mindmaps(id,title,body,drawing,annotations) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,drawing=excluded.drawing,annotations=excluded.annotations,updated_at=datetime('now')`,
      [id, m.title ?? 'Mindmap', m.body ?? '', m.drawing ?? null, m.annotations ?? null])
    schedulePersist(); return id
  })
  ipc.handle('mindmap:delete', (_e, id: string) => {
    qRun(getDb(), 'UPDATE mindmaps SET deleted_at=unixepoch() WHERE id=?', [id])
    schedulePersist(); return true
  })

  // export note
  ipc.handle('notes:export', async (_e, id: string) => {
    const n = qOne(getDb(), 'SELECT * FROM notes WHERE id=?', [id])
    if (!n) return false
    const res = await dialog.showSaveDialog({
      title: 'Export',
      defaultPath: `${(n.title || 'note').replace(/[\\/:*?"<>|]/g, '_')}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (res.canceled || !res.filePath) return false
    const fs = await import('fs/promises')
    await fs.writeFile(res.filePath, `# ${n.title}\n\n${n.body}\n`, 'utf-8')
    return true
  })
}