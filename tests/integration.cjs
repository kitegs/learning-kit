// Integration tests for Learning Kit core data chains.
// Run: node tests/integration.js
// Tests use sql.js directly — no Electron window needed.

const initSqlJs = require('sql.js')
const assert = require('assert')
const { readFileSync } = require('fs')
const { performance } = require('perf_hooks')
const ts = require('typescript')

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
    CREATE TABLE IF NOT EXISTS exercise_sets (id TEXT PRIMARY KEY,title TEXT NOT NULL,source_json TEXT NOT NULL,settings_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS exercise_questions (id TEXT PRIMARY KEY,set_id TEXT NOT NULL,type TEXT NOT NULL,prompt TEXT NOT NULL,answer_json TEXT NOT NULL,explanation TEXT,difficulty TEXT,tags_json TEXT NOT NULL DEFAULT '[]',source_json TEXT NOT NULL DEFAULT '[]',sort INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE INDEX IF NOT EXISTS idx_exercise_questions_set ON exercise_questions(set_id, sort);
    CREATE TABLE IF NOT EXISTS exercise_attempts (id TEXT PRIMARY KEY,question_id TEXT NOT NULL,answer_json TEXT NOT NULL DEFAULT 'null',correct INTEGER,self_rating TEXT,feedback TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE INDEX IF NOT EXISTS idx_exercise_attempts_question ON exercise_attempts(question_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS ocr_jobs (id TEXT PRIMARY KEY,book_id TEXT NOT NULL,pages_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',result_json TEXT,error TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),confirmed_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_ocr_jobs_book ON ocr_jobs(book_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS ocr_blocks (id TEXT PRIMARY KEY,job_id TEXT NOT NULL,book_id TEXT NOT NULL,page INTEGER NOT NULL,text TEXT NOT NULL DEFAULT '',x REAL,y REAL,w REAL,h REAL,status TEXT NOT NULL DEFAULT 'draft',metadata_json TEXT NOT NULL DEFAULT '{}',sort INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE INDEX IF NOT EXISTS idx_ocr_blocks_book_page ON ocr_blocks(book_id, page, status, sort);
    CREATE INDEX IF NOT EXISTS idx_ocr_blocks_job ON ocr_blocks(job_id, sort);
    CREATE TABLE IF NOT EXISTS book_outline_overrides (id TEXT PRIMARY KEY,book_id TEXT NOT NULL,parent_id TEXT,title TEXT NOT NULL,page INTEGER,anchor TEXT,sort INTEGER NOT NULL DEFAULT 0,source_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE INDEX IF NOT EXISTS idx_outline_overrides_book ON book_outline_overrides(book_id, parent_id, sort);
    CREATE TABLE IF NOT EXISTS tool_operations (id TEXT PRIMARY KEY,source TEXT NOT NULL,action TEXT NOT NULL,params_json TEXT NOT NULL,preview TEXT,status TEXT NOT NULL DEFAULT 'pending',affected_json TEXT NOT NULL DEFAULT '[]',snapshots_json TEXT NOT NULL DEFAULT '[]',result_json TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),completed_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_tool_operations_created ON tool_operations(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tool_operations_status ON tool_operations(status, created_at DESC);
    CREATE TABLE IF NOT EXISTS mcp_pending_requests (id TEXT PRIMARY KEY,operation_id TEXT NOT NULL,request_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',result_json TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')),resolved_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_mcp_pending_status ON mcp_pending_requests(status, created_at);
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

// --- Test: durable learning-operation schema declarations ---
function testLearningOperationSchemaDeclarations() {
  const dbSource = readFileSync('electron/main/db.ts', 'utf8')
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS exercise_sets/)
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS ocr_blocks/)
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS tool_operations/)
}

// --- Test: PDF cover previews can be persisted through the existing book update IPC ---
function testBookCoverUpdateSupport() {
  const bookSource = readFileSync('electron/main/book.ts', 'utf8')
  assert.match(bookSource, /patch\.cover !== undefined/)
}

// --- Test: confirmed internal AI tool proposal flow ---
function testConfirmedInternalAiToolFlow() {
  const appSource = readFileSync('src/App.vue', 'utf8')
  const centerSource = readFileSync('src/components/AiToolCenter.vue', 'utf8')
  const promptSource = readFileSync('resources/promt/system.txt', 'utf8')
  assert.match(appSource, /toolProposeInternal/)
  assert.match(appSource, /toolApprove/)
  assert.match(appSource, /toolReject/)
  assert.match(appSource, /toolOperations/)
  assert.match(appSource, /toolUndo/)
  assert.doesNotMatch(appSource, /executeActions/)
  assert.match(centerSource, /预览/)
  assert.match(centerSource, /影响范围/)
  assert.match(centerSource, /撤销/)
  assert.match(promptSource, /exercise_set/)
  assert.match(promptSource, /flashcard_from_error/)
}

// --- Test: durable learning-operation schema runtime contract ---
function testLearningOperationSchemaRuntime() {
  const tables = new Set(db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.map(row => row[0]))
  for (const table of [
    'exercise_sets', 'exercise_questions', 'exercise_attempts', 'ocr_jobs',
    'ocr_blocks', 'book_outline_overrides', 'tool_operations', 'mcp_pending_requests'
  ]) {
    if (!tables.has(table)) throw new Error(`missing durable table: ${table}`)
  }

  const indexes = new Set(db.exec("SELECT name FROM sqlite_master WHERE type='index'")[0].values.map(row => row[0]))
  for (const index of [
    'idx_exercise_questions_set', 'idx_exercise_attempts_question', 'idx_ocr_jobs_book',
    'idx_ocr_blocks_book_page', 'idx_ocr_blocks_job', 'idx_outline_overrides_book',
    'idx_tool_operations_created', 'idx_tool_operations_status', 'idx_mcp_pending_status'
  ]) {
    if (!indexes.has(index)) throw new Error(`missing durable index: ${index}`)
  }

  const setId = uuid(), questionId = uuid(), attemptId = uuid()
  db.run('INSERT INTO exercise_sets(id,title,source_json) VALUES(?,?,?)', [setId, 'schema exercise set', '["app://block/source-1"]'])
  db.run('INSERT INTO exercise_questions(id,set_id,type,prompt,answer_json) VALUES(?,?,?,?,?)', [questionId, setId, 'single', 'schema question', '["A"]'])
  db.run('INSERT INTO exercise_attempts(id,question_id,answer_json,correct) VALUES(?,?,?,?)', [attemptId, questionId, '["A"]', 1])
  const attempt = db.exec('SELECT correct FROM exercise_attempts WHERE id=?', [attemptId])
  if (attempt[0].values[0][0] !== 1) throw new Error('exercise attempt was not persisted')

  const jobId = uuid(), blockId = uuid()
  db.run('INSERT INTO ocr_jobs(id,book_id,pages_json) VALUES(?,?,?)', [jobId, 'book-1', '[3]'])
  db.run('INSERT INTO ocr_blocks(id,job_id,book_id,page,text) VALUES(?,?,?,?,?)', [blockId, jobId, 'book-1', 3, '识别文字'])
  const block = db.exec('SELECT text FROM ocr_blocks WHERE id=?', [blockId])
  if (block[0].values[0][0] !== '识别文字') throw new Error('OCR block was not persisted')

  const operationId = uuid(), pendingId = uuid()
  db.run('INSERT INTO tool_operations(id,source,action,params_json) VALUES(?,?,?,?)', [operationId, 'mcp', 'append_note', '{"noteId":"note-1"}'])
  db.run('INSERT INTO mcp_pending_requests(id,operation_id,request_json) VALUES(?,?,?)', [pendingId, operationId, '{"action":"append_note"}'])
  const pending = db.exec('SELECT operation_id FROM mcp_pending_requests WHERE id=?', [pendingId])
  if (pending[0].values[0][0] !== operationId) throw new Error('MCP pending request was not persisted')
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

// --- Test: Tree building (simulates the SidebarView race condition) ---
function testSidebarTreeRace() {
  const g1 = uuid(), g2 = uuid(), c1 = uuid(), c2 = uuid()

  // setup: 2 groups, 2 conversations under g1, 1 under g2
  db.run('INSERT INTO groups(id,title,sort,expanded) VALUES(?,?,?,?)', [g1, 'group1', 0, 1])
  db.run('INSERT INTO groups(id,title,sort,expanded) VALUES(?,?,?,?)', [g2, 'group2', 1, 1])
  db.run('INSERT INTO conversations(id,group_id,title,sort) VALUES(?,?,?,?)', [c1, g1, 'conv1', 0])
  db.run('INSERT INTO conversations(id,group_id,title,sort) VALUES(?,?,?,?)', [c2, g1, 'conv2', 1])
  db.run('INSERT INTO conversations(id,group_id,title,sort) VALUES(?,?,?,?)', [uuid(), g2, 'conv3', 0])
  db.run('INSERT INTO conversations(id,group_id,title,sort) VALUES(?,?,?,?)', [uuid(), null, 'root-conv', 0])

  // --- Simulate the OLD sequential race ---
  // Phase 1: only groups loaded (as they would appear after first await in onMounted)
  const groupRows = db.exec('SELECT id,parent_id,title,sort,expanded FROM groups ORDER BY sort')
  const groups = groupRows[0].values.map(r => ({
    id: r[0], parentId: r[1] ?? null, title: r[2], sort: r[3], expanded: !!r[4]
  }))

  // Phase 2: conversations not yet loaded → tree appears empty
  // At this point, buildMergedTree would show groups with NO conversations
  // This is the bug: groups appear as "empty folders"

  // Phase 3: conversations loaded
  const convRows = db.exec('SELECT id,group_id,title,sort,updated_at FROM conversations')
  const convs = convRows[0].values.map(r => ({
    id: r[0], group_id: r[1] ?? null, title: r[2], sort: r[3], updated_at: r[4] || ''
  }))

  // Verify convs exist (3 in groups + 1 root)
  const groupConvs = convs.filter(c => c.group_id === g1)
  if (groupConvs.length !== 2) throw new Error('expected 2 convs in group1')

  // The fix: when both groups and convs are fetched in the same tick,
  // buildMergedTree should produce correct tree with non-empty groups
  function buildMergedTree(groups, convs) {
    const convByGroup = new Map()
    for (const c of convs) {
      const k = c.group_id ?? 'null'
      if (!convByGroup.has(k)) convByGroup.set(k, [])
      convByGroup.get(k).push(c)
    }
    const sortConvs = (arr) => arr.slice().sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    const convNodes = (gid) =>
      sortConvs(convByGroup.get(gid) || []).map(c => ({ id: c.id, kind: 'conv', title: c.title, group_id: c.group_id }))
    const mapGroup = (g) => ({
      id: g.id, kind: 'group', title: g.title, parentId: g.parentId,
      children: [...(g.children || []).map(mapGroup), ...convNodes(g.id)],
    })
    const topGroups = groups.filter(g => !g.parentId).sort((a, b) => a.sort - b.sort)
    return [...topGroups.map(mapGroup), ...convNodes('null')]
  }

  // Verify tree with full data (should have convs in groups)
  const tree = buildMergedTree(groups, convs)
  if (tree.length !== 3) throw new Error(`expected 3 top-level items, got ${tree.length}`)
  // group1 should have 2 conversations
  const group1Node = tree.find(n => n.title === 'group1')
  if (!group1Node) throw new Error('group1 not found in tree')
  if (group1Node.children.length !== 2) throw new Error(`group1 expected 2 children, got ${group1Node.children.length}`)
  // group2 should have 1 conversation
  const group2Node = tree.find(n => n.title === 'group2')
  if (!group2Node) throw new Error('group2 not found in tree')
  if (group2Node.children.length !== 1) throw new Error(`group2 expected 1 child, got ${group2Node.children.length}`)
  // root should have 1 conversation
  const rootNode = tree.find(n => n.kind === 'conv')
  if (!rootNode) throw new Error('root conv not found')

  // Now simulate the race: groups loaded but convs empty
  const partialTree = buildMergedTree(groups, [])
  if (partialTree.length !== 2) throw new Error(`expected 2 groups (no root convs), got ${partialTree.length}`)
  if (partialTree[0].children.length !== 0) throw new Error('groups should appear empty when convs not loaded')
  // The partial tree groups SHOULD be empty - this is the transient state we want to eliminate
}

// --- Test: Empty/data states (covers all SidebarView states) ---
function testEmptyDataStates() {
  function buildMergedTree(groups, convs) {
    const convByGroup = new Map()
    for (const c of convs) {
      const k = c.group_id ?? 'null'
      if (!convByGroup.has(k)) convByGroup.set(k, [])
      convByGroup.get(k).push(c)
    }
    const sortConvs = (arr) => arr.slice().sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    const convNodes = (gid) =>
      sortConvs(convByGroup.get(gid) || []).map(c => ({ id: c.id, kind: 'conv', title: c.title, group_id: c.group_id }))
    const mapGroup = (g) => ({
      id: g.id, kind: 'group', title: g.title, parentId: g.parentId,
      children: [...(g.children || []).map(mapGroup), ...convNodes(g.id)],
    })
    const topGroups = groups.filter(g => !g.parentId).sort((a, b) => a.sort - b.sort)
    return [...topGroups.map(mapGroup), ...convNodes('null')]
  }

  // 1. Both empty - first launch
  const empty = buildMergedTree([], [])
  if (empty.length !== 0) throw new Error('empty->empty should be 0 items')

  // 2. Groups only, no convs (the transient race state)
  const groups = [
    { id: 'g1', parentId: null, title: 'folder', sort: 0, expanded: true, children: [] }
  ]
  const groupsOnly = buildMergedTree(groups, [])
  if (groupsOnly.length !== 1) throw new Error('groupsOnly should have 1 item')
  if (groupsOnly[0].children.length !== 0) throw new Error('groupsOnly group should have 0 children')

  // 3. Groups + convs (normal state)
  const convs = [
    { id: 'c1', group_id: 'g1', title: 'conv', sort: 0, updated_at: '2026-01-01' }
  ]
  const full = buildMergedTree(groups, convs)
  if (full.length !== 1) throw new Error('full should have 1 item')
  if (full[0].children.length !== 1) throw new Error('full group should have 1 child')

  // 4. No groups, only root convs (group_id = null)
  const rootOnly = buildMergedTree([], [
    { id: 'r1', group_id: null, title: 'root-conv', sort: 0, updated_at: '2026-01-01' }
  ])
  if (rootOnly.length !== 1) throw new Error('rootOnly should have 1 item')
  if (rootOnly[0].kind !== 'conv') throw new Error('rootOnly item should be conv')
  if (rootOnly[0].title !== 'root-conv') throw new Error('rootOnly conv title mismatch')

  // 5. Nested groups with convs
  const parent = { id: 'parent', parentId: null, title: 'parent', sort: 0, expanded: true,
    children: [{ id: 'child', parentId: 'parent', title: 'child', sort: 0, expanded: true, children: [] }] }
  const nConvs = [{ id: 'nc', group_id: 'child', title: 'deep-conv', sort: 0, updated_at: '2026-01-01' }]
  const nested = buildMergedTree([parent], nConvs)
  if (nested.length !== 1) throw new Error('nested should have 1 item')
  if (nested[0].children.length !== 1) throw new Error('parent should have 1 child')
  if (nested[0].children[0].children.length !== 1) throw new Error('child should have 1 conv')
  if (nested[0].children[0].children[0].title !== 'deep-conv') throw new Error('deep conv title mismatch')
}
function testReaderProductivityRegression() {
  const shortcuts = readFileSync('src/helpers/shortcuts.ts', 'utf8')
  const app = readFileSync('src/App.vue', 'utf8')
  const reader = readFileSync('src/views/PdfReaderView.vue', 'utf8')
  const ocr = readFileSync('electron/main/ocr.ts', 'utf8')
  const prd = readFileSync('electron/main/prd-v3.ts', 'utf8')
  const preload = readFileSync('electron/preload/index.ts', 'utf8')
  const env = readFileSync('src/env.d.ts', 'utf8')
  assert(shortcuts.includes('hasCtrl !== needsCtrl'), 'shortcut matching must reject extra Ctrl/Cmd modifiers')
  assert(shortcuts.includes('event.shiftKey !== needsShift'), 'shortcut matching must reject extra Shift modifiers')
  assert(app.includes("from './helpers/shortcuts'"), 'App must use the shared exact shortcut matcher')
  assert(reader.includes('const targetPage = page.value') && reader.includes('epoch !== renderEpoch'), 'PDF rendering must pin its page and reject stale async renders')
  assert(reader.includes("coord: 'normalized'"), 'new sticky notes must persist page-relative coordinates')
  assert(reader.includes('page: targetPage') && reader.includes('div.dataset.page'), 'sticky annotations must retain their owning page')
  assert(reader.includes('ocrRecognize') && reader.includes('buildOutlineFromPages'), 'reader must expose local OCR page-range outline generation')
  assert(reader.includes("linkRelate('book'"), 'ebook-created notes must persist an explicit book-note relation')
  assert(reader.includes('pageInput') && reader.includes('jumpToPage'), 'reader must provide a direct page-number jump control')
  assert(reader.includes('第 {{ page }} / {{ totalPages'), 'reader must always render an explicit current-page label')
  assert(reader.includes('openTextOutlineImport') && reader.includes('saveTextOutline'), 'reader must provide previewed text-to-outline import')
  assert(reader.includes('@contextmenu.prevent.stop="openTocItemMenu($event, i)"'), 'each outline item must expose its edit menu')
  assert(reader.includes('renameTocItem') && reader.includes('changeTocPage') && reader.includes('addTocItem') && reader.includes('deleteTocItem'), 'outline edit menu must support rename, repoint, add and delete')
  assert(reader.includes('shiftTocLevel') && reader.includes('persistCustomOutline'), 'outline hierarchy edits must persist as a custom local outline')
  assert(reader.includes("{ label: '批注参数…'") && reader.includes('data-testid="pdf-annotation-settings"'), 'PDF annotation settings must be available from right-click and the visible toolbar')
  assert(reader.includes("if (e.button !== 0 || !annMode.value || !annCanvas) return"), 'right-clicking annotation mode must not create an accidental stroke')
  assert(reader.includes('lk_pdf_annotation_preferences_v1') && reader.includes('highlighterOpacity'), 'PDF pen and highlighter parameters must persist locally')
  assert(reader.includes('const previous = annPts[annPts.length - 1]') && reader.includes('annCtx.moveTo(previous[0], previous[1])'), 'live highlighter drawing must render only the newest segment to prevent alpha accumulation')
  assert(reader.includes('d.opacity ?? DEFAULT_ANN_PREFS.highlighterOpacity') && reader.includes('mix-blend-mode:multiply'), 'saved PDF highlighter opacity must render with text-preserving blend mode')
  assert(reader.includes('captureViewportAnchor') && reader.includes('restoreViewportAnchor') && reader.includes('pendingViewportAnchor'), 'PDF redraws must preserve a stable reading anchor across rapid zoom events')
  assert(reader.includes('renderPage({ preserveViewport: false })') && reader.includes('pageRect.height * anchor.relativeY'), 'page navigation must reset while zoom restores the same relative page position')
  assert(reader.includes("wrap.value?.scrollTo({ top: 0, left: 0 })"), 'page navigation must reset the viewport to the new page top')
  assert(reader.includes("ta.addEventListener('input', saveStickyText)"), 'sticky-note edits must autosave without requiring blur')
  assert(ocr.includes("createWorker('chi_sim'") && ocr.includes("ipc.handle('ocr:recognize'"), 'OCR must use the bundled offline simplified-Chinese worker')
  assert(ocr.includes('PSM.SINGLE_BLOCK') && ocr.includes('preserve_interword_spaces'), 'OCR must use directory-friendly page segmentation')
  assert(prd.includes('section_anchor=excluded.section_anchor,deleted_at=NULL'), 'rebuilding a soft-deleted outline must restore its rows')
  assert(preload.includes('ocrRecognize:') && env.includes('ocrRecognize:'), 'OCR IPC must be synchronized through preload and renderer types')
}

function testTextOutlineImport() {
  const source = readFileSync('src/helpers/outline-import.ts', 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', 'require', output)(module, module.exports, require)
  const input = `**基础过关 1 阶**
**高等数学**
填空题: 5
选择题: 43
**线性代数**
填空题: 98
选择题: 120
**概率论与数理统计**
填空题: 151
选择题: 171
**基础过关 2 阶**
**高等数学**
填空题: 203
选择题: 216`
  const entries = module.exports.parseImportedOutline(input, 0, 235)
  assert.strictEqual(entries.length, 14, 'all headings and page entries should be imported')
  assert.deepStrictEqual(entries.slice(0, 4), [
    { title: '基础过关 1 阶', page: 5, depth: 0 },
    { title: '高等数学', page: 5, depth: 1 },
    { title: '填空题', page: 5, depth: 2 },
    { title: '选择题', page: 43, depth: 2 },
  ])
  assert.deepStrictEqual(entries.slice(-4), [
    { title: '基础过关 2 阶', page: 203, depth: 0 },
    { title: '高等数学', page: 203, depth: 1 },
    { title: '填空题', page: 203, depth: 2 },
    { title: '选择题', page: 216, depth: 2 },
  ])
  const shifted = module.exports.parseImportedOutline('## 章节\n条目：5', 7, 235)
  assert.strictEqual(shifted[0].page, 12, 'page offset should be applied to generated jumps')
}

function testNotebookInkAndUndoRegression() {
  const notebook = readFileSync('src/components/OpenNotebookEditor.vue', 'utf8')
  const notes = readFileSync('src/views/NotesView.vue', 'utf8')
  assert(notebook.includes('data-testid="notebook-ink-settings"') && notebook.includes('批注参数'), 'paper notebook must expose a discoverable annotation settings entry')
  assert(notebook.includes("highlighterColor: '#ffe066'") && notebook.includes('highlighterWidth: 12'), 'highlighter must use its own visible translucent defaults')
  assert(notebook.includes("blendMode: tool.value === 'highlighter' ? 'multiply' : 'source-over'"), 'new highlighter strokes must persist their blend mode')
  assert(notebook.includes('mix-blend-mode:multiply'), 'ink canvas must blend with paper text instead of visually covering it')
  assert(notebook.includes('@keydown.capture="onKeydown"') && notebook.includes('event.stopPropagation()'), 'notebook undo must capture Ctrl+Z across paper and annotation toolbar focus')
  assert(notebook.includes('canvas.closest<HTMLElement>(\'.book-table\')?.focus'), 'drawing must focus the notebook so immediate Ctrl+Z reaches its history')
  assert(notebook.includes('syncOut(false)') && notebook.includes('Reflow is the layout result'), 'automatic reflow must not create a fake extra undo step')
  assert(notes.includes('openNotebookInkSettings') && notes.includes('批注参数'), 'Word-style draw ribbon must also expose annotation parameters')
  assert(notebook.includes('looksLikeMarkdownPaste') && notebook.includes('markdownPasteMarkup(text)'), 'paper notebook must route Markdown clipboard text through the complete Markdown/KaTeX renderer')
  assert(notebook.includes('wholeNotebookSelected') && notebook.includes("if (key === 'a')") && notebook.includes('notebookClipboardPayload'), 'Ctrl+A must select and serialize the complete logical notebook instead of one mounted paper page')
  assert(notebook.includes('@copy.capture="onNotebookCopy"') && notebook.includes('@cut.capture="onNotebookCut"') && notebook.includes('clearWholeNotebook'), 'whole-notebook selection must support cross-page copy, cut and deletion')
  assert(notebook.includes('restoreBracketMathDelimiters') && notebook.includes('repairLegacyFormulaBlocks') && notebook.includes('repairedLegacyFormula'), 'missing LaTeX bracket escapes must be repaired during paste and persisted-note loading')
  assert(notebook.includes('const blankWorkspace = target === container') && notebook.includes("event.button !== 1") && notebook.includes('spacePanHeld'), 'notebook panning must work from blank workspace, middle mouse and Space drag without forcing the hand tool')
  assert(notebook.includes('const panning = ref(false)') && notebook.includes("'hand-tool': tool === 'hand'"), 'panning feedback must remain reactive and expose the active hand cursor')
  assert(notes.includes('lk_notes_nav_open') && notes.includes('note-nav-toggle') && notes.includes("navTab === 'outline'"), 'note library navigation must collapse to a compact persistent rail and switch between notes and chapters')
  assert(notes.includes('@outline-change="noteOutlineItems=$event"') && notebook.includes("(e: 'outline-change'") && notebook.includes('goToHeadingId'), 'paper headings must feed the shared chapter navigator and remain directly locatable')
  assert(notebook.includes('notebook-global-layout') && notebook.includes('GLOBAL_LAYOUT_ENABLED_KEY') && notebook.includes('saveGlobalLayout'), 'layout popover must expose a persistent all-notes layout option')
  assert(notebook.includes('const sharedLayout = globalLayoutEnabled.value ? readGlobalLayout() : null') && notebook.includes('layout.value = sharedLayout || data.layout'), 'shared layout must override embedded layout whenever an existing or new note opens')
  assert(notebook.includes("['OL', 'UL', 'BLOCKQUOTE'].includes(container.tagName)") && notebook.includes("tail.setAttribute('start'"), 'pagination must split long lists at item boundaries and preserve ordered numbering')
}

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
  test('学习操作持久化 schema 声明', testLearningOperationSchemaDeclarations)
  test('电子书封面预览可持久化', testBookCoverUpdateSupport)
  test('电子书快捷键、便签、关联笔记、OCR 与跳页回归', testReaderProductivityRegression)
  test('文本目录导入与页码偏移', testTextOutlineImport)
  test('纸质笔记荧光笔、批注参数与撤销回归', testNotebookInkAndUndoRegression)
  test('内部 AI 工具提案、审批与撤销链路', testConfirmedInternalAiToolFlow)
  freshDb(); test('学习操作持久化 schema 运行时契约', testLearningOperationSchemaRuntime); db.close()
  test('IPC 错误包装 (result/unwrap 契约)', testResultWrapper)
  test('侧栏树构建 - 空/部分/完整三种状态', testEmptyDataStates)
  freshDb(); test('侧栏树构建 - 模拟时序竞态 (groups先加载,convs后加载)', testSidebarTreeRace); db.close()

  console.log(`\n━━━ 结果: ${pass} 通过, ${fail} 失败 ━━━\n`)
  process.exit(fail > 0 ? 1 : 0)
})()
