const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), init = require('sql.js')
const { randomUUID } = require('node:crypto')
async function main() {
  const SQL = await init(); let db = new SQL.Database()
  db.exec(fs.readFileSync('electron/main/db.ts', 'utf8').match(/const SCHEMA = `([\s\S]*?)`/)[1])
  for (const table of ['notes', 'knowledge_points']) db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at INTEGER`)
  function qAll(database, sql, params = []) { const s = database.prepare(sql), rows = []; try { s.bind(params); while (s.step()) rows.push(s.getAsObject()); return rows } finally { s.free() } }
  const qOne = (database, sql, params) => qAll(database, sql, params)[0]
  const modules = { electron: {}, './db': { getDb: () => db, qAll, qOne, qRun: (database, sql, params = []) => database.run(sql, params), uuid: randomUUID, schedulePersist() {} }, './ipc-helpers': {}, './srs': {} }
  function load(file, extra = {}) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => modules[name] || require(name), console, Date, Error, setTimeout, clearTimeout, ...extra }); return exports }
  modules['../shared/tools'] = load('electron/shared/tools.ts')
  modules['../shared/knowledge-graph'] = load('electron/shared/knowledge-graph.ts')
  modules['./knowledge-point-policy'] = load('electron/main/knowledge-point-policy.ts')
  modules['./ai-diagram'] = load('electron/main/ai-diagram.ts')
  modules['./learning-artifacts'] = load('electron/main/learning-artifacts.ts')
  const tools = load('electron/main/tool-service.ts'), graph = load('electron/main/knowledge-graph.ts')
  const makeNote = title => {
    const proposal = tools.requestInternalTool('create_note', { title, body: '来源证据。追加后的证据。' })
    const result = tools.approveOperation(proposal.operationId)
    assert.equal(result.status, 'applied')
    return { op: proposal.operationId, id: result.affected[0].split(':')[1] }
  }
  const n = makeNote('图谱来源')
  const a = graph.graphNodeSave({ title: '引用A', description: '', noteId: n.id, evidence: '来源证据', version: graph.graphList().version })
  const b = graph.graphNodeSave({ title: '引用B', description: '', version: graph.graphList().version })
  const blocked = () => {
    const result = tools.undoOperation(n.op); assert.equal(result.status, 'failed'); assert.ok(result.error)
    assert.equal(qOne(db, 'SELECT status FROM tool_operations WHERE id=?', [n.op]).status, 'applied')
    assert.ok(qOne(db, 'SELECT id FROM notes WHERE id=?', [n.id])); return result
  }
  assert.match(blocked().error, /图谱/)
  assert.equal(graph.graphList().sources.length, 1)
  db.run('DELETE FROM graph_sources WHERE note_id=?', [n.id])
  const edge = graph.graphEdgeSave({ from: a, to: b, relation: 'contains', noteId: n.id, evidence: '来源证据', version: graph.graphList().version })
  assert.match(blocked().error, /图谱/); graph.graphEdgeRemove(edge, graph.graphList().version)
  db.run("INSERT INTO links(id,source_type,source_id,target_type,target_id,link_type) VALUES('link','note',?,'note','other','references')", [n.id])
  assert.match(blocked().error, /链接/); db.run("DELETE FROM links WHERE id='link'")
  db.run("INSERT INTO notes(id,title,parent_id) VALUES('child','后来的子条目',?)", [n.id])
  assert.match(blocked().error, /子条目/); db.run("DELETE FROM notes WHERE id='child'")
  db.run("INSERT INTO content_blocks(id,source_type,source_id,block_type,text) VALUES('anchor','note',?,'note_anchor','定位')", [n.id])
  assert.match(blocked().error, /锚点/); db.run("DELETE FROM content_blocks WHERE id='anchor'")
  db.run("INSERT INTO content_blocks(id,source_type,source_id,text) VALUES('block','note',?,'索引')", [n.id])
  db.run("INSERT INTO links(id,source_type,source_id,target_type,target_id,link_type) VALUES('block-link','block','block','note','other','references')")
  assert.match(blocked().error, /内容块引用/); db.run("DELETE FROM links WHERE id='block-link'")
  assert.match(blocked().error, /内容块引用/); assert.ok(qOne(db, "SELECT id FROM content_blocks WHERE id='block'"))
  db.run("DELETE FROM content_blocks WHERE id='block'")
  db.run("INSERT INTO entity_attributes(id,entity_type,entity_id,attr_key,attr_value) VALUES('attribute','note',?,'状态','复习')", [n.id])
  assert.match(blocked().error, /自定义属性/); assert.ok(qOne(db, "SELECT id FROM entity_attributes WHERE id='attribute'")); db.run("DELETE FROM entity_attributes WHERE id='attribute'")
  db.run("INSERT INTO note_versions(id,note_id,title,body) VALUES('version',?,'保存版本','版本内容')", [n.id])
  assert.match(blocked().error, /历史版本/); assert.ok(qOne(db, "SELECT id FROM note_versions WHERE id='version'")); db.run("DELETE FROM note_versions WHERE id='version'")
  assert.equal(tools.undoOperation(n.op).status, 'undone')
  assert.equal(qOne(db, "SELECT id FROM content_blocks WHERE id='block'"), undefined)
  // 追加撤销同样不能抹掉后来引用的证据。
  const appendedNote = makeNote('追加保护')
  const append = tools.requestInternalTool('append_note', { noteId: appendedNote.id, text: '新追加证据' })
  tools.approveOperation(append.operationId)
  graph.graphNodeSave({ title: '追加知识', description: '', noteId: appendedNote.id, evidence: '新追加证据', version: graph.graphList().version })
  assert.equal(tools.undoOperation(append.operationId).status, 'failed')
  assert.match(qOne(db, 'SELECT body FROM notes WHERE id=?', [appendedNote.id]).body, /新追加证据/)
  // 两个提案可同时预览，确认时重新校验（Unicode 大小写/两端空格）。
  const kp1 = tools.requestInternalTool('create_knowledge_point', { title: ' ÉCLAIR ' })
  const kp2 = tools.requestMcpTool('create_knowledge_point', { title: 'éclair' })
  assert.equal(kp1.status, 'pending_confirmation'); assert.equal(kp2.status, 'pending_confirmation')
  assert.equal(tools.approveOperation(kp1.operationId).status, 'applied')
  assert.equal(tools.approveOperation(kp2.operationId).status, 'failed')
  assert.equal(tools.requestInternalTool('create_knowledge_point', { title: 'éclair' }).status, 'failed')
  assert.throws(() => graph.graphNodeSave({ title: 'éclair', description: '', version: graph.graphList().version }), /同名/)
  const handlers = {}; load('electron/main/prd-v3.ts').registerPrdV3Ipcs({ handle: (name, handler) => handlers[name] = handler })
  assert.throws(() => handlers['kp:upsert']({}, { title: 'éclair' }), /同名/)
  const first = qOne(db, "SELECT id FROM knowledge_points WHERE title='ÉCLAIR'")
  handlers['kp:upsert']({}, { id: first.id, title: ' ÉCLAIR ' })
  db.run('UPDATE knowledge_points SET deleted_at=1 WHERE id=?', [first.id])
  assert.equal(tools.requestInternalTool('create_knowledge_point', { title: 'éclair' }).status, 'pending_confirmation')
  // 40+ 待确认不影响历史；确定性次排序保证同秒翻页无重叠。
  for (let i = 0; i < 50; i++) tools.requestMcpTool('create_note', { title: `待确认${i}`, body: '数据' })
  for (let i = 0; i < 15; i++) makeNote(`历史${i}`)
  const historyCount = qOne(db, "SELECT COUNT(*) n FROM tool_operations WHERE status<>'pending_confirmation'").n
  const one = tools.toolCenterSnapshot(), two = tools.toolCenterSnapshot({ historyPage: 2 })
  assert.equal(one.pending.items.length, 12); assert.ok(one.pending.total >= 50)
  assert.equal(one.history.total, historyCount); assert.equal(one.history.items.length, 12)
  assert.ok(one.history.items.every(row => row.status !== 'pending_confirmation'))
  assert.ok(two.history.items.every(row => !one.history.items.some(item => item.id === row.id)))
  assert.equal(tools.toolCenterSnapshot({ historyPage: 999 }).history.page, Math.ceil(historyCount / 12))
  assert.ok(tools.toolCenterSnapshot({ source: 'mcp', status: 'failed' }).history.items.every(row => row.source === 'mcp' && row.status === 'failed'))
  assert.throws(() => tools.toolCenterSnapshot({ historyPage: NaN }), /页码/)
  assert.throws(() => tools.toolCenterSnapshot({ status: 'pending_confirmation' }), /状态/)
  assert.ok(!JSON.stringify(one).includes('snapshots_json'))
  const bytes = db.export(); db.close(); db = new SQL.Database(bytes)
  assert.equal(tools.toolCenterSnapshot().history.total, historyCount)
  assert.equal(tools.undoOperation(append.operationId).status, 'failed')
  db.close()

  // 控制 IPC 返回顺序，测试 store 实际代码，而不是复制一份序号逻辑。
  modules.pinia = { defineStore: (_id, factory) => factory }; modules.vue = { ref: value => ({ value }) }
  const pending = [], api = {}, deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return { promise, resolve, reject } }
  api.mcpStatus = () => { const d = deferred(); pending.push(d); return d.promise }
  api.mcpConfigure = () => { const d = deferred(); pending.push(d); return d.promise }
  const mcp = load('src/stores/mcp.ts', { window: { lk: api } }).useMcpStore()
  const old = mcp.refresh(), recent = mcp.refresh()
  pending[1].resolve({ enabled:false,running:false,pending:0,error:null }); await recent
  pending[0].resolve({ enabled:true,running:true,pending:0,error:null }); await old
  assert.equal(mcp.status.value.running, false)
  const beforeEvent = mcp.refresh(); mcp.capture({ enabled:false,running:false,pending:2,error:null })
  pending[2].resolve({enabled:true,running:true,pending:0,error:null}); await beforeEvent
  assert.equal(mcp.status.value.running, false); assert.equal(mcp.status.value.pending, 2)
  const beforeConfig = mcp.refresh(), config = mcp.configure(false)
  const ignored = mcp.configure(true); await ignored; assert.equal(pending.length, 5)
  pending[4].resolve({enabled:false,running:false,pending:0,error:null}); await config
  pending[3].resolve({enabled:true,running:true,pending:0,error:null}); await beforeConfig
  assert.equal(mcp.status.value.running, false)
  const staleFailure = mcp.refresh(); mcp.capture({enabled:true,running:true,pending:0,error:null})
  pending[5].reject(new Error('旧读取失败')); await staleFailure; assert.equal(mcp.error.value, '')
  modules['./mcp'] = { useMcpStore: () => ({ refresh: async () => {} }) }
  const reads = []; api.toolCenter = () => { const d = deferred(); reads.push(d); return d.promise }
  const center = load('src/stores/tool-center.ts', { window: { lk: api } }).useToolCenterStore()
  const readOld = center.refresh(), readNew = center.refresh()
  reads[1].resolve(two); await readNew; reads[0].resolve(one); await readOld
  assert.equal(center.snapshot.value.history.page, 2)
  const preEvent = center.refresh(); center.scheduleRefresh(); center.scheduleRefresh()
  reads[2].resolve(one); await preEvent
  assert.equal(center.snapshot.value.history.page, 2)
  await new Promise(resolve => setTimeout(resolve, 110)); assert.equal(reads.length, 4)
  reads[3].resolve(two); await Promise.resolve(); await Promise.resolve()
  let calls = 0; const action = deferred()
  api.toolUndo = () => { calls++; return action.promise }
  const undo = center.decide(['x'], 'undo'); await center.decide(['x'], 'undo'); assert.equal(calls, 1)
  action.resolve({status:'failed',error:'图谱来源保护'}); await Promise.resolve(); await Promise.resolve()
  reads[4].resolve(two); await undo
  assert.equal(center.actionError.value, '图谱来源保护'); assert.equal(center.busy.value, false)
  const failedRead = center.refresh(); reads[5].reject(new Error('读取失败')); await failedRead
  assert.equal(center.loadError.value, '读取失败'); assert.equal(center.actionError.value, '图谱来源保护')
  console.log('Tool center: reference-safe undo, title policy, queue/history pagination, restart, compact rows, stale responses, event coalescing, busy guard and visible failures PASS')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
