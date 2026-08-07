import { ipcMain, safeStorage } from 'electron'
import { getDb, schedulePersist, uuid, qAll, qOne, qRun } from './db'
import { registerIpc } from './ipc-helpers'

export function registerDbIpcs(ipc: typeof ipcMain): void {
  const isSecureKey = (key: string) => key.startsWith('apiKey.')
  const securePrefix = 'lk-secure:v1:'
  const encodeSetting = (key: string, value: string) => {
    if (!isSecureKey(key) || !value || !safeStorage.isEncryptionAvailable()) return value
    return securePrefix + safeStorage.encryptString(value).toString('base64')
  }
  const decodeSetting = (key: string, value: string) => {
    if (!isSecureKey(key) || !value.startsWith(securePrefix)) return value
    try { return safeStorage.decryptString(Buffer.from(value.slice(securePrefix.length), 'base64')) } catch { return '' }
  }
  ipc.handle('db:settings:get', (_e, key: string) => {
    const row = qOne(getDb(), 'SELECT value FROM settings WHERE key=?', [key])
    return row?.value !== undefined ? decodeSetting(key, String(row.value)) : null
  })

  ipc.handle('db:settings:set', (_e, key: string, value: string) => {
    qRun(getDb(), 'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, encodeSetting(key, value)])
    schedulePersist()
    return true
  })

  ipc.handle('db:settings:all', () => qAll(getDb(), 'SELECT key,value FROM settings').map((row: { key: string; value: string }) => ({ ...row, value: decodeSetting(row.key, row.value) })))

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
  registerIpc(ipc, 'db:turn:reparent', (_e, args: { turnId: string; targetConversationId: string; parentTurnId?: string | null; foldId?: string | null; position: 'before' | 'inside' | 'after'; referenceTurnId?: string | null }) => {
    const d = getDb()
    const source = qOne(d, 'SELECT conversation_id,parent_turn_id,fold_id,MIN(sort) AS sort FROM messages WHERE turn_id=?', [args.turnId]) as { conversation_id?: string; parent_turn_id?: string | null; fold_id?: string | null; sort?: number } | undefined
    if (!source?.conversation_id) throw new Error('找不到要移动的问答轮次')
    const branch = qAll(d, `WITH RECURSIVE branch(turn_id) AS (
      SELECT ? UNION SELECT DISTINCT m.turn_id FROM messages m JOIN branch b ON m.parent_turn_id=b.turn_id
    ) SELECT turn_id FROM branch`, [args.turnId]).map((row: { turn_id: string }) => row.turn_id)
    if (args.parentTurnId && branch.includes(args.parentTurnId)) throw new Error('不能把问答拖入自身或其追问')
    if (args.referenceTurnId && branch.includes(args.referenceTurnId)) throw new Error('不能把问答拖到自身分支内')
    if (args.parentTurnId) {
      const parent = qOne(d, 'SELECT conversation_id FROM messages WHERE turn_id=? LIMIT 1', [args.parentTurnId]) as { conversation_id?: string } | undefined
      if (!parent || parent.conversation_id !== args.targetConversationId) throw new Error('目标追问不在当前对话中')
    }
    if (args.foldId) {
      const fold = qOne(d, 'SELECT conversation_id FROM conversation_folds WHERE id=?', [args.foldId]) as { conversation_id?: string } | undefined
      if (!fold || fold.conversation_id !== args.targetConversationId) throw new Error('目标章节不在当前对话中')
    }
    const reference = args.referenceTurnId ? qOne(d, 'SELECT MIN(sort) AS first_sort, MAX(sort) AS last_sort FROM messages WHERE turn_id=?', [args.referenceTurnId]) as { first_sort?: number; last_sort?: number } | undefined : undefined
    const sibling = qOne(d, 'SELECT MAX(sort) AS last_sort FROM messages WHERE conversation_id=? AND parent_turn_id IS ? AND fold_id IS ? AND turn_id<>?', [args.targetConversationId, args.parentTurnId ?? null, args.foldId ?? null, args.turnId]) as { last_sort?: number } | undefined
    const base = args.position === 'before' && reference?.first_sort !== undefined ? Number(reference.first_sort) - 0.25
      : args.position === 'after' && reference?.last_sort !== undefined ? Number(reference.last_sort) + 0.25
        : Number(sibling?.last_sort ?? Date.now()) + 1
    const originalBase = Number(source.sort ?? 0)
    qRun(d, `WITH RECURSIVE branch(turn_id) AS (
      SELECT ? UNION SELECT DISTINCT m.turn_id FROM messages m JOIN branch b ON m.parent_turn_id=b.turn_id
    ) UPDATE messages SET
      origin_conversation_id=COALESCE(origin_conversation_id, conversation_id),
      origin_fold_id=CASE WHEN origin_conversation_id IS NULL THEN fold_id ELSE origin_fold_id END,
      origin_sort=COALESCE(origin_sort, sort),
      origin_parent_turn_id=CASE WHEN origin_conversation_id IS NULL THEN parent_turn_id ELSE origin_parent_turn_id END
      WHERE turn_id IN (SELECT turn_id FROM branch)`, [args.turnId])
    qRun(d, `WITH RECURSIVE branch(turn_id) AS (
      SELECT ? UNION SELECT DISTINCT m.turn_id FROM messages m JOIN branch b ON m.parent_turn_id=b.turn_id
    ) UPDATE messages SET conversation_id=?, fold_id=NULL, sort=sort-?+? WHERE turn_id IN (SELECT turn_id FROM branch)`, [args.turnId, args.targetConversationId, originalBase, base])
    qRun(d, 'UPDATE messages SET parent_turn_id=?, fold_id=? WHERE turn_id=?', [args.parentTurnId ?? null, args.parentTurnId ? null : (args.foldId ?? null), args.turnId])
    schedulePersist(); return true
  })
  registerIpc(ipc, 'db:turn:restore', (_e, turnId: string) => {
    qRun(getDb(), `WITH RECURSIVE branch(turn_id) AS (
      SELECT ? UNION SELECT DISTINCT m.turn_id FROM messages m JOIN branch b ON m.parent_turn_id=b.turn_id
    ) UPDATE messages SET conversation_id=COALESCE(origin_conversation_id, conversation_id), fold_id=origin_fold_id, sort=COALESCE(origin_sort, sort), origin_conversation_id=NULL, origin_fold_id=NULL, origin_sort=NULL WHERE turn_id IN (SELECT turn_id FROM branch)`, [turnId])
    qRun(getDb(), 'UPDATE messages SET parent_turn_id=COALESCE(origin_parent_turn_id,parent_turn_id), origin_parent_turn_id=NULL WHERE turn_id=?', [turnId])
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

  // Auditable AI write proposals. These rows are local-only and never grant automatic execution.
  registerIpc(ipc, 'ai:tool-run:create', (_e, run: { conversationId?: string | null; actionType: string; params?: string; preview?: string; rollback?: string }) => {
    const id = uuid()
    qRun(getDb(), 'INSERT INTO ai_tool_runs(id,conversation_id,action_type,params_json,preview,status,rollback_json) VALUES(?,?,?,?,?,?,?)',
      [id, run.conversationId ?? null, run.actionType, run.params ?? '[]', run.preview ?? null, 'pending', run.rollback ?? null])
    schedulePersist(); return id
  })
  registerIpc(ipc, 'ai:tool-run:complete', (_e, id: string, status: 'applied' | 'failed' | 'ignored', result?: string) => {
    qRun(getDb(), 'UPDATE ai_tool_runs SET status=?,result_json=?,completed_at=datetime("now") WHERE id=?', [status, result ?? null, id])
    schedulePersist(); return true
  })
  ipc.handle('ai:tool-run:list', (_e, conversationId?: string | null) => {
    if (conversationId) return qAll(getDb(), 'SELECT * FROM ai_tool_runs WHERE conversation_id=? ORDER BY created_at DESC LIMIT 80', [conversationId])
    return qAll(getDb(), 'SELECT * FROM ai_tool_runs ORDER BY created_at DESC LIMIT 120')
  })

  ipc.handle('db:uuid', () => uuid())
}
