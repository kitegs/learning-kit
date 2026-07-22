import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import sqlite3Init from '@sqlite.org/sqlite-wasm'

let sqlite3: any = null
let db: any = null
let dbPath = ''

const SCHEMA = `
-- ===== existing tables (with soft-delete added) =====
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT,
  title      TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  expanded   INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  group_id        TEXT,
  title           TEXT NOT NULL,
  sort            INTEGER NOT NULL DEFAULT 0,
  origin_context  TEXT,
  folder_id       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_conv_folder ON conversations(folder_id);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  note            TEXT,
  model           TEXT,
  sort            INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at     INTEGER
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at INTEGER
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
  last_page   INTEGER NOT NULL DEFAULT 1,
  deleted_at  INTEGER
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id         TEXT PRIMARY KEY,
  book_id    TEXT NOT NULL,
  page       INTEGER NOT NULL DEFAULT 0,
  label      TEXT,
  href       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS highlights (
  id         TEXT PRIMARY KEY,
  book_id    TEXT NOT NULL,
  page       INTEGER NOT NULL,
  text       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'yellow',
  note       TEXT,
  link_conv_id TEXT,
  link_msg_id  TEXT,
  rect_x REAL, rect_y REAL, rect_w REAL, rect_h REAL,
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at INTEGER
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

-- ===== PRD v3: new tables =====

-- chapters (multi-level nesting via parent_id)
CREATE TABLE IF NOT EXISTS chapters (
  id         TEXT PRIMARY KEY,
  book_id    TEXT NOT NULL,
  parent_id  TEXT,
  title      TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  section_anchor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_chap_book ON chapters(book_id, parent_id);

-- knowledge points (smallest learning unit)
CREATE TABLE IF NOT EXISTS knowledge_points (
  id           TEXT PRIMARY KEY,
  chapter_id   TEXT,
  parent_id    TEXT,
  title        TEXT NOT NULL,
  description  TEXT,
  mastery      TEXT NOT NULL DEFAULT 'unsent',
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_kp_chapter ON knowledge_points(chapter_id);

-- sections (content anchors within a chapter)
CREATE TABLE IF NOT EXISTS sections (
  id           TEXT PRIMARY KEY,
  chapter_id   TEXT NOT NULL,
  book_id      TEXT NOT NULL,
  anchor_type  TEXT NOT NULL DEFAULT 'paragraph',
  content_hash TEXT,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sec_chapter ON sections(chapter_id);

-- progress records
CREATE TABLE IF NOT EXISTS progress_records (
  id           TEXT PRIMARY KEY,
  ref_type     TEXT NOT NULL,
  ref_id       TEXT NOT NULL,
  action       TEXT NOT NULL,
  meta         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prog_ref ON progress_records(ref_type, ref_id);

-- study plans
CREATE TABLE IF NOT EXISTS study_plans (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  plan_json  TEXT NOT NULL,
  template   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- diagrams (draw.io XML or markmap)
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

-- code snippets
CREATE TABLE IF NOT EXISTS code_snippets (
  id         TEXT PRIMARY KEY,
  title      TEXT,
  language   TEXT NOT NULL DEFAULT 'python',
  code       TEXT NOT NULL,
  kp_id      TEXT,
  note_id    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== universal links table (core PRD v3 design) =====
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

-- ===== FTS5 full-text search =====
CREATE VIRTUAL TABLE IF NOT EXISTS fts_conversations USING fts5(
  title, content='conversations', content_rowid='rowid'
);
CREATE VIRTUAL TABLE IF NOT EXISTS fts_messages USING fts5(
  content, content='messages', content_rowid='rowid'
);
CREATE VIRTUAL TABLE IF NOT EXISTS fts_notes USING fts5(
  title, body, content='notes', content_rowid='rowid'
);
CREATE VIRTUAL TABLE IF NOT EXISTS fts_highlights USING fts5(
  text, content='highlights', content_rowid='rowid'
);

-- FTS triggers: auto-sync on insert
CREATE TRIGGER IF NOT EXISTS fts_conv_ai AFTER INSERT ON conversations BEGIN
  INSERT INTO fts_conversations(rowid, title) VALUES (new.rowid, new.title);
END;
CREATE TRIGGER IF NOT EXISTS fts_msg_ai AFTER INSERT ON messages BEGIN
  INSERT INTO fts_messages(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS fts_notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO fts_notes(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS fts_high_ai AFTER INSERT ON highlights BEGIN
  INSERT INTO fts_highlights(rowid, text) VALUES (new.rowid, new.text);
END;

-- FTS triggers: auto-sync on update
CREATE TRIGGER IF NOT EXISTS fts_conv_au AFTER UPDATE ON conversations BEGIN
  INSERT INTO fts_conversations(fts_conversations, rowid, title) VALUES('delete', old.rowid, old.title);
  INSERT INTO fts_conversations(rowid, title) VALUES (new.rowid, new.title);
END;
CREATE TRIGGER IF NOT EXISTS fts_msg_au AFTER UPDATE ON messages BEGIN
  INSERT INTO fts_messages(fts_messages, rowid, content) VALUES('delete', old.rowid, old.content);
  INSERT INTO fts_messages(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS fts_notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO fts_notes(fts_notes, rowid, title, body) VALUES('delete', old.rowid, old.title, old.body);
  INSERT INTO fts_notes(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

-- FTS triggers: auto-sync on delete
CREATE TRIGGER IF NOT EXISTS fts_conv_ad AFTER DELETE ON conversations BEGIN
  INSERT INTO fts_conversations(fts_conversations, rowid, title) VALUES('delete', old.rowid, old.title);
END;
CREATE TRIGGER IF NOT EXISTS fts_msg_ad AFTER DELETE ON messages BEGIN
  INSERT INTO fts_messages(fts_messages, rowid, content) VALUES('delete', old.rowid, old.content);
END;
CREATE TRIGGER IF NOT EXISTS fts_notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO fts_notes(fts_notes, rowid, title, body) VALUES('delete', old.rowid, old.title, old.body);
END;
`

