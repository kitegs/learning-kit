import { ipcMain, dialog } from 'electron'
import { createEmptyCard, fsrs, Rating, type CardInput } from 'ts-fsrs'
import { getDb, schedulePersist, uuid, qAll, qOne, qRun } from './db'

const DAY = 24 * 3600 * 1000
const fsrsScheduler = fsrs({ enable_fuzz: false })
type StoredFsrsCard = Omit<CardInput, 'due' | 'last_review'> & { due: string; last_review?: string | null }

function dateString(value: Date): string { return value.toISOString().slice(0, 19).replace('T', ' ') }
function encodeFsrs(card: CardInput): string {
  return JSON.stringify({ ...card, due: new Date(card.due).toISOString(), last_review: card.last_review ? new Date(card.last_review).toISOString() : null })
}
function decodeFsrs(raw: string): CardInput {
  const card = JSON.parse(raw) as StoredFsrsCard
  return { ...card, due: new Date(card.due), last_review: card.last_review ? new Date(card.last_review) : undefined }
}
function createFsrsState(now = new Date()): string { return encodeFsrs(createEmptyCard(now)) }
function saveFsrsState(cardId: string, state: CardInput): void {
  qRun(getDb(), `INSERT INTO card_scheduling(card_id,algorithm,state_json,updated_at) VALUES(?,?,?,datetime('now'))
    ON CONFLICT(card_id) DO UPDATE SET algorithm=excluded.algorithm,state_json=excluded.state_json,updated_at=excluded.updated_at`, [cardId, 'fsrs', encodeFsrs(state)])
}
export function attachFsrsState(cardId: string): void {
  const exists = qOne(getDb(), 'SELECT card_id FROM card_scheduling WHERE card_id=?', [cardId])
  if (!exists) qRun(getDb(), 'INSERT INTO card_scheduling(card_id,algorithm,state_json) VALUES(?,?,?)', [cardId, 'fsrs', createFsrsState()])
}
function toLegacyInterval(now: Date, due: Date): number { return Math.max(0, Math.round((due.getTime() - now.getTime()) / DAY)) }

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
    if (!c.id) attachFsrsState(id)
    schedulePersist(); return id
  })
  ipc.handle('card:delete', (_e, id: string) => { qRun(getDb(), 'DELETE FROM card_scheduling WHERE card_id=?', [id]); qRun(getDb(), 'DELETE FROM cards WHERE id=?', [id]); schedulePersist(); return true })
  ipc.handle('card:reset', (_e, id: string) => {
    qRun(getDb(), `UPDATE cards SET ease=2.5,interval=0,reps=0,lapses=0,due=datetime('now'),updated_at=datetime('now') WHERE id=?`, [id])
    qRun(getDb(), 'DELETE FROM card_scheduling WHERE card_id=?', [id])
    attachFsrsState(id)
    schedulePersist(); return true
  })

  ipc.handle('srs:due', async () => {
    const today = new Date().toISOString().slice(0, 19).replace('T', ' ')
    return qAll(getDb(), 'SELECT * FROM cards WHERE due <= ? ORDER BY due, created_at', [today])
  })

  ipc.handle('srs:review', async (_e, cardId: string, rating: 1 | 3 | 4 | 5) => {
    const card = qOne(getDb(), 'SELECT * FROM cards WHERE id=?', [cardId])
    if (!card) return null
    const scheduling = qOne(getDb(), 'SELECT state_json FROM card_scheduling WHERE card_id=? AND algorithm=?', [cardId, 'fsrs']) as { state_json: string } | undefined
    if (scheduling) {
      const now = new Date()
      const grade = rating === 1 ? Rating.Again : rating === 3 ? Rating.Hard : rating === 4 ? Rating.Good : Rating.Easy
      const result = fsrsScheduler.next(decodeFsrs(scheduling.state_json), now, grade)
      const dueStr = dateString(result.card.due)
      const interval = toLegacyInterval(now, result.card.due)
      saveFsrsState(cardId, result.card)
      qRun(getDb(), 'UPDATE cards SET ease=?,interval=?,reps=?,lapses=?,due=?,updated_at=datetime("now") WHERE id=?',
        [Math.max(1.3, 3.2 - result.card.difficulty / 3), interval, result.card.reps, result.card.lapses, dueStr, cardId])
      qRun(getDb(), 'INSERT INTO review_log(id,card_id,rating,ease,interval,due) VALUES(?,?,?,?,?,?)',
        [uuid(), cardId, rating, Math.max(1.3, 3.2 - result.card.difficulty / 3), interval, dueStr])
      const dStr = now.toISOString().slice(0, 10)
      const row = qOne(getDb(), 'SELECT count FROM streak WHERE date=?', [dStr]) as { count: number } | undefined
      if (row) qRun(getDb(), 'UPDATE streak SET count=? WHERE date=?', [row.count + 1, dStr])
      else qRun(getDb(), 'INSERT INTO streak(date,count) VALUES(?,1)', [dStr])
      schedulePersist()
      return { ease: Math.max(1.3, 3.2 - result.card.difficulty / 3), interval, reps: result.card.reps, lapses: result.card.lapses, due: dueStr, algorithm: 'fsrs' }
    }
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
    return { ease: result.ease, interval: result.interval, reps: result.reps, lapses: result.lapses, due: dueStr, algorithm: 'sm2' }
  })

  ipc.handle('srs:preview', (_e, cardId: string) => {
    const scheduling = qOne(getDb(), 'SELECT state_json FROM card_scheduling WHERE card_id=? AND algorithm=?', [cardId, 'fsrs']) as { state_json: string } | undefined
    if (!scheduling) return null
    const now = new Date()
    const options = fsrsScheduler.repeat(decodeFsrs(scheduling.state_json), now)
    const intervalFor = (grade: Rating) => toLegacyInterval(now, options[grade].card.due)
    return { algorithm: 'fsrs', again: intervalFor(Rating.Again), hard: intervalFor(Rating.Hard), good: intervalFor(Rating.Good), easy: intervalFor(Rating.Easy) }
  })

  ipc.handle('srs:stats', async () => {
    const today = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const due = (qOne(getDb(), 'SELECT COUNT(*) c FROM cards WHERE due <= ?', [today]) as any)?.c ?? 0
    const total = (qOne(getDb(), 'SELECT COUNT(*) c FROM cards') as any)?.c ?? 0
    const overdue = (qOne(getDb(), 'SELECT COUNT(*) c FROM review_log WHERE reviewed_at >= ?', [today]) as any)?.c ?? 0
    const mastery = qOne(getDb(), `SELECT
      SUM(CASE WHEN reps=0 THEN 1 ELSE 0 END) AS fresh,
      SUM(CASE WHEN reps>0 AND (interval < 21 OR lapses > 1) THEN 1 ELSE 0 END) AS learning,
      SUM(CASE WHEN reps>0 AND interval >= 21 AND lapses <= 1 THEN 1 ELSE 0 END) AS mastered
      FROM cards`) as { fresh?: number; learning?: number; mastered?: number } | undefined
    const naive = qAll(getDb(), 'SELECT interval, COUNT(*) c FROM cards GROUP BY interval')
    const streakRows = qAll(getDb(), 'SELECT date FROM streak ORDER BY date DESC LIMIT 60')
    let streak = 0
    const dateSet = new Set(streakRows.map((r: any) => r.date))
    let cursor = new Date()
    while (dateSet.has(cursor.toISOString().slice(0, 10))) { streak++; cursor = new Date(cursor.getTime() - DAY) }
    const last30 = qOne(getDb(), `SELECT COUNT(*) total, SUM(CASE WHEN rating > 1 THEN 1 ELSE 0 END) correct FROM review_log WHERE reviewed_at >= datetime('now','-30 days')`) as { total?: number; correct?: number } | undefined
    const fsrsCount = (qOne(getDb(), "SELECT COUNT(*) c FROM card_scheduling WHERE algorithm='fsrs'") as { c?: number } | undefined)?.c ?? 0
    return { due, dueCount: due, total, overdueReviewed: overdue, masteryByInterval: naive, mastery: { fresh: mastery?.fresh ?? 0, learning: mastery?.learning ?? 0, mastered: mastery?.mastered ?? 0 }, streak, streakDays: streakRows, accuracy30: last30?.total ? Math.round(((last30.correct ?? 0) / last30.total) * 100) : null, fsrsCount }
  })

  ipc.handle('srs:fromNote', async (_e, deckId: string, front: string, back: string, sourceNoteId?: string) => {
    if (!deckId) {
      const existing = qOne(getDb(), 'SELECT id FROM decks ORDER BY sort, created_at LIMIT 1') as { id?: string } | undefined
      deckId = existing?.id || uuid()
      if (!existing?.id) qRun(getDb(), 'INSERT INTO decks(id,title,parent_id,sort) VALUES(?,?,?,?)', [deckId, '默认牌组', null, Date.now()])
    }
    const id = uuid()
    qRun(getDb(), 'INSERT INTO cards(id,deck_id,front,back,kind) VALUES(?,?,?,?,?)', [id, deckId, front, back, 'qa'])
    attachFsrsState(id)
    if (sourceNoteId) {
      qRun(getDb(), 'INSERT INTO links(id,source_type,source_id,target_type,target_id,link_type,created_at) VALUES(?,?,?,?,?,?,unixepoch())',
        [uuid(), 'note', sourceNoteId, 'card', id, 'derived_from'])
    }
    schedulePersist()
    return id
  })

  // Create a card while preserving a navigable learning source (note / conversation / book).
  ipc.handle('srs:fromSource', async (_e, deckId: string, front: string, back: string, sourceType?: string, sourceId?: string) => {
    if (!deckId) {
      const existing = qOne(getDb(), 'SELECT id FROM decks ORDER BY sort, created_at LIMIT 1') as { id?: string } | undefined
      deckId = existing?.id || uuid()
      if (!existing?.id) qRun(getDb(), 'INSERT INTO decks(id,title,parent_id,sort) VALUES(?,?,?,?)', [deckId, '默认牌组', null, Date.now()])
    }
    const id = uuid()
    qRun(getDb(), 'INSERT INTO cards(id,deck_id,front,back,kind) VALUES(?,?,?,?,?)', [id, deckId, front, back, 'qa'])
    attachFsrsState(id)
    if (sourceType && sourceId) {
      qRun(getDb(), 'INSERT INTO links(id,source_type,source_id,target_type,target_id,link_type,created_at) VALUES(?,?,?,?,?,?,unixepoch())',
        [uuid(), sourceType, sourceId, 'card', id, 'derived_from'])
    }
    schedulePersist()
    return id
  })

  ipc.handle('srs:export', async () => {
    const result = await dialog.showSaveDialog({
      title: '导出复习数据',
      defaultPath: 'learning-kit-srs.json',
      filters: [{ name: 'Learning Kit 复习数据', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    const fs = await import('fs/promises')
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      decks: qAll(getDb(), 'SELECT * FROM decks ORDER BY sort, created_at'),
      cards: qAll(getDb(), 'SELECT * FROM cards ORDER BY created_at')
    }
    await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
    return true
  })

  ipc.handle('srs:import', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入复习数据', properties: ['openFile'],
      filters: [{ name: 'Learning Kit 复习数据', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePaths[0]) return { decks: 0, cards: 0 }
    const fs = await import('fs/promises')
    const raw = await fs.readFile(result.filePaths[0], 'utf8')
    const parsed = JSON.parse(raw) as { decks?: unknown; cards?: unknown }
    if (!Array.isArray(parsed.decks) || !Array.isArray(parsed.cards)) throw new Error('这不是有效的 Learning Kit 复习数据文件')
    let deckCount = 0, cardCount = 0
    for (const row of parsed.decks) {
      const d = row as Record<string, unknown>
      if (typeof d.id !== 'string' || typeof d.title !== 'string') continue
      qRun(getDb(), `INSERT INTO decks(id,title,parent_id,sort,created_at) VALUES(?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title,parent_id=excluded.parent_id,sort=excluded.sort`,
      [d.id, d.title, d.parent_id ?? null, d.sort ?? 0, d.created_at ?? new Date().toISOString()])
      deckCount++
    }
    for (const row of parsed.cards) {
      const c = row as Record<string, unknown>
      if (typeof c.id !== 'string' || typeof c.deck_id !== 'string' || typeof c.front !== 'string') continue
      qRun(getDb(), `INSERT INTO cards(id,deck_id,front,back,kind,tags,ease,interval,reps,due,lapses,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET deck_id=excluded.deck_id,front=excluded.front,back=excluded.back,kind=excluded.kind,tags=excluded.tags,ease=excluded.ease,interval=excluded.interval,reps=excluded.reps,due=excluded.due,lapses=excluded.lapses,updated_at=excluded.updated_at`,
      [c.id, c.deck_id, c.front, c.back ?? '', c.kind ?? 'qa', c.tags ?? null, c.ease ?? 2.5, c.interval ?? 0, c.reps ?? 0, c.due ?? new Date().toISOString().slice(0, 19).replace('T', ' '), c.lapses ?? 0, c.created_at ?? new Date().toISOString(), c.updated_at ?? new Date().toISOString()])
      cardCount++
    }
    schedulePersist()
    return { decks: deckCount, cards: cardCount }
  })
}
