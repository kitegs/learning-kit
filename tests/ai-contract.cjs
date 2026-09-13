const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')

const ai = readFileSync('electron/main/ai.ts', 'utf8')
const preload = readFileSync('electron/preload/index.ts', 'utf8')
const env = readFileSync('src/env.d.ts', 'utf8')
const store = readFileSync('src/stores/chat.ts', 'utf8')
const settings = readFileSync('src/views/SettingsDialog.vue', 'utf8')
const app = readFileSync('src/App.vue', 'utf8')
const notebook = readFileSync('src/components/NotebookAiPanel.vue', 'utf8')
const review = readFileSync('src/views/ReviewView.vue', 'utf8')

assert.match(ai, /export interface AiChatStartArgs/)
assert.match(ai, /export interface AiChunkPayload/)
assert.match(ai, /function composeSystemPrompt\(customSystemPrompt\?: string\)/)
assert.match(ai, /# User custom instructions/)
assert.match(ai, /composeSystemPrompt\(customPrompt\)/)
assert.match(ai, /resolveConversationPrompt\(parseConversationPrompt/)
assert.match(app, /conversationId: requestConvId/)
assert.doesNotMatch(preload, /aiChatStart: \(args: any\)/)
assert.doesNotMatch(env, /aiChatStart: \(a: any\)/)
assert.doesNotMatch(env, /onAiChunk: \(r: string, cb: \(p: any\)/)

for (const key of [
  'customSystemPrompt',
  'customSystemPromptEnabled',
  'aiIncludeHistory',
  'aiIncludeNoteContext',
  'aiIncludeProgressContext',
  'aiToolProposalsEnabled'
]) {
  assert.match(store, new RegExp(`setSetting\\('${key}'`), `${key} must be persisted`)
  assert.match(settings, new RegExp(key), `${key} must be configurable`)
}

assert.match(app, /settings\.aiIncludeHistory/)
assert.match(app, /settings\.aiToolProposalsEnabled/)
assert.match(notebook, /settings\.aiIncludeNoteContext/)
assert.match(review, /settings\.aiIncludeProgressContext/)
for (const source of [app, notebook, review]) {
  assert.match(source, /customSystemPrompt:/)
  assert.match(source, /aiChatAbort/)
}

console.log('AI settings, prompt, and request lifecycle contract: PASS')
