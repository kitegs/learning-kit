import sqlite3Init from '@sqlite.org/sqlite-wasm'
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs'

const DB_PATH = 'E:/learning kit/learning-kit/test-persist4.db'
if (existsSync(DB_PATH)) unlinkSync(DB_PATH)

const sqlite3 = await sqlite3Init()
const capi = sqlite3.capi

console.log('--- Test: serialize with flags ---')

const db = new sqlite3.oo1.DB(':memory:')
db.exec('CREATE TABLE test (x INTEGER, name TEXT)')
db.exec("INSERT INTO test VALUES (1, 'hello')")
db.exec("INSERT INTO test VALUES (2, 'world')")

// Export
const bytes = capi.sqlite3_js_db_export(db.pointer)
console.log('Exported:', bytes.byteLength, 'bytes, type:', typeof bytes, 'is Uint8Array:', bytes instanceof Uint8Array)

// Save to disk
const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
writeFileSync(DB_PATH, buf)
console.log('Wrote to disk')

// Read back
const loaded = new Uint8Array(readFileSync(DB_PATH))

// Try deserialize with different flags
// SQLITE_DESERIALIZE_FREEONCLOSE = 1
// SQLITE_DESERIALIZE_RESIZEABLE = 2  
// SQLITE_DESERIALIZE_READONLY = 4

const flagsToTry = [0, 1, 2, 3]
for (const flag of flagsToTry) {
  const db2 = new sqlite3.oo1.DB(':memory:')
  try {
    const rc = capi.sqlite3_deserialize(db2.pointer, 'main', loaded, loaded.byteLength, loaded.byteLength, flag)
    console.log(`Flag ${flag}: rc=${rc}`)
    if (rc === 0) {
      const rows = []
      db2.exec({ sql: 'SELECT * FROM test', rowMode: 'object', resultRows: rows })
      console.log(`Flag ${flag}: recovered ${rows.length} rows:`, rows.slice(0, 2))
      if (rows.length === 2) { console.log('=== PASSED ==='); db2.close(); break }
    }
  } catch(e) {
    console.log(`Flag ${flag}: threw ${e.message.slice(0, 50)}`)
  }
  db2.close()
}

// Also try: open DB from memory that was pre-sized
console.log('\n--- Try with pre-sized page count ---')
const nPages = Math.ceil(bytes.byteLength / 4096)
console.log(`Allocating ${nPages} pages...`)
const db3 = new sqlite3.oo1.DB(':memory:')
try {
  // Pre-size with empty pages
  const pageSize = 4096
  const emptyDb = new Uint8Array(nPages * pageSize)
  // copy the serialized data at the start
  if (loaded.byteLength > 0) {
    emptyDb.set(loaded.subarray(0, Math.min(loaded.byteLength, emptyDb.byteLength)))
  }
  const rc = capi.sqlite3_deserialize(db3.pointer, 'main', emptyDb, loaded.byteLength, emptyDb.byteLength, 2)
  console.log(`Pre-sized deserialize rc=${rc}`)
  if (rc === 0) {
    const rows = []
    db3.exec({ sql: 'SELECT * FROM test', rowMode: 'object', resultRows: rows })
    console.log('Recovered:', rows)
    console.log(rows.length === 2 ? 'PASSED' : 'FAILED')
  }
} catch(e) {
  console.log('Pre-sized threw:', e.message.slice(0, 60))
}
db3.close()

db.close()
