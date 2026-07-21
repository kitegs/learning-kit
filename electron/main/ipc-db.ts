import { ipcMain } from 'electron'
import { getDb, schedulePersist } from './db'

function run(sql: string, params: unknown[] = []): void {
  const stmt = getDb().prepare(sql)
  stmt.bind(params as any)
  stmt.step()
  stmt.free()
}

function all<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql)
  stmt.bind(params as any)
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as T)
  stmt.free()
  return rows
}

function get<T>(sql: string, params: unknown[] = []): T | undefined {
  return all<T>(sql, params)[0]
}

const uuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })

export function registerDbIpcs(ipc: typeof ipcMain): void {
  ipc.handle('db:settings:get', (_e, key: string) => {
    const row = get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
    return row?.value ?? null
  })

  ipc.handle('db:settings:set', (_e, key: string, value: string) => {
    run(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [key, value])
    schedulePersist()
    return true
  })

  ipc.handle('db:settings:all', () => all<{ key: string; value: string }>('SELECT key,value FROM settings'))

  // ---- Groups ----
  ipc.handle('db:groups:tree', () => all('SELECT * FROM groups ORDER BY sort, created_at'))

  ipc.handle('db:group:upsert', (_e, g) => {
    run(`INSERT INTO groups(id,parent_id,title,sort,expanded) VALUES(?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         parent_id=excluded.parent_id, title=excluded.title, sort=excluded.sort, expanded=excluded.expanded`,
      [g.id, g.parent_id ?? null, g.title ?? 'untitled', g.sort ?? 0, g.expanded ?? 1])
    schedulePersist()
    return true
  })

  ipc.handle('db:group:delete', (_e, id: string) => {
    run('DELETE FROM groups WHERE id=?', [id])
    run('UPDATE groups SET parent_id=NULL WHERE parent_id=?', [id])
    schedulePersist()
    return true
  })

  // ---- Conversations ----
  ipc.handle('db:conv:list', (_e, groupId: string | null) => {
    if (groupId) return all('SELECT * FROM conversations WHERE group_id=? ORDER BY sort, created_at', [groupId])
    return all('SELECT * FROM conversations WHERE group_id IS NULL ORDER BY sort, created_at')
  })

  ipc.handle('db:conv:all', () => all('SELECT * FROM conversations ORDER BY updated_at DESC'))

  ipc.handle('db:conv:upsert', (_e, c) => {
    const title = (c.title ?? c.label) || '新的对话'
    run(`INSERT INTO conversations(id,group_id,title,sort) VALUES(?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         group_id=excluded.group_id, title=excluded.title, sort=excluded.sort, updated_at=datetime('now')`,
      [c.id, c.group_id ?? null, title, c.sort ?? 0])
    schedulePersist()
    return true
  })

  ipc.handle('db:conv:delete', (_e, id: string) => {
    run('DELETE FROM messages WHERE conversation_id=?', [id])
    run('DELETE FROM conversations WHERE id=?', [id])
    schedulePersist()
    return true
  })

  ipc.handle('db:conv:rename', (_e, id: string, title: string) => {
    run('UPDATE conversations SET title=?, updated_at=datetime("now") WHERE id=?', [title, id])
    schedulePersist()
    return true
  })

  ipc.handle('db:conv:touch', (_e, id: string) => {
    run('UPDATE conversations SET updated_at=datetime("now") WHERE id=?', [id])
    schedulePersist()
    return true
  })

  // ---- Messages ----
  ipc.handle('db:msg:list', (_e, convId: string) =>
    all('SELECT * FROM messages WHERE conversation_id=? ORDER BY sort, created_at', [convId])
  )

  ipc.handle('db:msg:save', (_e, m) => {
    const id = m.id ?? uuid()
    run(`INSERT INTO messages(id,conversation_id,role,content,note,model,sort) VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET content=excluded.content, note=excluded.note, model=excluded.model`,
      [id, m.conversationId, m.role ?? 'user', m.content ?? '', m.note ?? null, m.model ?? null, m.sort ?? 0])
    schedulePersist()
    return id
  })

  ipc.handle('db:msg:patch', (_e, id: string, patch) => {
    if (patch.content !== undefined) run('UPDATE messages SET content=? WHERE id=?', [patch.content, id])
    if (patch.note !== undefined) run('UPDATE messages SET note=? WHERE id=?', [patch.note ?? null, id])
    schedulePersist()
    return true
  })

  ipc.handle('db:msg:delete', (_e, id: string) => {
    run('DELETE FROM messages WHERE id=?', [id])
    schedulePersist()
    return true
  })

  ipc.handle('db:uuid', () => uuid())
}