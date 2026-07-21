import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import initSqlJs, { type Database } from 'sql.js'

let db: Database | null = null
let dbPath = ''

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
  id          TEXT PRIMARY KEY,
  group_id    TEXT,
  title       TEXT NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  note            TEXT,
  model           TEXT,
  sort            INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, sort);

CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  parent_id  TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  tags       TEXT,
  kind       TEXT NOT NULL DEFAULT 'note',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Library / ebooks
CREATE TABLE IF NOT EXISTS books (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  author      TEXT,
  kind        TEXT NOT NULL DEFAULT 'pdf',     -- pdf | epub
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
  rect_x    REAL,
  rect_y    REAL,
  rect_w    REAL,
  rect_h    REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_high_book ON highlights(book_id, page);

-- Mind maps / outline-based notes
CREATE TABLE IF NOT EXISTS mindmaps (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  drawing    TEXT,
  annotations TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SRS: Spaced Repetition (SM-2-ish)
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
  kind       TEXT NOT NULL DEFAULT 'qa',    -- qa | cloze
  tags       TEXT,
  source_note_id TEXT,
  source_book_id  TEXT,
  -- SM-2 fields
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
  rating     INTEGER NOT NULL,  -- 1=again 3=hard 4=good 5=easy
  ease       REAL NOT NULL,
  interval   INTEGER NOT NULL,
  due        TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS streak (
  date TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS page_annotations (
  id         TEXT PRIMARY KEY,
  book_id    TEXT NOT NULL,
  page       INTEGER NOT NULL,
  type       TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_page_ann ON page_annotations(book_id, page);
`

export async function initDb(): Promise<Database> {
  const userData = app.getPath('userData')
  const dataDir = join(userData, 'data')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  dbPath = join(dataDir, 'learning-kit.db')

  const wasmPath = join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  const SQL = await initSqlJs({
    locateFile: () => (existsSync(wasmPath) ? wasmPath : 'sql-wasm.wasm')
  })

  if (existsSync(dbPath)) {
    const buf = readFileSync(dbPath)
    db = new SQL.Database(buf)
  } else {
    db = new SQL.Database()
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
  const data = db.export()
  writeFileSync(dbPath, Buffer.from(data))
}

/** Add new columns to existing tables when upgrading schema without dropping data. */
function migrate(d: Database): void {
  const tableCols = (table: string): string[] => {
    const r = d.exec(`PRAGMA table_info(${table})`)
    if (!r.length) return []
    return r[0].values.map((row) => String(row[1]))
  }
  const hCols = tableCols('highlights')
  for (const [col, type] of [
    ['rect_x', 'REAL'], ['rect_y', 'REAL'], ['rect_w', 'REAL'], ['rect_h', 'REAL']
  ] as const) {
    if (!hCols.includes(col)) {
      try { d.exec(`ALTER TABLE highlights ADD COLUMN ${col} ${type}`) } catch { /* already */ }
    }
  }

  const bmCols = tableCols('bookmarks')
if (!bmCols.includes('href')) {
    try { d.exec('ALTER TABLE bookmarks ADD COLUMN href TEXT') } catch {}
  }

  const mmCols = tableCols('mindmaps')
  if (!mmCols.includes('drawing')) {
    try { d.exec('ALTER TABLE mindmaps ADD COLUMN drawing TEXT') } catch {}
  }
  if (!mmCols.includes('annotations')) {
    try { d.exec('ALTER TABLE mindmaps ADD COLUMN annotations TEXT') } catch {}
  }
}

/** throttle persistence a bit during streaming writes */
export function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persist()
    persistTimer = null
  }, 250)
}