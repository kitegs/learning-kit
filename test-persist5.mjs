import sqlite3Init from '@sqlite.org/sqlite-wasm'
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs'

const DB_PATH = 'E:/learning kit/learning-kit/test-persist5.db'
if (existsSync(DB_PATH)) unlinkSync(DB_PATH)

const sqlite3 = await sqlite3Init()
const capi = sqlite3.capi
const wasm = sqlite3.wasm

const db = new sqlite3.oo1.DB(':memory:')
db.exec('CREATE TABLE test (x INTEGER, name TEXT)')
db.exec("INSERT INTO test VALUES (1, 'hello')")
db.exec("INSERT INTO test VALUES (2, 'world')")

// === Serialize with WASM heap ===
const pSize = wasm.alloc(8) // 8 bytes for i64
wasm.poke(pSize, 0, 'i64')  // zero it

const pData = capi.sqlite3_serialize(db.pointer, 'main', pSize, 0)
console.log('serialize ptr:', pData, 'type:', typeof pData)

const dataSize = Number(wasm.peek(pSize, 'i64'))
console.log('Data size:', dataSize)

// Copy from WASM heap to JS Uint8Array
const heap = wasm.heap8u() // returns Uint8Array view of WASM heap
const data = new Uint8Array(heap.subarray(pData, pData + dataSize))
console.log('Copied:', data.byteLength, 'bytes')

wasm.dealloc(pSize)
writeFileSync(DB_PATH, Buffer.from(data))
console.log('Wrote to disk')
db.close()

// === Deserialize ===
const buf = readFileSync(DB_PATH)
const db2 = new sqlite3.oo1.DB(':memory:')
try {
  const rc = capi.sqlite3_deserialize(db2.pointer, 'main', new Uint8Array(buf), buf.byteLength, buf.byteLength, 0)
  console.log('deserialize rc:', rc)
  const rows = []
  db2.exec({ sql: 'SELECT * FROM test', rowMode: 'object', resultRows: rows })
  console.log('Recovered:', rows)
  console.log(rows.length === 2 ? 'PASSED' : 'FAILED')
} catch(e) {
  console.log('deserialize error:', e.message.slice(0, 80))
}
db2.close()
