import sqlite3Init from '@sqlite.org/sqlite-wasm'
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs'

const DB_PATH = 'E:/learning kit/learning-kit/test-persist3.db'
if (existsSync(DB_PATH)) unlinkSync(DB_PATH)

const sqlite3 = await sqlite3Init()
const capi = sqlite3.capi

console.log('wasm keys:', Object.keys(sqlite3.wasm).slice(0, 15))
console.log('wasm has alloc:', typeof sqlite3.wasm.alloc)
console.log('wasm has peek:', typeof sqlite3.wasm.peek)

console.log('\n--- Test: serialize/deserialize ---')

const db = new sqlite3.oo1.DB(':memory:')
db.exec('CREATE TABLE test (x INTEGER, name TEXT)')
db.exec("INSERT INTO test VALUES (1, 'hello')")
db.exec("INSERT INTO test VALUES (2, 'world')")

// Try using sqlite3_js_db_export if available
if (typeof capi.sqlite3_js_db_export === 'function') {
  console.log('sqlite3_js_db_export is available!')
  const bytes = capi.sqlite3_js_db_export(db.pointer)
  console.log('Exported:', bytes?.byteLength || 'null', 'bytes')
  if (bytes) {
    writeFileSync(DB_PATH, Buffer.from(bytes))
    console.log('Wrote to disk')
    
    // Read back
    const buf = readFileSync(DB_PATH)
    const db2 = new sqlite3.oo1.DB(':memory:')
    capi.sqlite3_deserialize(db2.pointer, 'main', buf, buf.byteLength, buf.byteLength, 0)
    const rows = []
    db2.exec({ sql: 'SELECT * FROM test', rowMode: 'object', resultRows: rows })
    console.log('Recovered:', rows)
    console.log(rows.length === 2 ? 'PASSED' : 'FAILED')
    db2.close()
  }
} else {
  console.log('sqlite3_js_db_export not available, trying capi approach')
  // Try allocate memory for size output
  const wasm = sqlite3.wasm
  if (typeof wasm.alloc === 'function') {
    const pSize = wasm.alloc(8)
    wasm.poke(pSize, 0, 'i64')
    const pData = capi.sqlite3_serialize(db.pointer, 'main', pSize, 0)
    console.log('serialize ptr:', pData)
    if (pData) {
      const size = Number(wasm.peek(pSize, 'i64'))
      console.log('size:', size)
      const heap = new Uint8Array(wasm.memory.buffer)
      const data = new Uint8Array(heap.subarray(pData, pData + size))
      writeFileSync(DB_PATH, Buffer.from(data))
      wasm.free(pSize)
      console.log('Wrote', data.byteLength, 'bytes')

      // Read back
      const buf = readFileSync(DB_PATH)
      const db2 = new sqlite3.oo1.DB(':memory:')
      capi.sqlite3_deserialize(db2.pointer, 'main', buf, buf.byteLength, buf.byteLength, 0)
      const rows = []
      db2.exec({ sql: 'SELECT * FROM test', rowMode: 'object', resultRows: rows })
      console.log('Recovered:', rows)
      console.log(rows.length === 2 ? 'PASSED' : 'FAILED')
      db2.close()
    }
  } else {
    console.log('No alloc function, listing capi methods...')
    const exportFns = Object.keys(capi).filter(k => typeof capi[k] === 'function' && k.includes('serialize'))
    console.log('serialize-related:', exportFns)
  }
}

db.close()
