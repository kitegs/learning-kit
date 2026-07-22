import sqlite3Init from '@sqlite.org/sqlite-wasm'
import { existsSync, unlinkSync, statSync } from 'fs'

const DB_PATH2 = 'E:/learning kit/learning-kit/test-persist2.db'
if (existsSync(DB_PATH2)) unlinkSync(DB_PATH2)

const sqlite3 = await sqlite3Init()

console.log('--- Test: oo1.DB with real file path ---')
const db = new sqlite3.oo1.DB(DB_PATH2)
db.exec('CREATE TABLE test2 (x INTEGER)')
db.exec('INSERT INTO test2 VALUES (42)')
db.exec('INSERT INTO test2 VALUES (99)')

// Force some writes
db.exec('PRAGMA wal_checkpoint(FULL)')
db.close()

console.log('File exists:', existsSync(DB_PATH2))
console.log('File size:', statSync(DB_PATH2).size, 'bytes')

// Read back
console.log('\n--- Read back ---')
const db2 = new sqlite3.oo1.DB(DB_PATH2)
const rows = []
db2.exec({ sql: 'SELECT * FROM test2', rowMode: 'object', resultRows: rows })
console.log('Rows:', rows)
db2.close()

if (rows.length === 2 && rows[0].x === 42) {
  console.log('=== PASSED ===')
} else {
  console.error('=== FAILED ===')
}
