import { ipcMain } from 'electron'
import { getDb, schedulePersist, uuid, qAll, qOne, qRun } from './db'

const DAY = 24 * 3600 * 1000

function schedule2(prev: { ease: number; interval: number; reps: number; lapses: number }, rating: 1 | 3 | 4 | 5) {
  let ease = prev.ease, interval = prev.interval, reps = prev.reps, lapses = prev.lapses
  if (rating === 1) { lapses++; reps = 0; interval = 0; ease = Math.max(1.3, ease - 0.2); return { ease, interval, reps, lapses, dueInDays: 0 } }
  reps++
  const q = rating === 3 ? 2 : rating === 4 ? 4 : 5
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  if (reps === 1) interval = 1
  else if (reps === 2) interval = 6
  else interval = Math.round(prev.interval * ease)
  if (rating === 3) interval = Math.max(1, Math.round(interval * 0.5))
  return { ease, interval, reps, lapses, dueInDays: interval }
}

export function registerSrsIpcs(ipc: typeof ipcMain): void {
  ipc.handle('deck:list', () => qAll(getDb(), 'SELECT * FROM decks ORDER BY sort, created_at'))
  ipc.handle('deck:upsert', (_e, d: any) => {
    qRun(getDb(), `INSERT INTO decks(id,title,parent_id,sort) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,parent_id=excluded.parent_id,sort=excluded.sort`,
      [d.id, d.title ?? 'New Deck', d.parent_id ?? null, d.sort ?? 0])
    schedulePersist(); return true
  })
  ipc.handle('deck:delete', (_e, id: string) => {
    qRun(getDb(), 'DELETE FROM cards WHERE deck_id=?', [id])
    qRun(getDb(), 'DELETE FROM decks WHERE id=?', [id])
    schedulePersist(); return true
  })
  ipc.handle('deck:rename', (_e, id: string, title: string) => {
    qRun(getDb(), 'UPDATE decks SET title=? WHERE id=?', [title, id]); schedulePersist(); return true
  })

  ipc.handle('card:list', (_e, deckId: string) => qAll(getDb(), 'SELECT * FROM cards WHERE deck_id=? ORDER BY created_at', [deckId]))
  ipc.handle('card:all', () => qAll(getDb(), 'SELECT * FROM cards ORDER BY due, created_at'))
  ipc.handle('card:save', (_e, c: any) => {
    const id = c.id ?? uuid()
    qRun(getDb(), `INSERT INTO cards(id,deck_id,front,back,kind,tags) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET front=excluded.front,back=excluded.back,kind=excluded.kind,tags=excluded.tags,updated_at=datetime('now')`,
      [id, c.deckId, c.front ?? '', c.back ?? '', c.kind ?? 'qa', c.tags ?? null])
    schedulePersist(); return id
  })
  ipc.handle('card:delete', (_e, id: string) => { qRun(getDb(), 'DELETE FROM cards WHERE id=?', [id]); schedulePersist(); return true })
  ipc.handle('card:reset', (_e, id: string) => {
    qRun(getDb(), `UPDATE cards SET ease=2.5,interval=0,reps=0,lapses=0,due=datetime('now'),updated_at=datetime('now') WHERE id=?`, [id])
    schedulePersist(); return true
  })

  ipc.handle('srs:due', async () => {
    const today = new Date().toISOString().slice(0, 19).replace('T', ' ')
    return qAll(getDb(), 'SELECT * FROM cards WHERE due <= ? ORDER BY due, created_at', [today])
  })

  ipc.handle('srs:review', async (_e, cardId: string, rating: 1 | 3 | 4 | 5) => {
    const card = qOne(getDb(), 'SELECT * FROM cards WHERE id=?', [cardId])
    if (!card) return null
    const result = schedule2({ ease: card.ease, interval: card.interval, reps: card.reps, lapses: card.lapses }, rating)
    const due = new Date(Date.now() + result.dueInDays * DAY)
    const dueStr = due.toISOString().slice(0, 19).replace('T', ' ')
    qRun(getDb(), 'UPDATE cards SET ease=?,interval=?,reps=?,lapses=?,due=?,updated_at=datetime("now") WHERE id=?',
      [result.ease, result.interval, result.reps, result.lapses, dueStr, cardId])
    qRun(getDb(), 'INSERT INTO review_log(id,card_id,rating,ease,interval,due) VALUES(?,?,?,?,?,?)',
      [uuid(), cardId, rating, result.ease, result.interval, dueStr])
    const dStr = new Date().toISOString().slice(0, 10)
    const row = qOne(getDb(), 'SELECT count FROM streak WHERE date=?', [dStr])
    if (row) qRun(getDb(), 'UPDATE streak SET count=? WHERE date=?', [row.count + 1, dStr])
    else qRun(getDb(), 'INSERT INTO streak(date,count) VALUES(?,1)', [dStr])
    schedulePersist()
    return { ease: result.ease, interval: result.interval, reps: result.reps, lapses: result.lapses, due: dueStr }
  })

  ipc.handle('srs:stats', async () => {
    const today = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const due = (qOne(getDb(), 'SELECT COUNT(*) c FROM cards WHERE due <= ?', [today]) as any)?.c ?? 0
    const total = (qOne(getDb(), 'SELECT COUNT(*) c FROM cards') as any)?.c ?? 0
    const overdue = (qOne(getDb(), 'SELECT COUNT(*) c FROM review_log WHERE reviewed_at >= ?', [today]) as any)?.c ?? 0
    const naive = qAll(getDb(), 'SELECT interval, COUNT(*) c FROM cards GROUP BY interval')
    const streakRows = qAll(getDb(), 'SELECT date FROM streak ORDER BY date DESC LIMIT 60')
    let streak = 0
    const dateSet = new Set(streakRows.map((r: any) => r.date))
    let cursor = new Date()
    while (dateSet.has(cursor.toISOString().slice(0, 10))) { streak++; cursor = new Date(cursor.getTime() - DAY) }
    return { due, dueCount: due, total, overdueReviewed: overdue, masteryByInterval: naive, streak, streakDays: streakRows }
  })

  ipc.handle('srs:fromNote', async (_e, deckId: string, front: string, back: string, sourceNoteId?: string) => {
    const id = uuid()
    qRun(getDb(), 'INSERT INTO cards(id,deck_id,front,back,kind) VALUES(?,?,?,?,?)', [id, deckId, front, back, 'qa'])
    if (sourceNoteId) {
      qRun(getDb(), 'INSERT INTO links(id,source_type,source_id,target_type,target_id,link_type,created_at) VALUES(?,?,?,?,?,?,unixepoch())',
        [uuid(), 'note', sourceNoteId, 'card', id, 'derived_from'])
    }
    schedulePersist()
    return id
  })
}