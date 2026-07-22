import { ipcMain } from 'electron'
import { getDb, schedulePersist, uuid, qAll, qRun } from './db'

export function registerPrdV3Ipcs(ipc: typeof ipcMain): void {
  // ── chapters ──
  ipc.handle('chapter:list', (_e, bookId: string) =>
    qAll(getDb(), 'SELECT * FROM chapters WHERE book_id=? AND deleted_at IS NULL ORDER BY sort', [bookId])
  )
  ipc.handle('chapter:upsert', (_e, c: any) => {
    const id = c.id ?? uuid()
    qRun(getDb(), `INSERT INTO chapters(id,book_id,parent_id,title,sort,section_anchor) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id,title=excluded.title,sort=excluded.sort,section_anchor=excluded.section_anchor`,
      [id, c.bookId, c.parent_id ?? null, c.title ?? 'Chapter', c.sort ?? 0, c.section_anchor ?? null])
    schedulePersist(); return id
  })
  ipc.handle('chapter:delete', (_e, id: string) => {
    qRun(getDb(), 'UPDATE chapters SET deleted_at=unixepoch() WHERE id=?', [id])
    schedulePersist(); return true
  })

  // ── knowledge_points ──
  ipc.handle('kp:list', (_e, chapterId: string|null) => {
    if (chapterId) return qAll(getDb(), 'SELECT * FROM knowledge_points WHERE chapter_id=? AND deleted_at IS NULL ORDER BY sort', [chapterId])
    return qAll(getDb(), 'SELECT * FROM knowledge_points WHERE deleted_at IS NULL ORDER BY updated_at DESC')
  })
  ipc.handle('kp:upsert', (_e, kp: any) => {
    const id = kp.id ?? uuid()
    qRun(getDb(), `INSERT INTO knowledge_points(id,chapter_id,parent_id,title,description,mastery,sort) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET chapter_id=excluded.chapter_id,parent_id=excluded.parent_id,title=excluded.title,description=excluded.description,mastery=excluded.mastery,sort=excluded.sort,updated_at=datetime('now')`,
      [id, kp.chapterId ?? null, kp.parentId ?? null, kp.title ?? '', kp.description ?? '', kp.mastery ?? 'unseen', kp.sort ?? 0])
    schedulePersist(); return id
  })
  ipc.handle('kp:delete', (_e, id: string) => {
    qRun(getDb(), 'UPDATE knowledge_points SET deleted_at=unixepoch() WHERE id=?', [id])
    schedulePersist(); return true
  })
  ipc.handle('kp:setMastery', (_e, id: string, mastery: string) => {
    qRun(getDb(), 'UPDATE knowledge_points SET mastery=?,updated_at=datetime("now") WHERE id=?', [mastery, id])
    schedulePersist(); return true
  })

  // ── links ──
  ipc.handle('links:create', (_e, l: any) => {
    const id = l.id ?? uuid()
    qRun(getDb(), `INSERT OR REPLACE INTO links(id,source_type,source_id,target_type,target_id,link_type,created_at,sort_order) VALUES(?,?,?,?,?,?,unixepoch(),?)`,
      [id, l.sourceType, l.sourceId, l.targetType, l.targetId, l.linkType, l.sortOrder ?? 0])
    schedulePersist(); return id
  })
  ipc.handle('links:list', (_e, sourceType: string, sourceId: string) =>
    qAll(getDb(), 'SELECT * FROM links WHERE source_type=? AND source_id=? ORDER BY sort_order', [sourceType, sourceId])
  )
  ipc.handle('links:listTargets', (_e, targetType: string, targetId: string) =>
    qAll(getDb(), 'SELECT * FROM links WHERE target_type=? AND target_id=? ORDER BY sort_order', [targetType, targetId])
  )
  ipc.handle('links:relate', (_e, sourceType: string, sourceId: string, targetType: string, targetId: string, linkType: string) => {
    const id = uuid()
    qRun(getDb(), 'INSERT INTO links(id,source_type,source_id,target_type,target_id,link_type,created_at) VALUES(?,?,?,?,?,?,unixepoch())',
      [id, sourceType, sourceId, targetType, targetId, linkType])
    schedulePersist(); return id
  })
  ipc.handle('links:remove', (_e, id: string) => {
    qRun(getDb(), 'DELETE FROM links WHERE id=?', [id])
    schedulePersist(); return true
  })
  // get all links for an entity (both as source and target)
  ipc.handle('links:allForEntity', (_e, type: string, id: string) => {
    const src = qAll(getDb(), 'SELECT * FROM links WHERE source_type=? AND source_id=?', [type, id])
    const tgt = qAll(getDb(), 'SELECT * FROM links WHERE target_type=? AND target_id=?', [type, id])
    return [...src, ...tgt]
  })

  // ── sections ──
  ipc.handle('sec:list', (_e, chapterId: string) =>
    qAll(getDb(), 'SELECT * FROM sections WHERE chapter_id=? ORDER BY sort', [chapterId])
  )
  ipc.handle('sec:upsert', (_e, s: any) => {
    const id = s.id ?? uuid()
    qRun(getDb(), `INSERT INTO sections(id,chapter_id,book_id,anchor_type,content_hash,sort) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET anchor_type=excluded.anchor_type,sort=excluded.sort`,
      [id, s.chapterId, s.bookId, s.anchorType ?? 'paragraph', s.content_hash ?? null, s.sort ?? 0])
    schedulePersist(); return id
  })

  // ── progress_records ──
  ipc.handle('prog:add', (_e, r: any) => {
    const id = r.id ?? uuid()
    qRun(getDb(), 'INSERT OR REPLACE INTO progress_records(id,ref_type,ref_id,action,meta) VALUES(?,?,?,?,?)',
      [id, r.refType, r.refId, r.action, r.meta ?? null])
    schedulePersist(); return id
  })
  ipc.handle('prog:list', (_e, refType: string, refId: string) =>
    qAll(getDb(), 'SELECT * FROM progress_records WHERE ref_type=? AND ref_id=? ORDER BY created_at DESC', [refType, refId])
  )
  ipc.handle('prog:count', (_e, refType: string) =>
    qAll(getDb(), 'SELECT action, COUNT(*) cnt FROM progress_records WHERE ref_type=? GROUP BY action', [refType])
  )

  // ── study_plans ──
  ipc.handle('plan:list', () => qAll(getDb(), 'SELECT * FROM study_plans ORDER BY updated_at DESC'))
  ipc.handle('plan:upsert', (_e, p: any) => {
    const id = p.id ?? uuid()
    qRun(getDb(), `INSERT INTO study_plans(id,title,plan_json,template) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,plan_json=excluded.plan_json,template=excluded.template,updated_at=datetime('now')`,
      [id, p.title ?? 'Plan', p.plan_json ?? '{}', p.template ?? null])
    schedulePersist(); return id
  })
  ipc.handle('plan:delete', (_e, id: string) => {
    qRun(getDb(), 'DELETE FROM study_plans WHERE id=?', [id])
    schedulePersist(); return true
  })

  // ── diagrams ──
  ipc.handle('diag:list', () => qAll(getDb(), 'SELECT * FROM diagrams ORDER BY updated_at DESC'))
  ipc.handle('diag:upsert', (_e, d: any) => {
    const id = d.id ?? uuid()
    qRun(getDb(), `INSERT INTO diagrams(id,title,xml,format,book_id,chapter_id) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,xml=excluded.xml,updated_at=datetime('now')`,
      [id, d.title ?? 'Diagram', d.xml ?? '', d.format ?? 'drawio', d.bookId ?? null, d.chapterId ?? null])
    schedulePersist(); return id
  })
  ipc.handle('diag:delete', (_e, id: string) => {
    qRun(getDb(), 'DELETE FROM diagrams WHERE id=?', [id])
    schedulePersist(); return true
  })

  // ── code_snippets ──
  ipc.handle('code:list', (_e, kpId: string|null) => {
    if (kpId) return qAll(getDb(), 'SELECT * FROM code_snippets WHERE kp_id=? ORDER BY created_at', [kpId])
    return qAll(getDb(), 'SELECT * FROM code_snippets ORDER BY created_at DESC')
  })
  ipc.handle('code:upsert', (_e, c: any) => {
    const id = c.id ?? uuid()
    qRun(getDb(), `INSERT INTO code_snippets(id,title,language,code,kp_id,note_id) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,language=excluded.language,code=excluded.code,kp_id=excluded.kp_id,note_id=excluded.note_id`,
      [id, c.title ?? '', c.language ?? 'python', c.code ?? '', c.kp_id ?? null, c.note_id ?? null])
    schedulePersist(); return id
  })
  ipc.handle('code:delete', (_e, id: string) => {
    qRun(getDb(), 'DELETE FROM code_snippets WHERE id=?', [id])
    schedulePersist(); return true
  })
}