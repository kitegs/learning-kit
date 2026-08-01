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

  registerIpc(ipc, 'notes:create-from-message', (_e, args: { messageId: string; title?: string; tags?: string }) => {
    const row = qOne(getDb(), `SELECT m.id, m.content, m.role, c.title AS conversation_title
      FROM messages m LEFT JOIN conversations c ON c.id=m.conversation_id
      WHERE m.id=? AND m.deleted_at IS NULL`, [args.messageId]) as {
        id: string; content: string; role: string; conversation_title: string | null
      } | undefined
    if (!row) throw new Error('Message not found')

    let inbox = qOne(getDb(), `SELECT id FROM notes
      WHERE title='收集箱' AND parent_id IS NULL AND kind='folder' AND deleted_at IS NULL LIMIT 1`) as { id: string } | undefined
    if (!inbox) {
      const inboxId = uuid()
      qRun(getDb(), 'INSERT INTO notes(id,title,body,parent_id,sort,kind) VALUES(?,?,?,?,?,?)',
        [inboxId, '收集箱', '', null, -1, 'folder'])
      inbox = { id: inboxId }
    }

    const noteId = uuid()
    const conversationTitle = row.conversation_title || '未命名对话'
    const content = row.content || ''
    const fallbackTitle = content.replace(/\s+/g, ' ').trim().slice(0, 48) || 'AI 知识片段'
    const title = (args.title || fallbackTitle).trim().slice(0, 120) || 'AI 知识片段'
    const body = `> 来源：${row.role === 'assistant' ? 'AI 回答' : '我的消息'} · ${conversationTitle}\n> 已保存至知识库\n\n${content}`
    qRun(getDb(), 'INSERT INTO notes(id,title,body,parent_id,sort,tags,kind) VALUES(?,?,?,?,?,?,?)',
      [noteId, title, body, inbox.id, Date.now(), args.tags ?? 'AI,收集箱', 'note'])
    qRun(getDb(), 'INSERT INTO links(id,source_type,source_id,target_type,target_id,link_type,created_at) VALUES(?,?,?,?,?,?,unixepoch())',
      [uuid(), 'message', row.id, 'note', noteId, 'saved_to_knowledge'])
    schedulePersist()
    return noteId
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
