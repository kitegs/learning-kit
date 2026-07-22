import sqlite3Init from '@sqlite.org/sqlite-wasm'
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs'

const DB_PATH = 'E:/learning kit/learning-kit/test-persist.db'

// Clean up from previous test
if (existsSync(DB_PATH)) unlinkSync(DB_PATH)

const sqlite3 = await sqlite3Init()
const capi = sqlite3.capi

// === Test 1: full serialize/deserialize cycle ===
console.log('--- Test 1: serialize/deserialize ---')
const db = new sqlite3.oo1.DB(':memory:')
db.exec('CREATE TABLE test (id INTEGER, name TEXT)')
db.exec("INSERT INTO test VALUES (1, 'hello')")
db.exec("INSERT INTO test VALUES (2, 'world')")

// Serialize
const bytes = capi.sqlite3_serialize(db.pointer, 'main', null, 0)
console.log('Serialized bytes type:', typeof bytes, 'byteLength:', bytes?.byteLength || 'null')
console.log('Bytes is Uint8Array:', bytes instanceof Uint8Array)

// Write to file
if (bytes && bytes.byteLength > 0) {
  writeFileSync(DB_PATH, Buffer.from(bytes))
  console.log('Wrote', bytes.byteLength, 'bytes to disk')
} else {
  console.error('SERIALIZE FAILED - returned null or empty')
}

db.close()

// Read back
if (!existsSync(DB_PATH)) { console.error('File not created!'); process.exit(1) }
const buf = readFileSync(DB_PATH)
console.log('Read', buf.byteLength, 'bytes from disk')

// Deserialize
const db2 = new sqlite3.oo1.DB(':memory:')
try {
  const rc = capi.sqlite3_deserialize(db2.pointer, 'main', new Uint8Array(buf), buf.byteLength, buf.byteLength, 0)
  console.log('deserialize rc:', rc)
} catch(e) {
  console.error('deserialize threw:', e.message)
  process.exit(1)
}

const rows = []
db2.exec({ sql: 'SELECT * FROM test', rowMode: 'object', resultRows: rows })
console.log('Recovered rows:', rows)
db2.close()

if (rows.length === 2 && rows[0].name === 'hello') {
  console.log('=== TEST 1 PASSED ===\n')
} else {
  console.error('=== TEST 1 FAILED ===\n')
}

// === Test 2: oo1.DB with real file path ===
console.log('--- Test 2: oo1.DB with file path ---')
const dbPath2 = 'E:/learning kit/learning-kit/test-persist2.db'
if (existsSync(dbPath2)) unlinkSync(dbPath2)

const db3 = new sqlite3.oo1.DB(dbPath2)
db3.exec('CREATE TABLE test2 (x INTEGER)')
db3.exec('INSERT INTO test2 VALUES (42)')
db3.close()

// Check if file was created
console.log('File exists after close:', existsSync(dbPath2))
const stat = require('fs').statSync(dbPath2)
console.log('File size:', stat.size, 'bytes')

// Read back
const db4 = new sqlite3.oo1.DB(dbPath2)
const rows3 = []
db4.exec({ sql: 'SELECT * FROM test2', rowMode: 'object', resultRows: rows3 })
console.log('Rows from file:', rows3)
db4.close()

if (rows3.length === 1 && rows3[0].x === 42) {
  console.log('=== TEST 2 PASSED ===\n')
} else {
  console.error('=== TEST 2 FAILED ===\n')
}
