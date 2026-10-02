const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), init = require('sql.js')
const { randomUUID } = require('node:crypto')
async function main() {
  const SQL = await init(); let db = new SQL.Database(), failDedupeWrite = false, writes = 0
  db.exec(fs.readFileSync('electron/main/db.ts', 'utf8').match(/const SCHEMA = `([\s\S]*?)`/)[1])
  db.exec('ALTER TABLE notes ADD COLUMN deleted_at INTEGER')
  db.exec('ALTER TABLE knowledge_points ADD COLUMN deleted_at INTEGER')
  function qAll(database, sql, params = []) { const statement = database.prepare(sql), rows = []; try { statement.bind(params); while (statement.step()) rows.push(statement.getAsObject()); return rows } finally { statement.free() } }
  const qOne = (database, sql, params) => qAll(database, sql, params)[0]
  const bridge = { getDb: () => db, qAll, qOne, qRun: (database, sql, params = []) => { if (failDedupeWrite && sql.includes('INSERT INTO mcp_import_requests')) throw new Error('simulated dedupe write failure'); database.run(sql, params) }, uuid: randomUUID, schedulePersist: () => writes++ }
  const modules = { electron: {}, './db': bridge, './ipc-helpers': {}, './srs': {} }
  function load(file) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => modules[name] || require(name), console, Date, Buffer }); return exports }
  modules['./ai-diagram'] = load('electron/main/ai-diagram.ts')
  modules['../shared/tools'] = load('electron/shared/tools.ts')
  modules['../shared/knowledge-graph'] = load('electron/shared/knowledge-graph.ts')
  modules['./knowledge-point-policy'] = load('electron/main/knowledge-point-policy.ts')
  modules['./learning-artifacts'] = load('electron/main/learning-artifacts.ts')
  modules['../../mcp/schema'] = load('mcp/schema.ts')
  const tools = modules['./tool-service'] = load('electron/main/tool-service.ts')
  const imports = load('electron/main/mcp-import.ts'), dispatch = imports.dispatchMcpImport
  const count = table => qOne(db, `SELECT COUNT(*) n FROM ${table}`).n
  const input = { requestKey: 'one', title: '笔记', body: '正文' }
  assert.throws(()=>dispatch('import_note', { ...input, autoApprove: true }))
  assert.throws(()=>dispatch('import_note', { ...input, body: '   ' }))
  assert.throws(()=>dispatch('import_note', { ...input, body: 'x'.repeat(30001) }))
  assert.throws(()=>dispatch('import_note', { ...input, title: 'x'.repeat(301) }))
  assert.throws(()=>dispatch('import_knowledge_point', { requestKey: 'kp', title: '知识', description: 'x'.repeat(10001) }))
  assert.throws(()=>dispatch('approve', {}), /不支持/)
  assert.equal(count('tool_operations'), 0)
  const note = dispatch('import_note', input)
  assert.equal(note.status, 'pending_confirmation'); assert.equal(note.preview, '创建笔记')
  assert.match(tools.listOperations({source:'mcp'})[0].preview, /正文/)
  assert.equal(count('notes'), 0); assert.equal(imports.mcpPendingCount(), 1)
  assert.equal(dispatch('import_note', input).operationId, note.operationId)
  assert.throws(()=>dispatch('import_note', { ...input, body: 'changed' }), /不同内容/)
  const internal = tools.requestInternalTool('create_note', { title: '内部提案' })
  assert.throws(()=>dispatch('import_status', { operationId: internal.operationId }), /找不到外部/)
  tools.approveOperation(note.operationId)
  assert.equal(dispatch('import_note', input).status, 'applied'); assert.equal(count('notes'), 1)
  assert.equal(tools.approveOperation(note.operationId).status, 'failed')
  // 用户后来编辑过的笔记不可盲目撤销。
  db.run("UPDATE notes SET body='用户后续编辑'")
  assert.equal(tools.undoOperation(note.operationId).status, 'failed'); assert.equal(count('notes'), 1)
  failDedupeWrite = true
  const before = count('tool_operations')
  assert.throws(()=>dispatch('import_note', { ...input, requestKey: 'rollback' }), /dedupe/)
  assert.equal(count('tool_operations'), before); assert.equal(count('mcp_import_requests'), 1)
  failDedupeWrite = false
  // 最大合法正文/描述仅保留在本机预览；创建、轮询、重试均返回有界摘要。
  const large = { requestKey: 'compact-large', title: '全文预览', body: '正文'.repeat(15000) }
  const compact = dispatch('import_note', large)
  for (const result of [compact, dispatch('import_note', large), dispatch('import_status', { operationId: compact.operationId })]) {
    assert.ok(JSON.stringify(result).length < 500); assert.ok(!JSON.stringify(result).includes(large.body))
  }
  assert.ok(tools.toolCenterSnapshot({source:'mcp'}).pending.items.find(row=>row.id===compact.operationId).preview.includes(large.body))
  tools.rejectOperation(compact.operationId)
  const compactKnowledge = dispatch('import_knowledge_point', { requestKey:'compact-kp', title:'知识正文', description:'知'.repeat(10000) })
  assert.ok(JSON.stringify(compactKnowledge).length < 500); tools.rejectOperation(compactKnowledge.operationId)
  let last
  for (let i = 0; i < 100; i++) last = dispatch('import_note', { ...input, requestKey: `pending-${i}` })
  assert.equal(imports.mcpPendingCount(), 100)
  assert.throws(()=>dispatch('import_note', { ...input, requestKey: 'over-cap' }), /100 项/)
  // 已有 key 在队列满时仍能查询，不额外计入名额。
  assert.equal(dispatch('import_note', input).status, 'applied')
  tools.rejectOperation(last.operationId)
  assert.equal(imports.mcpPendingCount(), 99)
  const snapshot = db.export(); db.close(); db = new SQL.Database(snapshot)
  assert.equal(dispatch('import_note', { ...input, requestKey: 'pending-99' }).status, 'rejected')
  assert.equal(imports.mcpPendingCount(), 99); assert.ok(writes > 0)
  db.close()
  console.log('MCP import service: constraints, consent, scope, idempotency, no replay, edit-safe undo, atomic rollback, queue cap and restart PASS')
}
main().catch(error=>{console.error(error);process.exitCode=1})
