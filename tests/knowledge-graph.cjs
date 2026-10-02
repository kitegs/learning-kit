const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const init = require('sql.js')
const { randomUUID } = require('node:crypto')
async function main() {
  const SQL = await init()
  let db = new SQL.Database(), writes = 0, failEdge = false
  const schema = fs.readFileSync('electron/main/db.ts', 'utf8').match(/const SCHEMA = `([\s\S]*?)`/)[1]
  db.exec(schema); db.exec(schema)
  for (const table of ['notes', 'knowledge_points']) db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at INTEGER`)
  function qAll(database, sql, params = []) { const stmt = database.prepare(sql), rows = []; try { stmt.bind(params); while (stmt.step()) rows.push(stmt.getAsObject()); return rows } finally { stmt.free() } }
  const qOne = (database, sql, params) => qAll(database, sql, params)[0]
  const bridge = { getDb: () => db, qAll, qOne, qRun: (database, sql, params = []) => { if (failEdge && sql.startsWith('INSERT INTO graph_edges')) throw Error('injected write failure'); database.run(sql, params) }, uuid: randomUUID, schedulePersist: () => writes++ }
  const modules = { './db': bridge, electron: {} }
  function load(file) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => modules[name] || require(name), console, Date }); return exports }
  modules['../shared/knowledge-graph'] = load('electron/shared/knowledge-graph.ts')
  modules['./knowledge-point-policy'] = load('electron/main/knowledge-point-policy.ts')
  const graph = load('electron/main/knowledge-graph.ts')
  const count = table => qOne(db, `SELECT COUNT(*) n FROM ${table}`).n
  db.run("INSERT INTO notes(id,title,body,kind) VALUES('n','关系笔记','函数是闭包的前置知识。闭包保留词法环境。','note')")
  const draft = { nodes: [{ key: 'a', title: '函数', description: '函数说明', evidence: '函数是闭包的前置知识' }, { key: 'b', title: '闭包', description: '闭包说明', evidence: '闭包保留词法环境' }], edges: [{ from: 'a', to: 'b', relation: 'prerequisite', evidence: '函数是闭包的前置知识' }] }
  const preview = (value = draft, owner = 1) => graph.graphPreview('n', graph.graphNote('n').revision, JSON.stringify(value), owner)
  const p = preview()
  assert.equal(count('knowledge_points'), 0); assert.equal(count('graph_edges'), 0); assert.equal(writes, 0)
  assert.throws(() => graph.graphApply(p.token, 2), /过期|处理/)
  graph.graphApply(p.token, 1)
  assert.equal(count('knowledge_points'), 2); assert.equal(count('graph_edges'), 1); assert.equal(count('graph_sources'), 2)
  assert.throws(() => graph.graphApply(p.token, 1), /过期|处理/)
  const reused = preview(); assert.equal(reused.reused.length, 2); graph.graphApply(reused.token, 1)
  assert.equal(count('knowledge_points'), 2); assert.equal(count('graph_edges'), 1)
  assert.equal(graph.retrieveGraph('如何理解闭包')[0].id, 'n')
  assert.match(graph.retrieveGraph('如何理解闭包')[0].path, /前置知识/)
  assert.equal(graph.retrieveGraph('不存在的概念').length, 0)
  const badEvidence = structuredClone(draft); badEvidence.nodes[0].evidence = '伪造原文'
  assert.throws(() => preview(badEvidence), /连续原文/)
  const badEndpoint = structuredClone(draft); badEndpoint.edges[0].to = 'missing'
  assert.throws(() => preview(badEndpoint), /端点/)
  const badRelation = structuredClone(draft); badRelation.edges[0].relation = '__proto__'
  assert.throws(() => preview(badRelation), /关系/)
  const self = structuredClone(draft); self.edges[0].to = 'a'; assert.throws(() => preview(self), /自连接/)
  const stale = preview(); db.run("UPDATE notes SET body=body || '更新' WHERE id='n'")
  assert.throws(() => graph.graphApply(stale.token, 1), /笔记已改变/)
  assert.equal(graph.retrieveGraph('闭包').length, 0)
  assert.ok(graph.graphList().sources.every(s => s.stale))
  graph.graphApply(preview().token, 1)
  const data = graph.graphList(), a = data.nodes.find(n => n.title === '函数').id, b = data.nodes.find(n => n.title === '闭包').id
  const pending = preview()
  const manual = graph.graphEdgeSave({ from: b, to: a, relation: 'contrasts', version: data.version })
  assert.throws(() => graph.graphApply(pending.token, 1), /图谱已改变/)
  assert.throws(() => graph.graphEdgeSave({ from: b, to: a, relation: 'contrasts', version: graph.graphList().version }), /已存在/)
  graph.graphEdgeRemove(manual, graph.graphList().version)
  const before = count('knowledge_points'), rollback = structuredClone(draft)
  rollback.nodes[0].title = '新函数'; rollback.nodes[1].title = '新闭包'
  const r = preview(rollback); failEdge = true
  assert.throws(() => graph.graphApply(r.token, 1), /injected/); failEdge = false
  assert.equal(count('knowledge_points'), before, 'failed transaction must rollback new nodes')
  const bytes = db.export(); db.close(); db = new SQL.Database(bytes)
  assert.equal(graph.graphList().nodes.length, 2); assert.equal(graph.retrieveGraph('闭包').length, 1)
  db.run("UPDATE notes SET deleted_at=1 WHERE id='n'")
  assert.equal(graph.retrieveGraph('闭包').length, 0)
  assert.throws(() => graph.graphNote('n'), /删除/)
  db.run('UPDATE knowledge_points SET deleted_at=1 WHERE id=?', [a])
  assert.equal(graph.graphList().edges.length, 0)
  assert.ok(writes > 0)
  // One-hop expansion retrieves a neighbour's separate source, never a second-hop source.
  db.run("INSERT INTO notes(id,title,body,kind) VALUES('n2','邻居来源','乙概念原文','note'),('n3','二跳来源','丙概念原文','note')")
  const seed = graph.graphNodeSave({ title: '甲概念', description: '', version: graph.graphList().version })
  const neighbour = graph.graphNodeSave({ title: '乙概念', description: '', noteId: 'n2', evidence: '乙概念原文', version: graph.graphList().version })
  const distant = graph.graphNodeSave({ title: '丙概念', description: '', noteId: 'n3', evidence: '丙概念原文', version: graph.graphList().version })
  graph.graphEdgeSave({ from: seed, to: neighbour, relation: 'contains', version: graph.graphList().version })
  graph.graphEdgeSave({ from: neighbour, to: distant, relation: 'contains', version: graph.graphList().version })
  const expanded = graph.retrieveGraph('解释甲概念')
  assert.equal(expanded.length, 1); assert.equal(expanded[0].id, 'n2'); assert.match(expanded[0].path, /甲概念.*乙概念/)
  db.close()
  console.log('Knowledge graph: preview/confirmation, ownership, provenance, dedupe, stale checks, rollback, soft delete, retrieval and restart PASS')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
