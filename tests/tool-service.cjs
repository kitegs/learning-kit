const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const servicePath = path.join(__dirname, '..', 'electron', 'main', 'tool-service.ts')
assert.ok(fs.existsSync(servicePath), 'tool-service.ts must export the tool confirmation policy')

const source = fs.readFileSync(servicePath, 'utf8')

// Load the shared pure registry, without Electron or sql.js, to exercise the real policy.
const vm = require('node:vm'), ts = require('typescript'), registry = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../electron/shared/tools.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports:registry})

// Parse declarations rather than matching source formatting. This handles Windows
// CRLF, comments and multiline bodies while still executing the actual helpers.
function loadPolicyHelpers(text) {
  const parsed = ts.createSourceFile(servicePath, text, ts.ScriptTarget.Latest, true)
  const declarations = ['requiresConfirmation', 'notePostStateMatches'].map(name => {
    const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
    assert.ok(declaration?.body, `${name} must be a function with a body`)
    assert.ok(ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export, `${name} must remain exported`)
    return declaration.getText(parsed)
  })
  const exports = {}
  const compiled = ts.transpileModule(declarations.join('\n'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(compiled, { exports, toolDefinitions: registry.toolDefinitions })
  return exports
}

const { requiresConfirmation, notePostStateMatches } = loadPolicyHelpers(source)
const confirmation = request => requiresConfirmation(request, registry.toolDefinitions)

assert.equal(confirmation({ source: 'internal-ai', action: 'create_note' }), true)
assert.equal(confirmation({ source: 'mcp', action: 'append_note' }), true)
assert.equal(confirmation({ source: 'mcp', action: 'replace_note' }), true)
assert.equal(confirmation({ source: 'renderer', action: 'delete' }), true)
assert.equal(confirmation({ source: 'mcp', action: 'create_diagram' }), true)
assert.equal(confirmation({ source: 'renderer', action: 'create_knowledge_point' }), true)
assert.equal(confirmation({ source: 'renderer', action: 'create_note' }), false)
assert.equal(confirmation({ source: 'renderer', action: '__proto__' }), true)

assert.match(source, /export function requestInternalTool\(/, 'internal proposals must bind their source in main')
assert.match(source, /export function requestMcpTool\(/, 'MCP requests must bind their source in main')
assert.match(source, /export function approveOperation\(/, 'pending requests must approve their original operation')
assert.match(source, /export function rejectOperation\(/, 'pending requests must be rejectable')
assert.match(source, /mcp_pending_requests SET status=.*approved/, 'MCP approval must resolve the pending record')
assert.match(source, /mcp_pending_requests SET status=.*rejected/, 'MCP rejection must resolve the pending record')
assert.match(source, /BEGIN TRANSACTION/, 'tool mutations must be transactional')
assert.match(source, /COMMIT/, 'tool mutations must commit atomically')
assert.match(source, /ROLLBACK/, 'tool mutations must roll back on failure')
assert.doesNotMatch(source, /afterUpdatedAt|afterCreatedAt/, 'undo must not rely on second-resolution timestamps')
assert.match(source, /notePostStateMatches\(snapshot\.after, current\)/, 'undo must reject a same-timestamp note body conflict')
assert.match(source, /tool:propose-internal/, 'IPC must expose a source-bound internal proposal endpoint')
assert.match(source, /tool:approve/, 'IPC must expose approval by operation id')
assert.match(source, /tool:reject/, 'IPC must expose rejection by operation id')

const postWrite = { id: 'note-1', title: '题目', body: '原内容\n\n追加内容', parent_id: null, sort: 1, tags: null, kind: 'note', favorite: 0, created_at: '2026-08-24 10:00:00', updated_at: '2026-08-24 10:00:00', deleted_at: null }
assert.equal(notePostStateMatches(postWrite, { ...postWrite, body: '同一秒的手动修改' }), false, 'a same-timestamp manual edit must block undo')
assert.equal(notePostStateMatches(postWrite, { ...postWrite }), true)

// Reproduce CI line endings in memory; never rewrite the checked-out source.
for (const ending of ['\n', '\r\n']) {
  const variant = source.replace(/\r?\n/g, ending).replace(/ && /g, ` &&${ending}    `)
  const helpers = loadPolicyHelpers(variant)
  assert.equal(helpers.requiresConfirmation({ source: 'mcp', action: 'create_note' }), true)
  assert.equal(helpers.requiresConfirmation({ source: 'renderer', action: 'create_note' }), false)
  assert.equal(helpers.notePostStateMatches(postWrite, { ...postWrite }), true)
  assert.equal(helpers.notePostStateMatches(postWrite, { ...postWrite, body: '同一秒的手动修改' }), false)
  assert.equal(helpers.notePostStateMatches(postWrite, undefined), false)
}

console.log('tool-service policy (LF/CRLF/multiline): PASS')
