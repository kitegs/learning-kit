const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), init = require('sql.js')
const { randomUUID } = require('node:crypto')
async function main() {
  const SQL = await init(); let db = new SQL.Database(), writes = 0
  db.exec(fs.readFileSync('electron/main/db.ts', 'utf8').match(/const SCHEMA = `([\s\S]*?)`/)[1])
  db.exec('ALTER TABLE notes ADD COLUMN deleted_at INTEGER')
  function qAll(database, sql, params = []) { const s = database.prepare(sql), rows = []; try { s.bind(params); while (s.step()) rows.push(s.getAsObject()); return rows } finally { s.free() } }
  const qOne = (database, sql, params) => qAll(database, sql, params)[0]
  const bridge = { getDb: () => db, qAll, qOne, qRun: (database, sql, params = []) => database.run(sql, params), uuid: randomUUID, schedulePersist: () => writes++ }
  const modules = { electron: {}, './db': bridge, './ipc-helpers': {}, './srs': {} }
  function load(file, extras = {}) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => modules[name] || require(name), console, Date, performance, ...extras }); return exports }
  modules['./ai-diagram'] = load('electron/main/ai-diagram.ts')
  modules['../shared/tools'] = load('electron/shared/tools.ts')
  modules['../shared/knowledge-graph'] = load('electron/shared/knowledge-graph.ts')
  modules['./knowledge-point-policy'] = load('electron/main/knowledge-point-policy.ts')
  modules['./learning-artifacts'] = load('electron/main/learning-artifacts.ts')
  const tools = modules['./tool-service'] = load('electron/main/tool-service.ts')
  const flow = load('electron/main/ai-workflow.ts'), diag = load('electron/main/ai-diagnostics.ts')
  let tick = 100
  const diagnostic = new diag.AiRequestDiagnostic({ id: 'd', requestId: 'r', conversationId: null, provider: 'test', model: 'test', startedAt: 1 }, () => tick)
  tick = 145; diagnostic.content(); tick = 160; diagnostic.content(); tick = 190
  assert.equal(diagnostic.finish('completed').firstContentMs, 45)
  assert.equal(diagnostic.finish('completed').durationMs, 90)
  assert.equal(diagnostic.finish('completed').usage, null)
  diagnostic.tokens({ prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 })
  assert.equal(diagnostic.finish('completed').usage.total, 6)
  const start = (max = 6, owner = 1) => { const run = flow.beginAgentRun(owner, randomUUID(), 'c', max); flow.finishAgentModel(run.id, 'completed'); return run }
  assert.throws(() => start(1), /2–20/)
  const limited = start(2)
  const over = flow.prepareAgentTools(1, limited.id, [{ action: 'create_note', params: { title: 'one' } }, { action: 'create_note', params: { title: 'two' } }])
  assert.equal(over.status, 'failed'); assert.equal(qOne(db, 'SELECT COUNT(*) n FROM tool_operations').n, 0)
  const run = start()
  assert.throws(() => flow.prepareAgentTools(2, run.id, []), /当前窗口/)
  const pending = flow.prepareAgentTools(1, run.id, [{ action: 'create_note', params: { title: '确认后创建', body: 'data' } }])
  assert.equal(pending.status, 'awaiting_confirmation'); assert.equal(pending.usedSteps, 2)
  assert.equal(qOne(db, 'SELECT COUNT(*) n FROM notes').n, 0)
  assert.throws(() => flow.prepareAgentTools(1, run.id, []), /可预览/)
  const applied = flow.decideAgentStep(run.id, pending.steps[1].id, 'approve')
  assert.equal(applied.status, 'completed'); assert.equal(qOne(db, 'SELECT COUNT(*) n FROM notes').n, 1)
  assert.throws(() => flow.decideAgentStep(run.id, pending.steps[1].id, 'approve'), /重复执行/)
  assert.throws(() => flow.decideAgentStep(run.id, pending.steps[1].id, 'retry'), /失败工具/)
  tools.undoOperation(pending.steps[1].operationId)
  assert.equal(flow.getAgentRun(run.id).steps[1].status, 'undone')
  const failure = start(3)
  const failed = flow.prepareAgentTools(1, failure.id, [{ action: 'append_note', params: { noteId: 'missing', text: 'add' } }])
  assert.equal(failed.status, 'failed')
  db.run("INSERT INTO notes(id,title,body) VALUES('missing','target','old')")
  const retry = flow.decideAgentStep(failed.id, failed.steps[1].id, 'retry')
  assert.equal(retry.usedSteps, 3); assert.equal(retry.steps[1].status, 'pending_confirmation')
  assert.equal(qOne(db, "SELECT body FROM notes WHERE id='missing'").body, 'old')
  const success = flow.decideAgentStep(failed.id, failed.steps[1].id, 'approve')
  assert.equal(success.status, 'completed'); assert.equal(qOne(db, "SELECT body FROM notes WHERE id='missing'").body, 'old\n\nadd')
  const capped = start(2), cappedResult = flow.prepareAgentTools(1, capped.id, [{ action: 'append_note', params: { noteId: 'absent', text: 'add' } }])
  assert.throws(() => flow.decideAgentStep(capped.id, cappedResult.steps[1].id, 'retry'), /步骤上限/)
  const rejected = start(), rejectedTools = flow.prepareAgentTools(1, rejected.id, [{ action: 'create_note', params: { title: 'reject' } }])
  assert.equal(flow.decideAgentStep(rejected.id, rejectedTools.steps[1].id, 'reject').steps[1].status, 'rejected')
  const invalid = start()
  assert.equal(flow.prepareAgentTools(1, invalid.id, [{ action: 'delete', params: {} }]).status, 'failed')
  const inFlight = flow.beginAgentRun(1, 'crash', 'c'), awaiting = start()
  const durable = start(), durableTools = flow.prepareAgentTools(1, durable.id, [{ action: 'create_note', params: { title: 'durable' } }])
  flow.saveDiagnostic(diagnostic.finish('completed'))
  const bytes = db.export(); db.close(); db = new SQL.Database(bytes)
  const handlers = new Map(); flow.registerAiWorkflowIpcs({ handle: (name, handler) => handlers.set(name, handler) })
  assert.equal(flow.getAgentRun(inFlight.id).status, 'interrupted')
  assert.equal(flow.getAgentRun(awaiting.id).status, 'interrupted')
  assert.equal(flow.getAgentRun(durable.id).steps[1].status, 'pending_confirmation')
  assert.equal(flow.decideAgentStep(durable.id, durableTools.steps[1].id, 'approve').status, 'completed')
  assert.equal(handlers.get('ai:diagnostics:list')({}, 'c').length, 0)
  assert.equal(handlers.get('ai:diagnostics:list')({}).length, 1)
  for (let i = 0; i < 205; i++) flow.saveDiagnostic({ ...diagnostic.finish('completed'), id: `d${i}`, startedAt: i + 2 })
  assert.equal(handlers.get('ai:diagnostics:list')({}).length, 200)
  handlers.get('ai:diagnostics:clear')({}); assert.equal(handlers.get('ai:diagnostics:list')({}).length, 0)
  const closing = flow.beginAgentRun(3, 'close', 'c'); flow.cancelAgentOwner(3)
  assert.equal(flow.getAgentRun(closing.id).status, 'cancelled')
  // 渲染层竞态：慢返回的列表不能覆盖较新的终止事件，也不能撤销清空。
  modules.pinia = { defineStore: (_id, factory) => factory }
  modules.vue = { ref: value => ({ value }) }
  let resolveList
  const ui = load('src/stores/ai-workflow.ts', { window: { lk: {
    aiDiagnosticsList: () => new Promise(resolve => resolveList = resolve), agentRunsList: async () => [], aiDiagnosticsClear: async () => true
  } } }).useAiWorkflowStore()
  const refresh = ui.refresh('c')
  ui.capture({ diagnostic: { ...diagnostic.finish('completed'), conversationId: 'c', id: 'new' } })
  resolveList([{ ...diagnostic.finish('completed'), conversationId: 'c', id: 'old' }]); await refresh
  assert.equal(ui.diagnostics.value[0].id, 'new')
  const oldRead = ui.refresh('c'); await ui.clearDiagnostics()
  resolveList([{ ...diagnostic.finish('completed'), conversationId: 'c', id: 'old' }]); await oldRead
  assert.equal(ui.diagnostics.value.length, 0)
  assert.ok(writes > 0); db.close()
  console.log('AI workflow: timings, unknown usage, budget, confirmation, retry, no replay, reject, owner, restart, retention and clear PASS')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
