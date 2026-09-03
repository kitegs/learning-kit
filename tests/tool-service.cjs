const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const servicePath = path.join(__dirname, '..', 'electron', 'main', 'tool-service.ts')
assert.ok(fs.existsSync(servicePath), 'tool-service.ts must export the tool confirmation policy')

const source = fs.readFileSync(servicePath, 'utf8')
const match = source.match(/export function requiresConfirmation\([^)]*\): boolean \{([\s\S]*?)\n\}/)
assert.ok(match, 'requiresConfirmation must be an exported boolean policy helper')

// The policy helper is deliberately dependency-free. Evaluating its source keeps this
// test runnable in Node without loading Electron or sql.js.
const requiresConfirmation = new Function('request', match[1])

assert.equal(requiresConfirmation({ source: 'internal-ai', action: 'create_note' }), true)
assert.equal(requiresConfirmation({ source: 'mcp', action: 'append_note' }), false)
assert.equal(requiresConfirmation({ source: 'mcp', action: 'replace_note' }), true)
assert.equal(requiresConfirmation({ source: 'renderer', action: 'delete' }), true)

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

const stateMatch = source.match(/export function notePostStateMatches\([^)]*\): boolean \{\n  ([^\n]+)\n\}/)
assert.ok(stateMatch, 'undo must expose its dependency-free post-state comparison')
const notePostStateMatches = new Function('expected', 'current', stateMatch[1])
const postWrite = { id: 'note-1', title: '题目', body: '原内容\n\n追加内容', parent_id: null, sort: 1, tags: null, kind: 'note', favorite: 0, created_at: '2026-08-24 10:00:00', updated_at: '2026-08-24 10:00:00', deleted_at: null }
assert.equal(notePostStateMatches(postWrite, { ...postWrite, body: '同一秒的手动修改' }), false, 'a same-timestamp manual edit must block undo')
assert.equal(notePostStateMatches(postWrite, { ...postWrite }), true)

console.log('tool-service policy: PASS')
