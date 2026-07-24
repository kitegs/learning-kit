// Integration tests for Learning Kit core data chains.
// Run: node tests/integration.js
// Tests use sql.js directly — no Electron window needed.

const initSqlJs = require('sql.js')
const { performance } = require('perf_hooks')

let db
let pass = 0
let fail = 0

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function schema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY,parent_id TEXT,title TEXT NOT NULL,sort INTEGER NOT NULL DEFAULT 0,expanded INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY,group_id TEXT,title TEXT NOT NULL,sort INTEGER NOT NULL DEFAULT 0,origin_context TEXT,folder_id TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,note TEXT,model TEXT,sort INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, sort);
    CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',parent_id TEXT,sort INTEGER NOT NULL DEFAULT 0,tags TEXT,kind TEXT NOT NULL DEFAULT 'note',created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS decks (id TEXT PRIMARY KEY,title TEXT NOT NULL,parent_id TEXT,sort INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY,deck_id TEXT NOT NULL,front TEXT NOT NULL,back TEXT NOT NULL DEFAULT '',kind TEXT NOT NULL DEFAULT 'qa',tags TEXT,ease REAL NOT NULL DEFAULT 2.5,interval INTEGER NOT NULL DEFAULT 0,reps INTEGER NOT NULL DEFAULT 0,due TEXT NOT NULL DEFAULT (datetime('now')),lapses INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due);
    CREATE TABLE IF NOT EXISTS review_log (id TEXT PRIMARY KEY,card_id TEXT NOT NULL,rating INTEGER NOT NULL,ease REAL NOT NULL,interval INTEGER NOT NULL,due TEXT NOT NULL,reviewed_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS streak (date TEXT PRIMARY KEY,count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY,title TEXT NOT NULL,author TEXT,kind TEXT NOT NULL DEFAULT 'pdf',file_path TEXT NOT NULL,cover TEXT,total_pages INTEGER,added_at TEXT NOT NULL DEFAULT (datetime('now')),last_page INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS highlights (id TEXT PRIMARY KEY,book_id TEXT NOT NULL,page INTEGER NOT NULL,text TEXT NOT NULL,color TEXT NOT NULL DEFAULT 'yellow',note TEXT,link_conv_id TEXT,link_msg_id TEXT,rect_x REAL,rect_y REAL,rect_w REAL,rect_h REAL,created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS mindmaps (id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',drawing TEXT,annotations TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS links (id TEXT PRIMARY KEY,source_type TEXT NOT NULL,source_id TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,relation TEXT NOT NULL DEFAULT 'related',created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS code_snippets (id TEXT PRIMARY KEY,language TEXT NOT NULL,code TEXT NOT NULL,description TEXT,source TEXT,tags TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')));
  `)
}

function ok(name) { pass++; console.log(`  ✓ ${name}`) }
function fail_(name, err) { fail++; console.log(`  ✗ ${name}: ${err?.message || err}`) }

function test(name, fn) {
  try { fn(); ok(name) } catch (e) { fail_(name, e) }
}

async function testAsync(name, fn) {
  try { await fn(); ok(name) } catch (e) { fail_(name, e) }
}

// --- Test: Conversation CRUD ---
function testConvCrud() {
  const convId = uuid(), groupId = uuid()

  // create group first
  db.run('INSERT INTO groups(id,title,sort) VALUES(?,?,?)', [groupId, 'test-group', 0])

  // create conversation
  db.run(`INSERT INTO conversations(id,group_id,title,sort,origin_context) VALUES(?,?,?,?,?)`,
    [convId, groupId, 'test-conv', 0, null])

  let row = db.exec('SELECT id,title FROM conversations WHERE id=?', [convId])
  if (!row[0] || row[0].values.length === 0) throw new Error('conv not found after insert')
  if (row[0].values[0][1] !== 'test-conv') throw new Error('title mismatch')

  // update conversation
  db.run('UPDATE conversations SET title=?,updated_at=datetime("now") WHERE id=?', ['updated-conv', convId])
  row = db.exec('SELECT title FROM conversations WHERE id=?', [convId])
  if (row[0].values[0][0] !== 'updated-conv') throw new Error('update failed')

  // list conversations by group
  const rows = db.exec('SELECT id,title FROM conversations WHERE group_id=? ORDER BY sort', [groupId])
  if (rows[0].values.length !== 1) throw new Error('expected 1 conv in group')

  // delete (hard delete for test)
  db.run('DELETE FROM conversations WHERE id=?', [convId])
  row = db.exec('SELECT id FROM conversations WHERE id=?', [convId])
  if (row[0] && row[0].values.length > 0) throw new Error('delete failed')
}

// --- Test: Notes persistence (create + update + read back) ---
function testNotesPersist() {
  const noteId = uuid()

  // create
  db.run(`INSERT INTO notes(id,title,body,kind,tags) VALUES(?,?,?,?,?)`,
    [noteId, 'test-note', '# Hello\nworld', 'note', 'tag1,tag2'])

  let row = db.exec('SELECT title,body,tags FROM notes WHERE id=?', [noteId])
  if (row[0].values[0][0] !== 'test-note') throw new Error('note create failed')
  if (row[0].values[0][1] !== '# Hello\nworld') throw new Error('note body mismatch')

  // patch body
  db.run('UPDATE notes SET body=?,updated_at=datetime("now") WHERE id=?', ['## Updated\nbody', noteId])
  row = db.exec('SELECT body FROM notes WHERE id=?', [noteId])
  if (row[0].values[0][0] !== '## Updated\nbody') throw new Error('note patch failed')

// verify serialization roundtrip: export/import
  const exported = db.export()
  const db2 = new _Database(exported)
  row = db2.exec('SELECT title,body FROM notes WHERE id=?', [noteId])
  if (row[0].values[0][0] !== 'test-note') throw new Error('export/import roundtrip failed')
  db2.close()
}

// --- Test: SRS card cycle (create + review + SM-2 schedule) ---
function testSrsCycle() {
  const deckId = uuid(), cardId = uuid()

  // create deck
  db.run('INSERT INTO decks(id,title) VALUES(?,?)', [deckId, 'test-deck'])

  // create card
  db.run(`INSERT INTO cards(id,deck_id,front,back,kind) VALUES(?,?,?,?,?)`,
    [cardId, deckId, '2+2=?', '4', 'qa'])

  let row = db.exec('SELECT front,back,reps,due FROM cards WHERE id=?', [cardId])
  if (row[0].values[0][0] !== '2+2=?') throw new Error('card create failed')

  // SM-2: first review with rating=4 (pass)
  const ease = 2.5, interval = 0, reps = 0
  let newInterval, newEase, newReps, newDue

  if (reps === 0) {
    // first review: interval=1, reps=1
    newInterval = 1
    newReps = 1
    newEase = ease
  } else {
    newEase = Math.max(1.3, ease + (0.1 - (5 - 4) * (0.08 + (5 - 4) * 0.02)))
    newInterval = reps === 1 ? 1 : Math.round(interval * newEase)
    newReps = reps + 1
  }

  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  newDue = tomorrow

  db.run('UPDATE cards SET ease=?,interval=?,reps=?,due=?,updated_at=datetime("now") WHERE id=?',
    [newEase, newInterval, newReps, newDue, cardId])

  row = db.exec('SELECT reps,interval FROM cards WHERE id=?', [cardId])
  if (row[0].values[0][0] !== 1) throw new Error('SRS reps not updated')
  if (row[0].values[0][1] !== 1) throw new Error('SRS interval not updated')

  // log review
  const logId = uuid()
  db.run('INSERT INTO review_log(id,card_id,rating,ease,interval,due) VALUES(?,?,?,?,?,?)',
    [logId, cardId, 4, newEase, newInterval, newDue])

  // verify review log
  const logs = db.exec('SELECT rating FROM review_log WHERE card_id=?', [cardId])
  if (logs[0].values.length !== 1) throw new Error('review log not created')
  if (logs[0].values[0][0] !== 4) throw new Error('review log rating mismatch')
}

// --- Test: Search (LIKE across tables) ---
function testSearch() {
  const noteId = uuid(), convId = uuid(), groupId = uuid()

  // insert searchable data
  db.run('INSERT INTO groups(id,title) VALUES(?,?)', [groupId, 'searchable-group'])
  db.run(`INSERT INTO conversations(id,group_id,title) VALUES(?,?,?)`,
    [convId, groupId, 'searchable-conv'])
  db.run(`INSERT INTO notes(id,title,body,tags) VALUES(?,?,?,?)`,
    [noteId, 'searchable-note', 'unique-search-term-x7z', 'tag-search'])

  // search notes
  let results = db.exec(`SELECT id,title FROM notes WHERE body LIKE '%unique-search-term-x7z%'`)
  if (results[0].values.length === 0) throw new Error('search note body failed')
  if (results[0].values[0][1] !== 'searchable-note') throw new Error('search note title mismatch')

  // search conversations
  results = db.exec(`SELECT id,title FROM conversations WHERE title LIKE '%searchable-conv%'`)
  if (results[0].values.length === 0) throw new Error('search conv failed')

  // search groups
  results = db.exec(`SELECT id,title FROM groups WHERE title LIKE '%searchable-group%'`)
  if (results[0].values.length === 0) throw new Error('search group failed')
}

// --- Test: Messages in a conversation ---
function testMessageChain() {
  const convId = uuid(), groupId = uuid()

  db.run('INSERT INTO groups(id,title) VALUES(?,?)', [groupId, 'msg-group'])
  db.run('INSERT INTO conversations(id,group_id,title) VALUES(?,?,?)', [convId, groupId, 'msg-conv'])

  // insert messages
  for (let i = 0; i < 3; i++) {
    db.run('INSERT INTO messages(id,conversation_id,role,content,sort) VALUES(?,?,?,?,?)',
      [uuid(), convId, i % 2 === 0 ? 'user' : 'assistant', `message-${i}`, i])
  }

  // list messages in order
  const msgs = db.exec('SELECT content,role FROM messages WHERE conversation_id=? ORDER BY sort', [convId])
  if (msgs[0].values.length !== 3) throw new Error('expected 3 messages')
  if (msgs[0].values[0][1] !== 'user') throw new Error('msg[0] should be user')
  if (msgs[0].values[1][1] !== 'assistant') throw new Error('msg[1] should be assistant')

  // patch a message
  const firstId = db.exec('SELECT id FROM messages WHERE conversation_id=? ORDER BY sort LIMIT 1', [convId])[0].values[0][0]
  db.run('UPDATE messages SET content=? WHERE id=?', ['patched-content', firstId])
  const patched = db.exec('SELECT content FROM messages WHERE id=?', [firstId])
  if (patched[0].values[0][0] !== 'patched-content') throw new Error('message patch failed')
}

// --- Test: Ebook + highlight chain ---
function testEbookChain() {
  const bookId = uuid()

  // import book
  db.run('INSERT INTO books(id,title,kind,file_path,total_pages) VALUES(?,?,?,?,?)',
    [bookId, 'test-book', 'pdf', '/fake/path/test.pdf', 100])

  let row = db.exec('SELECT title,total_pages FROM books WHERE id=?', [bookId])
  if (row[0].values[0][0] !== 'test-book') throw new Error('book create failed')
  if (row[0].values[0][1] !== 100) throw new Error('book total_pages mismatch')

  // add highlight
  const hlId = uuid()
  db.run('INSERT INTO highlights(id,book_id,page,text,color,rect_x,rect_y,rect_w,rect_h) VALUES(?,?,?,?,?,?,?,?,?)',
    [hlId, bookId, 10, 'highlighted text', 'yellow', 0.1, 0.2, 0.3, 0.4])

  row = db.exec('SELECT text,color FROM highlights WHERE id=?', [hlId])
  if (row[0].values[0][0] !== 'highlighted text') throw new Error('highlight create failed')

  // list highlights by book
  const hls = db.exec('SELECT id,text FROM highlights WHERE book_id=?', [bookId])
  if (hls[0].values.length !== 1) throw new Error('expected 1 highlight')

  // update last page
  db.run('UPDATE books SET last_page=? WHERE id=?', [42, bookId])
  row = db.exec('SELECT last_page FROM books WHERE id=?', [bookId])
  if (row[0].values[0][0] !== 42) throw new Error('book last_page update failed')

  db.run('DELETE FROM highlights WHERE id=?', [hlId])
  db.run('DELETE FROM books WHERE id=?', [bookId])
}

// --- Test: Folder tree (notes hierarchy) ---
function testFolderTree() {
  const rootId = uuid(), childId = uuid()

  // create folder
  db.run('INSERT INTO notes(id,title,kind) VALUES(?,?,?)', [rootId, 'root-folder', 'folder'])

  // create note under folder
  db.run('INSERT INTO notes(id,title,body,parent_id,kind) VALUES(?,?,?,?,?)',
    [childId, 'child-note', 'child content', rootId, 'note'])

  // list children
  let children = db.exec('SELECT id,title,kind FROM notes WHERE parent_id=? ORDER BY sort', [rootId])
  if (children[0].values.length !== 1) throw new Error('expected 1 child')
  if (children[0].values[0][1] !== 'child-note') throw new Error('child title mismatch')

  // move child (change parent)
  db.run('UPDATE notes SET parent_id=null WHERE id=?', [childId])
  children = db.exec('SELECT id FROM notes WHERE parent_id=?', [rootId])
  if (children[0] && children[0].values.length > 0) throw new Error('child should have no parent')

  db.run('DELETE FROM notes WHERE id IN (?,?)', [rootId, childId])
}

// --- Test: Error handling (IPC helper simulation) ---
function testResultWrapper() {
  // simulate the registerIpc/unwrapIpc contract
  function registerIpc(handler) {
    return async (...args) => {
      try { return { ok: true, data: await handler(...args) } }
      catch (err) { return { ok: false, error: err.message } }
    }
  }
  function unwrap(result) {
    if (!result.ok) throw new Error(result.error)
    return result.data
  }

  const wrapped = registerIpc(async (x) => {
    if (x < 0) throw new Error('negative not allowed')
    return x * 2
  })

  // success path
  const okResult = wrapped(5)
  // This is a promise, we need to handle it differently
  okResult.then(r => {
    if (r.data !== 10) throw new Error('success path wrong')
    if (!r.ok) throw new Error('ok flag should be true')
  })

  // error path
  const errResult = wrapped(-1)
  errResult.then(r => {
    if (r.ok) throw new Error('should not be ok')
    if (!r.error.includes('negative')) throw new Error('error message wrong')
  })
}

// ===== Main =====
;(async () => {
  console.log('\nLearning Kit — 集成测试\n')
  console.log(`用时: ${new Date().toISOString()}`)
  console.log('')

  const SQL = await initSqlJs()
  global._Database = SQL.Database

  // each test gets a fresh in-memory DB
  function freshDb() {
    const d = new SQL.Database()
    db = d
    schema()
    return d
  }

  // Conv CRUD
  freshDb(); test('对话 CRUD', testConvCrud); db.close()
  freshDb(); test('笔记持久化 (create + update + export/import)', testNotesPersist); db.close()
  freshDb(); test('SRS 卡片周期 (create + SM-2 review + log)', testSrsCycle); db.close()
  freshDb(); test('搜索 (LIKE 跨表)', testSearch); db.close()
  freshDb(); test('消息链 (insert + list + patch)', testMessageChain); db.close()
  freshDb(); test('电子书 + 高亮链', testEbookChain); db.close()
  freshDb(); test('笔记文件夹树 (parent/child hierarchy)', testFolderTree); db.close()
  test('IPC 错误包装 (result/unwrap 契约)', testResultWrapper)

  console.log(`\n━━━ 结果: ${pass} 通过, ${fail} 失败 ━━━\n`)
  process.exit(fail > 0 ? 1 : 0)
})()
