import { app } from 'electron'
import { join } from 'path'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import initSqlJs, { type Database } from 'sql.js'

let db: Database | null = null
let dbPath = ''
let sql: Awaited<ReturnType<typeof initSqlJs>> | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id        TEXT PRIMARY KEY,
  parent_id TEXT,
  title     TEXT NOT NULL,
  sort      INTEGER NOT NULL DEFAULT 0,
  expanded  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  group_id        TEXT,
  title           TEXT NOT NULL,
  sort            INTEGER NOT NULL DEFAULT 0,
  origin_context  TEXT,
  folder_id       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  note            TEXT,
  model           TEXT,
  sort            INTEGER NOT NULL DEFAULT 0,
  turn_id         TEXT,
  parent_turn_id  TEXT,
  collapsed       INTEGER NOT NULL DEFAULT 0,
  fold_id         TEXT,
  origin_conversation_id TEXT,
  origin_fold_id  TEXT,
  origin_sort     INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, sort);

CREATE TABLE IF NOT EXISTS conversation_folds (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  title           TEXT NOT NULL,
  tags            TEXT NOT NULL DEFAULT '',
  sort            INTEGER NOT NULL DEFAULT 0,
  collapsed       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_folds_conversation ON conversation_folds(conversation_id, sort);

CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  parent_id  TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  tags       TEXT,
  kind       TEXT NOT NULL DEFAULT 'note',
  favorite   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  author      TEXT,
  kind        TEXT NOT NULL DEFAULT 'pdf',
  file_path   TEXT NOT NULL,
  cover       TEXT,
  total_pages INTEGER,
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_page   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id        TEXT PRIMARY KEY,
  book_id   TEXT NOT NULL,
  page      INTEGER NOT NULL DEFAULT 0,
  label     TEXT,
  href      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS highlights (
  id        TEXT PRIMARY KEY,
  book_id   TEXT NOT NULL,
  page      INTEGER NOT NULL,
  text      TEXT NOT NULL,
  color     TEXT NOT NULL DEFAULT 'yellow',
  note      TEXT,
  link_conv_id TEXT,
  link_msg_id TEXT,
  rect_x REAL, rect_y REAL, rect_w REAL, rect_h REAL,
  href      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_high_book ON highlights(book_id, page);

CREATE TABLE IF NOT EXISTS mindmaps (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  drawing    TEXT,
  annotations TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS decks (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  parent_id  TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cards (
  id         TEXT PRIMARY KEY,
  deck_id    TEXT NOT NULL,
  front      TEXT NOT NULL,
  back       TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'qa',
  tags       TEXT,
  ease       REAL NOT NULL DEFAULT 2.5,
  interval   INTEGER NOT NULL DEFAULT 0,
  reps       INTEGER NOT NULL DEFAULT 0,
  due        TEXT NOT NULL DEFAULT (datetime('now')),
  lapses     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due);

CREATE TABLE IF NOT EXISTS review_log (
  id         TEXT PRIMARY KEY,
  card_id    TEXT NOT NULL,
  rating     INTEGER NOT NULL,
  ease       REAL NOT NULL,
  interval   INTEGER NOT NULL,
  due        TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS streak (
  date  TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS page_annotations (
  id         TEXT PRIMARY KEY,
  book_id    TEXT NOT NULL,
  page       INTEGER NOT NULL,
  type        TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_page_ann ON page_annotations(book_id, page);

-- PRD v3: new tables
CREATE TABLE IF NOT EXISTS chapters (
  id             TEXT PRIMARY KEY,
  book_id        TEXT NOT NULL,
  parent_id      TEXT,
  title          TEXT NOT NULL,
  sort           INTEGER NOT NULL DEFAULT 0,
  section_anchor TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chap_book ON chapters(book_id, parent_id);

CREATE TABLE IF NOT EXISTS knowledge_points (
  id           TEXT PRIMARY KEY,
  chapter_id   TEXT,
  parent_id    TEXT,
  title        TEXT NOT NULL,
  description  TEXT,
  mastery      TEXT NOT NULL DEFAULT 'unseen',
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sections (
  id           TEXT PRIMARY KEY,
  chapter_id   TEXT NOT NULL,
  book_id      TEXT NOT NULL,
  anchor_type  TEXT NOT NULL DEFAULT 'paragraph',
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS progress_records (
  id           TEXT PRIMARY KEY,
  ref_type     TEXT NOT NULL,
  ref_id       TEXT NOT NULL,
  action       TEXT NOT NULL,
  meta         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS study_plans (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  plan_json  TEXT NOT NULL DEFAULT '{}',
  template   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS diagrams (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  xml        TEXT,
  format     TEXT NOT NULL DEFAULT 'drawio',
  book_id    TEXT,
  chapter_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS code_snippets (
  id         TEXT PRIMARY KEY,
  title      TEXT,
  language   TEXT NOT NULL DEFAULT 'python',
  code       TEXT NOT NULL,
  kp_id      TEXT,
  note_id    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS links (
  id            TEXT PRIMARY KEY,
  source_type   TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  target_type   TEXT NOT NULL,
  target_id     TEXT NOT NULL,
  link_type     TEXT NOT NULL,
  created_at    INTEGER,
  sort_order    INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_type, target_id);

-- Learning Kit block graph, snapshots and attribute-view records.
CREATE TABLE IF NOT EXISTS content_blocks (
  id          TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  block_type  TEXT NOT NULL DEFAULT 'text',
  text        TEXT NOT NULL DEFAULT '',
  anchor      TEXT,
  metadata    TEXT,
  anchor_key  TEXT,
  source_hash TEXT,
  stale       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_blocks_source ON content_blocks(source_type, source_id);

CREATE TABLE IF NOT EXISTS ai_tool_runs (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT,
  action_type     TEXT NOT NULL,
  params_json     TEXT NOT NULL DEFAULT '[]',
  preview         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  result_json     TEXT,
  rollback_json   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_tool_runs_conversation ON ai_tool_runs(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS note_versions (
  id          TEXT PRIMARY KEY,
  note_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_note_versions_note ON note_versions(note_id, created_at DESC);

-- Optional FSRS state. The cards table remains the compatible common index.
CREATE TABLE IF NOT EXISTS card_scheduling (
  card_id     TEXT PRIMARY KEY,
  algorithm   TEXT NOT NULL DEFAULT 'fsrs',
  state_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_card_scheduling_algorithm ON card_scheduling(algorithm);

CREATE TABLE IF NOT EXISTS entity_attributes (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  attr_key    TEXT NOT NULL,
  attr_value  TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(entity_type, entity_id, attr_key)
);
CREATE INDEX IF NOT EXISTS idx_attributes_entity ON entity_attributes(entity_type, entity_id);
`

function migrate(d: Database): void {
  const tableCols = (table: string): string[] => {
    const r = d.exec(`PRAGMA table_info(${table})`)
    if (!r.length) return []
    return r[0].values.map((row: any[]) => String(row[1]))
  }

  // Soft delete: add deleted_at to tables that need it
  for (const table of ['conversations', 'messages', 'notes', 'books', 'mindmaps', 'groups']) {
    const cols = tableCols(table)
    if (!cols.includes('deleted_at')) { try { d.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at INTEGER`) } catch {} }
  }

  // Conversations: add origin_context and folder_id
  const convCols = tableCols('conversations')
  if (!convCols.includes('origin_context')) { try { d.exec('ALTER TABLE conversations ADD COLUMN origin_context TEXT') } catch {} }
  if (!convCols.includes('folder_id')) { try { d.exec('ALTER TABLE conversations ADD COLUMN folder_id TEXT') } catch {} }

  // Messages: conversation-flow turns and persisted fold state
  const messageCols = tableCols('messages')
  if (!messageCols.includes('turn_id')) { try { d.exec('ALTER TABLE messages ADD COLUMN turn_id TEXT') } catch {} }
  if (!messageCols.includes('parent_turn_id')) { try { d.exec('ALTER TABLE messages ADD COLUMN parent_turn_id TEXT') } catch {} }
  if (!messageCols.includes('collapsed')) { try { d.exec('ALTER TABLE messages ADD COLUMN collapsed INTEGER NOT NULL DEFAULT 0') } catch {} }
  if (!messageCols.includes('fold_id')) { try { d.exec('ALTER TABLE messages ADD COLUMN fold_id TEXT') } catch {} }
  if (!messageCols.includes('origin_conversation_id')) { try { d.exec('ALTER TABLE messages ADD COLUMN origin_conversation_id TEXT') } catch {} }
  if (!messageCols.includes('origin_fold_id')) { try { d.exec('ALTER TABLE messages ADD COLUMN origin_fold_id TEXT') } catch {} }
  if (!messageCols.includes('origin_sort')) { try { d.exec('ALTER TABLE messages ADD COLUMN origin_sort INTEGER') } catch {} }
  const foldCols = qAll(d, 'PRAGMA table_info(conversation_folds)').map((r: { name: string }) => r.name)
  if (!foldCols.includes('tags')) { try { d.exec("ALTER TABLE conversation_folds ADD COLUMN tags TEXT NOT NULL DEFAULT ''") } catch {} }
  d.exec("UPDATE messages SET turn_id=id WHERE turn_id IS NULL OR turn_id='' ")

  // Highlights: add rect columns
  const hCols = tableCols('highlights')
  for (const [col, type] of [['rect_x', 'REAL'], ['rect_y', 'REAL'], ['rect_w', 'REAL'], ['rect_h', 'REAL']] as const) {
    if (!hCols.includes(col)) { try { d.exec(`ALTER TABLE highlights ADD COLUMN ${col} ${type}`) } catch {} }
  }
  if (!hCols.includes('href')) { try { d.exec('ALTER TABLE highlights ADD COLUMN href TEXT') } catch {} }

  // Mindmaps: add drawing and annotations
  const mmCols = tableCols('mindmaps')
  if (!mmCols.includes('drawing')) { try { d.exec('ALTER TABLE mindmaps ADD COLUMN drawing TEXT') } catch {} }
  if (!mmCols.includes('annotations')) { try { d.exec('ALTER TABLE mindmaps ADD COLUMN annotations TEXT') } catch {} }

  // Notes: add favorite state for knowledge management
  const noteCols = tableCols('notes')
  if (!noteCols.includes('favorite')) { try { d.exec('ALTER TABLE notes ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0') } catch {} }

  // Bookmarks: add href
  const bmCols = tableCols('bookmarks')
  if (!bmCols.includes('href')) { try { d.exec('ALTER TABLE bookmarks ADD COLUMN href TEXT') } catch {} }

  // Content blocks: new fields are optional for old manual blocks.
  const blockCols = tableCols('content_blocks')
  for (const [col, type] of [['anchor_key', 'TEXT'], ['source_hash', 'TEXT'], ['stale', 'INTEGER NOT NULL DEFAULT 0']] as const) {
    if (!blockCols.includes(col)) { try { d.exec(`ALTER TABLE content_blocks ADD COLUMN ${col} ${type}`) } catch {} }
  }
  d.exec('CREATE INDEX IF NOT EXISTS idx_blocks_anchor ON content_blocks(source_type, source_id, anchor_key)')
}

export async function initDb(): Promise<Database> {
  const userData = app.getPath('userData')
  const dataDir = join(userData, 'data')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  dbPath = join(dataDir, 'learning-kit-v3.db')

  sql = await initSqlJs()
  if (existsSync(dbPath)) {
    const buf = readFileSync(dbPath)
    try {
      db = new sql.Database(buf)
    } catch {
      db = new sql.Database()
    }
  } else {
    db = new sql.Database()
  }
  db.exec(SCHEMA)
  migrate(db)
  persist()
  return db
}

export function getDb(): Database {
  if (!db) throw new Error('DB not initialized')
  return db
}

let persistTimer: NodeJS.Timeout | null = null
export function persist(): void {
  if (!db) return
  try {
    const data = db.export()
    writeFileSync(dbPath, Buffer.from(data))
  } catch (e: any) {
    console.error('[db] persist failed:', e?.message || e)
  }
}
export function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    try { persist() } catch (e: any) { console.error('[db] schedulePersist error:', e?.message || e) }
    persistTimer = null
  }, 250)
}

export function backupDatabase(targetPath: string): { path: string; bytes: number } {
  persist()
  copyFileSync(dbPath, targetPath)
  return { path: targetPath, bytes: readFileSync(targetPath).byteLength }
}

export function restoreDatabase(sourcePath: string): void {
  if (!sql) throw new Error('数据库引擎尚未初始化')
  const data = readFileSync(sourcePath)
  const candidate = new sql.Database(data)
  try {
    candidate.exec(SCHEMA)
    migrate(candidate)
    const check = candidate.exec('PRAGMA integrity_check')
    const result = check[0]?.values?.[0]?.[0]
    if (result !== 'ok') throw new Error('备份文件完整性校验失败')
    const beforeRestore = `${dbPath}.pre-restore.bak`
    if (existsSync(dbPath)) copyFileSync(dbPath, beforeRestore)
    const restored = candidate.export()
    writeFileSync(dbPath, Buffer.from(restored))
    const previous = db
    db = candidate
    previous?.close()
  } catch (error) {
    if (db !== candidate) candidate.close()
    throw error
  }
}

export const uuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })

// Shared helpers for sql.js
export function qAll(d: Database, sql: string, params: unknown[] = []): any[] {
  const stmt = d.prepare(sql)
  stmt.bind(params)
  const rows: any[] = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

export function qOne(d: Database, sql: string, params: unknown[] = []): any | undefined {
  return qAll(d, sql, params)[0]
}

export function qRun(d: Database, sql: string, params: unknown[] = []): void {
  const stmt = d.prepare(sql)
  stmt.bind(params)
  stmt.step()
  stmt.free()
}
