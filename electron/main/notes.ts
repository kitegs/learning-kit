import { ipcMain, dialog } from 'electron'
import { getDb, schedulePersist, uuid, qAll, qOne, qRun } from './db'
import { registerIpc } from './ipc-helpers'

function saveVersion(note: { id: string; title: string; body: string }, reason: string): void {
  const latest = qOne(getDb(), 'SELECT title,body,created_at FROM note_versions WHERE note_id=? ORDER BY created_at DESC LIMIT 1', [note.id]) as { title?: string; body?: string; created_at?: string } | undefined
  if (latest?.title === note.title && latest?.body === note.body) return
  const recent = latest?.created_at ? Date.now() - new Date(`${latest.created_at}Z`).getTime() < 3 * 60 * 1000 : false
  if (reason === '编辑前自动快照' && recent) return
  qRun(getDb(), 'INSERT INTO note_versions(id,note_id,title,body,reason) VALUES(?,?,?,?,?)', [uuid(), note.id, note.title, note.body, reason])
}

export function registerNoteIpcs(ipc: typeof ipcMain): void {
  ipc.handle('notes:list', () => qAll(getDb(), 'SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY sort, created_at'))
  ipc.handle('notes:get', (_e, id: string) => qOne(getDb(), 'SELECT * FROM notes WHERE id=?', [id]))
  registerIpc(ipc, 'notes:upsert', (_e, n: any) => {
    const id = n.id ?? uuid()
    const before = qOne(getDb(), 'SELECT id,title,body FROM notes WHERE id=?', [id]) as { id: string; title: string; body: string } | undefined
    if (before) saveVersion(before, '编辑前自动快照')
    qRun(getDb(), `INSERT INTO notes(id,title,body,parent_id,sort,tags,kind,favorite) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,parent_id=excluded.parent_id,sort=excluded.sort,tags=excluded.tags,kind=excluded.kind,updated_at=datetime('now')`, [id, n.title ?? 'untitled', n.body ?? '', n.parent_id ?? null, n.sort ?? 0, n.tags ?? null, n.kind ?? 'note', n.favorite ?? 0])
    schedulePersist(); return id
  })

  registerIpc(ipc, 'notes:patch', (_e, id: string, patch: any) => {
    if (patch.title !== undefined || patch.body !== undefined) {
      const before = qOne(getDb(), 'SELECT id,title,body FROM notes WHERE id=?', [id]) as { id: string; title: string; body: string } | undefined
      if (before && (patch.title !== undefined && patch.title !== before.title || patch.body !== undefined && patch.body !== before.body)) saveVersion(before, '编辑前自动快照')
    }
    if (patch.title !== undefined) qRun(getDb(), 'UPDATE notes SET title=?,updated_at=datetime("now") WHERE id=?', [patch.title, id])
    if (patch.body !== undefined) qRun(getDb(), 'UPDATE notes SET body=?,updated_at=datetime("now") WHERE id=?', [patch.body, id])
    if (patch.tags !== undefined) qRun(getDb(), 'UPDATE notes SET tags=?,updated_at=datetime("now") WHERE id=?', [patch.tags, id])
    if (patch.parent_id !== undefined) qRun(getDb(), 'UPDATE notes SET parent_id=?,updated_at=datetime("now") WHERE id=?', [patch.parent_id, id])
    if (patch.favorite !== undefined) qRun(getDb(), 'UPDATE notes SET favorite=?,updated_at=datetime("now") WHERE id=?', [patch.favorite ? 1 : 0, id])
    schedulePersist(); return true
  })

  registerIpc(ipc, 'notes:create-from-message', (_e, args: { messageId: string; title?: string; tags?: string; parentId?: string | null }) => {
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

    const requestedFolder = args.parentId ? qOne(getDb(), `SELECT id FROM notes WHERE id=? AND kind='folder' AND deleted_at IS NULL`, [args.parentId]) as { id: string } | undefined : undefined
    const parentId = requestedFolder?.id || inbox.id
    const noteId = uuid()
    const conversationTitle = row.conversation_title || '未命名对话'
    const content = row.content || ''
    const fallbackTitle = content.replace(/\s+/g, ' ').trim().slice(0, 48) || 'AI 知识片段'
    const title = (args.title || fallbackTitle).trim().slice(0, 120) || 'AI 知识片段'
    const body = `> 来源：${row.role === 'assistant' ? 'AI 回答' : '我的消息'} · ${conversationTitle}\n> 已保存至知识库\n\n${content}`
    qRun(getDb(), 'INSERT INTO notes(id,title,body,parent_id,sort,tags,kind) VALUES(?,?,?,?,?,?,?)',
      [noteId, title, body, parentId, Date.now(), args.tags ?? 'AI,收集箱', 'note'])
    qRun(getDb(), 'INSERT INTO links(id,source_type,source_id,target_type,target_id,link_type,created_at) VALUES(?,?,?,?,?,?,unixepoch())',
      [uuid(), 'message', row.id, 'note', noteId, 'saved_to_knowledge'])
    schedulePersist()
    return noteId
  })
  ipc.handle('notes:delete', (_e, id: string) => {
    qRun(getDb(), 'UPDATE notes SET deleted_at=unixepoch() WHERE id=?', [id])
    schedulePersist(); return true
  })

  ipc.handle('notes:versions', (_e, noteId: string) => qAll(getDb(), 'SELECT id,note_id,title,reason,created_at FROM note_versions WHERE note_id=? ORDER BY created_at DESC LIMIT 80', [noteId]))
  registerIpc(ipc, 'notes:version:get', (_e, id: string) => qOne(getDb(), 'SELECT * FROM note_versions WHERE id=?', [id]))
  registerIpc(ipc, 'notes:version:restore', (_e, id: string) => {
    const version = qOne(getDb(), 'SELECT * FROM note_versions WHERE id=?', [id]) as { note_id: string; title: string; body: string } | undefined
    if (!version) return false
    const current = qOne(getDb(), 'SELECT id,title,body FROM notes WHERE id=?', [version.note_id]) as { id: string; title: string; body: string } | undefined
    if (current) saveVersion(current, '回滚前快照')
    qRun(getDb(), 'UPDATE notes SET title=?,body=?,updated_at=datetime("now") WHERE id=?', [version.title, version.body, version.note_id])
    schedulePersist(); return true
  })

  registerIpc(ipc, 'blocks:upsert', (_e, block: { id?: string; sourceType: string; sourceId: string; blockType?: string; text?: string; anchor?: string; metadata?: string }) => {
    const id = block.id ?? uuid()
    qRun(getDb(), `INSERT INTO content_blocks(id,source_type,source_id,block_type,text,anchor,metadata) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET text=excluded.text,anchor=excluded.anchor,metadata=excluded.metadata,updated_at=datetime('now')`, [id, block.sourceType, block.sourceId, block.blockType ?? 'text', block.text ?? '', block.anchor ?? null, block.metadata ?? null])
    schedulePersist(); return id
  })
  ipc.handle('blocks:get', (_e, id: string) => qOne(getDb(), 'SELECT * FROM content_blocks WHERE id=?', [id]))
  ipc.handle('blocks:list', () => qAll(getDb(), 'SELECT * FROM content_blocks ORDER BY updated_at DESC LIMIT 300'))
  ipc.handle('blocks:forSource', (_e, sourceType: string, sourceId: string) => qAll(getDb(), 'SELECT * FROM content_blocks WHERE source_type=? AND source_id=? ORDER BY updated_at DESC', [sourceType, sourceId]))
  ipc.handle('blocks:delete', (_e, id: string) => { qRun(getDb(), 'DELETE FROM content_blocks WHERE id=?', [id]); schedulePersist(); return true })

  ipc.handle('attrs:get', (_e, entityType: string, entityId: string) => qAll(getDb(), 'SELECT attr_key,attr_value FROM entity_attributes WHERE entity_type=? AND entity_id=? ORDER BY attr_key', [entityType, entityId]))
  registerIpc(ipc, 'attrs:set', (_e, entityType: string, entityId: string, attrs: Record<string, string>) => {
    qRun(getDb(), 'DELETE FROM entity_attributes WHERE entity_type=? AND entity_id=?', [entityType, entityId])
    for (const [key, value] of Object.entries(attrs)) {
      if (key.trim() && value.trim()) qRun(getDb(), 'INSERT INTO entity_attributes(id,entity_type,entity_id,attr_key,attr_value) VALUES(?,?,?,?,?)', [uuid(), entityType, entityId, key.trim(), value.trim()])
    }
    schedulePersist(); return true
  })
  ipc.handle('attrs:list', (_e, entityType: string) => qAll(getDb(), 'SELECT * FROM entity_attributes WHERE entity_type=? ORDER BY attr_key', [entityType]))

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
