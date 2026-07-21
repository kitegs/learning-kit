import { ipcMain } from 'electron'
import { getDb, schedulePersist } from './db'

function all<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql)
  stmt.bind(params as any)
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as T)
  stmt.reset()
  return rows
}
function get<T>(sql: string, params: unknown[] = []): T | undefined {
  return all<T>(sql, params)[0]
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

const DAY = 24 * 3600 * 1000

/** SM-2 style update */
function schedule(prev: { ease: number; interval: number; reps: number; lapses: number }, rating: 1 | 3 | 4 | 5) {
  let ease = prev.ease
  let interval = prev.interval
  let reps = prev.reps
  let lapses = prev.lapses

  if (rating === 1) {
    lapses += 1
    reps = 0
    interval = 0
    ease = Math.max(1.3, ease - 0.2)
    return { ease, interval, reps, lapses, dueInDays: 0 }
  }
  // passed
  reps += 1
  let q = rating === 3 ? 2 : rating === 4 ? 4 : 5
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  if (reps === 1) interval = 1
  else if (reps === 2) interval = 6
  else interval = Math.round(prev.interval * ease)
  if (rating === 3) interval = Math.max(1, Math.round(interval * 0.5))
  return { ease, interval, reps, lapses, dueInDays: interval }
}

export function registerSrsIpcs(ipc: typeof ipcMain): void {
  ipc.handle('deck:list', () => all('SELECT * FROM decks ORDER BY sort, created_at'))
  ipc.handle('deck:upsert', (_e, d) => {
    run(`INSERT INTO decks(id,title,parent_id,sort) VALUES(?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, parent_id=excluded.parent_id, sort=excluded.sort`,
      [d.id, d.title ?? '新牌组', d.parent_id ?? null, d.sort ?? 0])
    schedulePersist(); return true
  })
  ipc.handle('deck:delete', (_e, id: string) => {
    run('DELETE FROM cards WHERE deck_id=?', [id])
    run('DELETE FROM decks WHERE id=?', [id])
    schedulePersist(); return true
  })
  ipc.handle('deck:rename', (_e, id: string, title: string) => {
    run('UPDATE decks SET title=? WHERE id=?', [title, id]); schedulePersist(); return true
  })

  ipc.handle('card:list', (_e, deckId: string) => all('SELECT * FROM cards WHERE deck_id=? ORDER BY created_at', [deckId]))
  ipc.handle('card:all', () => all('SELECT * FROM cards ORDER BY due, created_at'))
  ipc.handle('card:save', (_e, c) => {
    const id = c.id ?? uuid()
    run(`INSERT INTO cards(id,deck_id,front,back,kind,tags,source_note_id,source_book_id)
         VALUES(?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET front=excluded.front, back=excluded.back, kind=excluded.kind, tags=excluded.tags, updated_at=datetime('now')`,
      [id, c.deckId, c.front ?? '', c.back ?? '', c.kind ?? 'qa', c.tags ?? null, c.sourceNoteId ?? null, c.sourceBookId ?? null])
    schedulePersist(); return id
  })
  ipc.handle('card:delete', (_e, id: string) => { run('DELETE FROM cards WHERE id=?', [id]); schedulePersist(); return true })

  ipc.handle('card:reset', (_e, id: string) => {
    run(`UPDATE cards SET ease=2.5, interval=0, reps=0, lapses=0, due=datetime('now'), updated_at=datetime('now') WHERE id=?`, [id])
    schedulePersist(); return true
  })

  // cards due now (compare due <= today)
  ipc.handle('srs:due', async () => {
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 19).replace('T', ' ')
    return all('SELECT * FROM cards WHERE due <= ? ORDER BY due, created_at', [todayStr])
  })

  ipc.handle('srs:review', async (_e, cardId: string, rating: 1 | 3 | 4 | 5) => {
    const card = get<any>('SELECT * FROM cards WHERE id=?', [cardId])
    if (!card) return null
    const result = schedule({ ease: card.ease, interval: card.interval, reps: card.reps, lapses: card.lapses }, rating)
    const due = new Date(Date.now() + result.dueInDays * DAY)
    const dueStr = due.toISOString().slice(0, 19).replace('T', ' ')
    run('UPDATE cards SET ease=?, interval=?, reps=?, lapses=?, due=?, updated_at=datetime("now") WHERE id=?',
      [result.ease, result.interval, result.reps, result.lapses, dueStr, cardId])
    run('INSERT INTO review_log(id,card_id,rating,ease,interval,due) VALUES(?,?,?,?,?,?)',
      [uuid(), cardId, rating, result.ease, result.interval, dueStr])
    // streak
    const dStr = new Date().toISOString().slice(0, 10)
    const row = get<{ count: number }>('SELECT count FROM streak WHERE date=?', [dStr])
    if (row) run('UPDATE streak SET count=? WHERE date=?', [row.count + 1, dStr])
    else run('INSERT INTO streak(date,count) VALUES(?,1)', [dStr])
    schedulePersist()
    return { ease: result.ease, interval: result.interval, reps: result.reps, lapses: result.lapses, due: dueStr }
  })

  ipc.handle('srs:stats', async () => {
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 19).replace('T', ' ')
    const due = (all<{ c: number }>('SELECT COUNT(*) c FROM cards WHERE due <= ?', [todayStr])[0] as any)?.c ?? 0
    const total = (all<{ c: number }>('SELECT COUNT(*) c FROM cards')[0] as any)?.c ?? 0
    const overdue = (all<{ c: number }>('SELECT count(*) c FROM review_log WHERE reviewed_at >= ?', [todayStr])[0] as any)?.c ?? 0
    // mastery distribution
    const naive = (all<{ c: number; interval: number }>('SELECT interval, COUNT(*) c FROM cards GROUP BY interval'))
    const streakRows = all<{ date: string }>('SELECT date FROM streak ORDER BY date DESC LIMIT 60')
    // compute streak
    let streak = 0
    const dateSet = new Set(streakRows.map((r) => r.date))
    let cursor = new Date()
    while (dateSet.has(cursor.toISOString().slice(0, 10))) {
      streak += 1
      cursor = new Date(cursor.getTime() - DAY)
    }
    return { due, dueCount: due, total, overdueReviewed: overdue, masteryByInterval: naive, streak, streakDays: streakRows }
  })

  ipc.handle('srs:fromNote', async (_e, deckId: string, front: string, back: string, sourceNoteId?: string) => {
    const id = uuid()
    run(`INSERT INTO cards(id,deck_id,front,back,kind,source_note_id) VALUES(?,?,?,?,?,?)`,
      [id, deckId, front, back, 'qa', sourceNoteId ?? null])
    schedulePersist(); return id
  })
}