function migrate(_d: any): void {
  // Add new columns to existing tables if they don't exist
  const tableCols = (table: string): string[] => {
    const r = _d.exec(`PRAGMA table_info(${table})`)
    if (!r.length) return []
    return r[0].values.map((row: any[]) => String(row[1]))
  }

  // conversations: add origin_context, folder_id, deleted_at
  const convCols = tableCols('conversations')
  if (!convCols.includes('origin_context')) { try { _d.exec('ALTER TABLE conversations ADD COLUMN origin_context TEXT') } catch {} }
  if (!convCols.includes('folder_id')) { try { _d.exec('ALTER TABLE conversations ADD COLUMN folder_id TEXT') } catch {} }
  if (!convCols.includes('deleted_at')) { try { _d.exec('ALTER TABLE conversations ADD COLUMN deleted_at INTEGER') } catch {} }

  // groups: add deleted_at
  const gCols = tableCols('groups')
  if (!gCols.includes('deleted_at')) { try { _d.exec('ALTER TABLE groups ADD COLUMN deleted_at INTEGER') } catch {} }

  // messages: add deleted_at
  const mCols = tableCols('messages')
  if (!mCols.includes('deleted_at')) { try { _d.exec('ALTER TABLE messages ADD COLUMN deleted_at INTEGER') } catch {} }

  // notes: add deleted_at
  const nCols = tableCols('notes')
  if (!nCols.includes('deleted_at')) { try { _d.exec('ALTER TABLE notes ADD COLUMN deleted_at INTEGER') } catch {} }

  // books: add deleted_at
  const bCols = tableCols('books')
  if (!bCols.includes('deleted_at')) { try { _d.exec('ALTER TABLE books ADD COLUMN deleted_at INTEGER') } catch {} }

  // mindmaps: add deleted_at
  const mmCols = tableCols('mindmaps')
  if (!mmCols.includes('deleted_at')) { try { _d.exec('ALTER TABLE mindmaps ADD COLUMN deleted_at INTEGER') } catch {} }

  // highlights: add rect columns
  const hCols = tableCols('highlights')
  for (const [col, type] of [['rect_x', 'REAL'], ['rect_y', 'REAL'], ['rect_w', 'REAL'], ['rect_h', 'REAL']] as const) {
    if (!hCols.includes(col)) { try { _d.exec(`ALTER TABLE highlights ADD COLUMN ${col} ${type}`) } catch {} }
  }
}

export async function initDb(): Promise<any> {
  const userData = app.getPath('userData')
  const dataDir = join(userData, 'data')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  dbPath = join(dataDir, 'learning-kit-v3.db')

  sqlite3 = await sqlite3Init()
  db = new sqlite3.oo1.DB(':memory:')

  if (existsSync(dbPath)) {
    try {
      const buf = readFileSync(dbPath)
      const capi = sqlite3.capi
      capi.sqlite3_deserialize(db.pointer, 'main', new Uint8Array(buf), buf.byteLength, buf.byteLength, 0)
    } catch {
      // corrupt v3 file → start fresh
      console.log('v3 db corrupt, starting fresh')
    }
  }

  db.exec(SCHEMA)
  migrate(db)
  persist()
  return db
}

export function getDb(): any { return db }
export function getSqlite3(): any { return sqlite3 }

let persistTimer: NodeJS.Timeout | null = null
export function persist(): void {
  if (!db) return
  try {
    const capi = sqlite3.capi
    // Serialize the in-memory database to bytes
    const nBytes = capi.sqlite3_serialize(db.pointer, 'main', null, 0)
    if (nBytes) {
      writeFileSync(dbPath, Buffer.from(nBytes))
    }
  } catch {}
}
export function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => { persist(); persistTimer = null }, 250)
}

export const uuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })

// Shared helpers for @sqlite.org/sqlite-wasm (oo1.DB)
export function qAll(d: any, sql: string, bindArr?: any[]): any[] {
  const rows: any[] = []
  const args: any = { sql, rowMode: 'object', resultRows: rows }
  if (bindArr) args.bind = bindArr
  d.exec(args)
  return rows
}

export function qOne(d: any, sql: string, bindArr?: any[]): any | undefined {
  return qAll(d, sql, bindArr)[0]
}

export function qRun(d: any, sql: string, bindArr?: any[]): void {
  const args: any = { sql }
  if (bindArr) args.bind = bindArr
  d.exec(args)
}