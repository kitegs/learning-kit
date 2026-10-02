const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const init = require('sql.js')
const { randomUUID } = require('node:crypto')

async function main() {
  const SQL = await init()
  let db = new SQL.Database()
  const schema = fs.readFileSync('electron/main/db.ts', 'utf8').match(/const SCHEMA = `([\s\S]*?)`/)[1]
  db.exec(schema)
  function qOne(database, sql, params = []) { const s = database.prepare(sql); try { s.bind(params); return s.step() ? s.getAsObject() : undefined } finally { s.free() } }
  function qAll(database, sql, params = []) { const s = database.prepare(sql); const rows = []; try { s.bind(params); while (s.step()) rows.push(s.getAsObject()); return rows } finally { s.free() } }
  const bridge = { getDb: () => db, qOne, qAll, qRun: (database, sql, params = []) => database.run(sql, params), uuid: randomUUID, schedulePersist() {} }
  const modules = { electron: {}, './db': bridge, './ipc-helpers': {} }
  function load(file) {
    const exports = {}
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => modules[name] || require(name), console, Date })
    return exports
  }
  modules['./srs'] = load('electron/main/srs.ts')
  modules['./ai-diagram'] = load('electron/main/ai-diagram.ts')
  modules['../shared/tools'] = load('electron/shared/tools.ts')
  modules['../shared/knowledge-graph'] = load('electron/shared/knowledge-graph.ts')
  modules['./knowledge-point-policy'] = load('electron/main/knowledge-point-policy.ts')
  db.exec('ALTER TABLE knowledge_points ADD COLUMN deleted_at INTEGER')
  modules['./learning-artifacts'] = load('electron/main/learning-artifacts.ts')
  const tools = load('electron/main/tool-service.ts')
  const proposal = tools.requestInternalTool('create_flashcard', { question: '2+2?', answer: '4' })
  assert.equal(proposal.status, 'pending_confirmation')
  assert.equal(qOne(db, 'SELECT COUNT(*) n FROM cards').n, 0)
  const saved = db.export(); db.close(); db = new SQL.Database(saved)
  const applied = tools.approveOperation(proposal.operationId)
  assert.equal(applied.status, 'applied', applied.error)
  assert.equal(qOne(db, 'SELECT COUNT(*) n FROM cards').n, 1)
  assert.equal(qOne(db, 'SELECT algorithm FROM card_scheduling').algorithm, 'fsrs')
  assert.equal(tools.approveOperation(proposal.operationId).status, 'failed')
  assert.equal(tools.undoOperation(proposal.operationId).status, 'undone')
  assert.equal(qOne(db, 'SELECT COUNT(*) n FROM cards').n, 0)
  assert.equal(qOne(db, 'SELECT COUNT(*) n FROM card_scheduling').n, 0)
  const changed = tools.requestInternalTool('create_flashcard', { question: 'q', answer: 'a' })
  tools.approveOperation(changed.operationId)
  db.run("UPDATE cards SET back='edited'")
  assert.equal(tools.undoOperation(changed.operationId).status, 'failed')
  assert.equal(tools.requestInternalTool('create_flashcard', { question: 'q', answer: '' }).status, 'failed')
  assert.equal(tools.requestInternalTool('create_flashcard_from_error', { questionId: 'missing' }).status, 'failed')
  db.run("INSERT INTO exercise_sets(id,title,source_json) VALUES('s','set','[]')")
  db.run(`INSERT INTO exercise_questions(id,set_id,type,prompt,answer_json) VALUES('q','s','qa','question','"answer"')`)
  db.run("INSERT INTO exercise_attempts(id,question_id,correct) VALUES('a','q',0)")
  const errorCard = tools.requestInternalTool('create_flashcard_from_error', { questionId: 'q', question: 'forged', answer: 'forged' })
  assert.equal(errorCard.status, 'pending_confirmation')
  assert.ok(errorCard.preview.includes('question'))
  assert.ok(!errorCard.preview.includes('forged'))
  assert.equal(tools.approveOperation(errorCard.operationId).status, 'applied')
  const outdated = tools.requestInternalTool('create_flashcard_from_error', { questionId: 'q' })
  db.run("UPDATE exercise_questions SET prompt='changed' WHERE id='q'")
  assert.equal(tools.approveOperation(outdated.operationId).status, 'failed')
  for (const [action, table, params] of [
    ['create_knowledge_point', 'knowledge_points', { title: '闭包', description: '未核实来源' }],
    ['create_diagram', 'diagrams', { title: 'Graph', xml: '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" parent="1" vertex="1" value="节点"><mxGeometry x="0" y="0" width="100" height="60" as="geometry"/></mxCell></root></mxGraphModel>' }],
    ['create_mindmap', 'mindmaps', { title: 'Map', body: '# Map\n- one' }],
    ['create_plan', 'study_plans', { title: 'Plan', plan: { goal: 'Learn', weeks: [{ week: 1, tasks: ['Read'] }] } }],
    ['create_conversation', 'conversations', { title: 'Chat' }],
    ['create_exercise_set', 'exercise_sets', { title: 'Exercises', questions: [{ prompt: 'Q', answer: 'A' }] }]
  ]) {
    const count = qOne(db, `SELECT COUNT(*) n FROM ${table}`).n
    const pending = tools.requestInternalTool(action, params)
    assert.equal(pending.status, 'pending_confirmation', pending.error)
    assert.equal(qOne(db, `SELECT COUNT(*) n FROM ${table}`).n, count)
    const applied = tools.approveOperation(pending.operationId)
    assert.equal(applied.status, 'applied', applied.error)
    const bytes = db.export(); db.close(); db = new SQL.Database(bytes)
    assert.equal(qOne(db, `SELECT COUNT(*) n FROM ${table}`).n, count + 1)
    assert.equal(tools.undoOperation(pending.operationId).status, 'undone')
    assert.equal(qOne(db, `SELECT COUNT(*) n FROM ${table}`).n, count)
  }
  const exercises = tools.requestInternalTool('create_exercise_set', { title: 'Attempted', questions: [{ prompt: 'Q', answer: 'A' }] })
  const kp = tools.requestInternalTool('create_knowledge_point', { title: '待编辑' })
  const kpApplied = tools.approveOperation(kp.operationId)
  const kpId = kpApplied.affected[0].split(':')[1]
  assert.equal(qOne(db, 'SELECT mastery FROM knowledge_points WHERE id=?', [kpId]).mastery, 'unseen')
  db.run('INSERT INTO code_snippets(id,code,kp_id) VALUES(?,?,?)', ['linked-code', 'x', kpId])
  assert.equal(tools.undoOperation(kp.operationId).status, 'failed')
  const rejected = tools.requestInternalTool('create_knowledge_point', { title: '拒绝条目' })
  assert.equal(tools.rejectOperation(rejected.operationId).status, 'rejected')
  assert.equal(qOne(db, 'SELECT id FROM knowledge_points WHERE title=?', ['拒绝条目']), undefined)
  assert.equal(tools.requestInternalTool('create_diagram', { title: 'Bad', xml: '<broken>' }).status, 'failed')
  const validXml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" vertex="1" parent="1" value="A"><mxGeometry width="100" height="60" as="geometry"/></mxCell></root></mxGraphModel>'
  const validate = modules['./ai-diagram'].validateDiagram
  assert.equal(validate(`<mxfile><diagram id="page">${validXml}</diagram></mxfile>`).nodes, 1)
  for (const xml of [validXml.replace('value="A"', 'value="&lt;img src=x&gt;"'), validXml.replace('value="A"', 'style="image=https://example.com/x"'), '<!DOCTYPE x>' + validXml, validXml.replace('id="2"', 'id="1"'), validXml.replace('parent="1" value=', 'parent="2" value='), validXml.slice(0, -5), '<mxfile><diagram>compressed</diagram></mxfile>']) assert.throws(() => validate(xml))
  const diagram = tools.requestInternalTool('create_diagram', { title: '待编辑图', xml: validXml })
  const diagramId = tools.approveOperation(diagram.operationId).affected[0].split(':')[1]
  db.run('UPDATE diagrams SET xml=? WHERE id=?', [validXml.replace('value="A"', 'value="已编辑"'), diagramId])
  assert.equal(tools.undoOperation(diagram.operationId).status, 'failed')
  const exerciseApplied = tools.approveOperation(exercises.operationId)
  const setId = exerciseApplied.affected[0].split(':')[1]
  const question = qOne(db, 'SELECT id FROM exercise_questions WHERE set_id=?', [setId])
  db.run('INSERT INTO exercise_attempts(id,question_id,correct) VALUES(?,?,?)', [randomUUID(), question.id, 1])
  assert.equal(tools.undoOperation(exercises.operationId).status, 'failed')
  assert.equal(tools.requestInternalTool('create_plan', { title: 'bad', plan: { goal: 'x', weeks: [] } }).status, 'failed')
  assert.equal(tools.requestInternalTool('create_exercise_set', { title: 'empty' }).status, 'failed')
  db.close()
  console.log('AI flashcards: confirmation, persistence, FSRS, undo, conflicts and incorrect-question validation PASS')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
