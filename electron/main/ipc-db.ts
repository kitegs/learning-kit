import { ipcMain } from 'electron'
import { getDb, schedulePersist, uuid, qAll, qOne, qRun } from './db'
import { registerIpc } from './ipc-helpers'

export function registerDbIpcs(ipc: typeof ipcMain): void {
  ipc.handle('db:settings:get', (_e, key: string) => {
    const row = qOne(getDb(), 'SELECT value FROM settings WHERE key=?', [key])
    return row?.value ?? null
  })

  ipc.handle('db:settings:set', (_e, key: string, value: string) => {
    qRun(getDb(), 'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value])
    return true
  })

  ipc.handle('db:settings:all', () => qAll(getDb(), 'SELECT key,value FROM settings'))

  // Groups
  ipc.handle('db:groups:tree', () => qAll(getDb(), 'SELECT * FROM groups WHERE deleted_at IS NULL ORDER BY sort, created_at'))

  ipc.handle('db:group:upsert', (_e, g: any) => {
    qRun(getDb(), `INSERT INTO groups(id,parent_id,title,sort,expanded) VALUES(?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id, title=excluded.title, sort=excluded.sort, expanded=excluded.expanded`,
      [g.id, g.parent_id ?? null, g.title ?? 'untitled', g.sort ?? 0, g.expanded ?? 1])
    return true
  })

  ipc.handle('db:group:delete', (_e, id: string) => {
    qRun(getDb(), 'UPDATE groups SET deleted_at=unixepoch() WHERE id=?', [id])
    return true
  })

  // Conversations
  ipc.handle('db:conv:list', (_e, groupId: string | null) => {
    if (groupId)
      return qAll(getDb(), 'SELECT * FROM conversations WHERE group_id=? AND deleted_at IS NULL ORDER BY sort, created_at', [groupId])
    return qAll(getDb(), 'SELECT * FROM conversations WHERE group_id IS NULL AND deleted_at IS NULL ORDER BY sort, created_at')
  })

  ipc.handle('db:conv:all', () => qAll(getDb(), 'SELECT * FROM conversations WHERE deleted_at IS NULL ORDER BY updated_at DESC'))

  registerIpc(ipc, 'db:conv:upsert', (_e, c: any) => {
    const title = (c.title ?? c.label) || 'new conversation'
    qRun(getDb(), `INSERT INTO conversations(id,group_id,title,sort,origin_context,folder_id) VALUES(?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id, title=excluded.title, sort=excluded.sort, updated_at=datetime('now')`,
      [c.id, c.group_id ?? null, title, c.sort ?? 0, c.origin_context ?? null, c.folder_id ?? null])
    schedulePersist()
    return true
  })

  ipc.handle('db:conv:delete', (_e, id: string) => {
    qRun(getDb(), 'UPDATE conversations SET deleted_at=unixepoch() WHERE id=?', [id])
    schedulePersist()
    return true
  })

  ipc.handle('db:conv:rename', (_e, id: string, title: string) => {
    qRun(getDb(), 'UPDATE conversations SET title=?, updated_at=datetime("now") WHERE id=?', [title, id])
    schedulePersist()
    return true
  })

  ipc.handle('db:conv:touch', (_e, id: string) => {
    qRun(getDb(), 'UPDATE conversations SET updated_at=datetime("now") WHERE id=?', [id])
    schedulePersist()
    return true
  })

  // Messages
  ipc.handle('db:msg:list', (_e, convId: string) =>
    qAll(getDb(), 'SELECT * FROM messages WHERE conversation_id=? AND deleted_at IS NULL ORDER BY sort, created_at', [convId])
  )

  registerIpc(ipc, 'db:msg:save', (_e, m: any) => {
    const id = m.id ?? uuid()
    const convId = m.conversation_id || m.conversationId
    qRun(getDb(), `INSERT INTO messages(id,conversation_id,role,content,note,model,sort,turn_id,parent_turn_id,collapsed,fold_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET content=excluded.content, note=excluded.note, model=excluded.model`,
      [id, convId, m.role ?? 'user', m.content ?? '', m.note ?? null, m.model ?? null, m.sort ?? 0, m.turn_id ?? id, m.parent_turn_id ?? null, m.collapsed ?? 0, m.fold_id ?? null])
    schedulePersist()
    return id
  })

  registerIpc(ipc, 'db:msg:patch', (_e, id: string, patch: any) => {
    if (patch.content !== undefined) qRun(getDb(), 'UPDATE messages SET content=? WHERE id=?', [patch.content, id])
    if (patch.note !== undefined) qRun(getDb(), 'UPDATE messages SET note=? WHERE id=?', [patch.note ?? null, id])
    schedulePersist()
    return true
  })

  registerIpc(ipc, 'db:turn:collapse', (_e, turnId: string, collapsed: boolean) => {
    qRun(getDb(), 'UPDATE messages SET collapsed=? WHERE turn_id=?', [collapsed ? 1 : 0, turnId])
    schedulePersist(); return true
  })
  registerIpc(ipc, 'db:turn:move', (_e, args: { turnId: string; targetConversationId: string; afterTurnId?: string | null; targetFoldId?: string | null }) => {
    const target = args.afterTurnId ? qAll(getDb(), 'SELECT MAX(sort) AS sort FROM messages WHERE turn_id=?', [args.afterTurnId])[0] as { sort?: number } | undefined : undefined
    const sort = (target?.sort ?? Date.now()) + 1
    qRun(getDb(), `WITH RECURSIVE branch(turn_id) AS (
      SELECT ? UNION SELECT DISTINCT m.turn_id FROM messages m JOIN branch b ON m.parent_turn_id=b.turn_id
    ) UPDATE messages SET origin_conversation_id=conversation_id, origin_fold_id=fold_id, origin_sort=sort WHERE turn_id IN (SELECT turn_id FROM branch)`, [args.turnId])
    qRun(getDb(), `WITH RECURSIVE branch(turn_id) AS (
      SELECT ? UNION SELECT DISTINCT m.turn_id FROM messages m JOIN branch b ON m.parent_turn_id=b.turn_id
    ) UPDATE messages SET conversation_id=?, fold_id=?, sort=? WHERE turn_id IN (SELECT turn_id FROM branch)`, [args.turnId, args.targetConversationId, args.targetFoldId ?? null, sort])
    schedulePersist(); return true
  })
  registerIpc(ipc, 'db:turn:restore', (_e, turnId: string) => {
    qRun(getDb(), `WITH RECURSIVE branch(turn_id) AS (
      SELECT ? UNION SELECT DISTINCT m.turn_id FROM messages m JOIN branch b ON m.parent_turn_id=b.turn_id
    ) UPDATE messages SET conversation_id=COALESCE(origin_conversation_id, conversation_id), fold_id=origin_fold_id, sort=COALESCE(origin_sort, sort), origin_conversation_id=NULL, origin_fold_id=NULL, origin_sort=NULL WHERE turn_id IN (SELECT turn_id FROM branch)`, [turnId])
    schedulePersist(); return true
  })
  ipc.handle('db:fold:list', (_e, conversationId: string) => qAll(getDb(), 'SELECT * FROM conversation_folds WHERE conversation_id=? ORDER BY sort, created_at', [conversationId]))
  registerIpc(ipc, 'db:fold:create', (_e, fold: { conversationId: string; title?: string; tags?: string; sort?: number }) => {
    const id = uuid()
    qRun(getDb(), 'INSERT INTO conversation_folds(id,conversation_id,title,tags,sort) VALUES(?,?,?,?,?)', [id, fold.conversationId, fold.title ?? '折叠组', fold.tags ?? '', fold.sort ?? Date.now()])
    schedulePersist(); return id
  })
  registerIpc(ipc, 'db:fold:patch', (_e, id: string, patch: { title?: string; tags?: string; collapsed?: boolean }) => {
    if (patch.title !== undefined) qRun(getDb(), 'UPDATE conversation_folds SET title=? WHERE id=?', [patch.title, id])
    if (patch.tags !== undefined) qRun(getDb(), 'UPDATE conversation_folds SET tags=? WHERE id=?', [patch.tags, id])
    if (patch.collapsed !== undefined) qRun(getDb(), 'UPDATE conversation_folds SET collapsed=? WHERE id=?', [patch.collapsed ? 1 : 0, id])
    schedulePersist(); return true
  })
  ipc.handle('db:fold:delete', (_e, id: string) => { qRun(getDb(), 'UPDATE messages SET fold_id=NULL WHERE fold_id=?', [id]); qRun(getDb(), 'DELETE FROM conversation_folds WHERE id=?', [id]); schedulePersist(); return true })

  ipc.handle('db:msg:delete', (_e, id: string) => {
    qRun(getDb(), 'UPDATE messages SET deleted_at=unixepoch() WHERE id=?', [id])
    schedulePersist()
    return true
  })

  ipc.handle('db:uuid', () => uuid())
}
