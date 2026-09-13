const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(filename, imports, extras = {}) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(output, { exports, require: name => imports[name] || require(name), console, TextDecoder, ...extras }, { filename })
  return exports
}

async function main() {
  const prompt = load('electron/shared/conversation-prompt.ts', {})
  assert.throws(() => prompt.parseConversationPrompt('{"mode":["custom"],"text":"x"}'))
  assert.throws(() => prompt.parseConversationPrompt('{"mode":"custom","text":" "}'))
  const tools = load('electron/main/tool-service.ts', {
    electron: {}, './ipc-helpers': {}, './srs': {}, './learning-artifacts': { isArtifact: () => false },
    './db': { getDb: () => { throw new Error('unsupported actions must not access storage') } }
  })
  const unsupported = tools.requestInternalTool('create_exercise_set', { title: 'test' })
  assert.equal(unsupported.status, 'failed')
  assert.equal(unsupported.operationId, '')
  assert.match(unsupported.error, /尚不支持/)
  const values = new Map([['apiKey.deepseek', 'fake-test-key'], ['temperature', '0']])
  const lk = {
    getSetting: async key => values.get(key) ?? null,
    setSetting: async (key, value) => { values.set(key, value); return true },
    allSettings: async () => [...values].map(([key, value]) => ({ key, value })),
    aiModels: async () => [], aiSystemPrompt: async () => 'built-in'
  }
  const stores = load('src/stores/chat.ts', {
    '../../electron/shared/conversation-prompt': prompt,
    pinia: { defineStore: (_, factory) => factory }, vue: { ref: value => ({ value }) }
  }, { window: { lk }, document: { documentElement: { setAttribute() {} } } })
  const settings = stores.useSettingsStore()
  await settings.load()
  assert.equal(settings.currentApiKey(), 'fake-test-key', 'stored key must survive reload')
  assert.equal(settings.temperature.value, 0, 'zero temperature must survive reload')
  settings.customSystemPrompt.value = 'Explain using TypeScript'
  settings.customSystemPromptEnabled.value = true
  settings.aiInputBudget.value = 4096
  settings.aiRetrievalEnabled.value = true
  for (const key of ['aiIncludeHistory', 'aiIncludeNoteContext', 'aiIncludeProgressContext', 'aiToolProposalsEnabled']) settings[key].value = false
  await settings.saveAll()
  const reloaded = stores.useSettingsStore()
  await reloaded.load()
  assert.equal(reloaded.customSystemPrompt.value, 'Explain using TypeScript')
  assert.equal(reloaded.customSystemPromptEnabled.value, true)
  assert.equal(reloaded.aiInputBudget.value, 4096)
  assert.equal(reloaded.aiRetrievalEnabled.value, true)
  for (const key of ['aiIncludeHistory', 'aiIncludeNoteContext', 'aiIncludeProgressContext', 'aiToolProposalsEnabled']) assert.equal(reloaded[key].value, false)

  const handlers = new Map(), events = [], requests = []
  const chat = stores.useChatStore()
  await chat.saveConversationPrompt('A', { mode: 'custom', text: 'Teach coding' })
  await chat.saveConversationPrompt('B', { mode: 'custom', text: 'Teach English' })
  assert.equal((await stores.useChatStore().loadConversationPrompt('A')).text, 'Teach coding')
  assert.equal((await chat.loadConversationPrompt('new')).mode, 'inherit')
  const sender = { send: (_, payload) => events.push(payload) }
  let cancelMode = false
  let retrievalCalls = 0
  const ai = load('electron/main/ai.ts', {
    '../shared/conversation-prompt': prompt,
    './db': { getDb: () => ({}), qOne: (_, sql, params) => values.has(params[0]) ? { value: values.get(params[0]) } : undefined },
    './ai-context': load('electron/main/ai-context.ts', {}),
    './ai-retrieval': { retrieveNotes: query => { retrievalCalls++; assert.equal(query, 'question'); return [{ id: 'n1', title: '测试来源', text: '参考文本' }] } },
    './ai-stream': load('electron/main/ai-stream.ts', {}),
    electron: { BrowserWindow: { fromWebContents: () => ({ webContents: sender }), getAllWindows: () => [] }, app: { getAppPath: () => process.cwd() } },
    fs: { existsSync: () => true, readFileSync: () => 'FILE OVERRIDE PROMPT' }
  }, {
    global: {}, process, AbortController, AbortSignal, TextDecoder, setTimeout, clearTimeout,
    fetch: async (_, options) => {
      requests.push(JSON.parse(options.body))
      if (cancelMode) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('stopped'), { name: 'AbortError' }))))
      return new Response('data: {"choices":[{"delta":{"content":"测试"}}]}\n\ndata: [DONE]\n\n')
    }
  })
  ai.registerAiIpcs({ handle: (channel, handler) => handlers.set(channel, handler) })
  const args = { requestId: 'one', provider: 'custom', model: 'test', apiKey: 'fake', messages: [{ role: 'user', content: 'question' }], customSystemPrompt: 'Explain using TypeScript' }
  assert.equal(await handlers.get('ai:chat:start')({ sender }, args), '测试')
  assert.ok(requests[0].messages[0].content.includes('FILE OVERRIDE PROMPT'))
  assert.ok(requests[0].messages[0].content.includes('Explain using TypeScript'))
  await handlers.get('ai:chat:start')({ sender }, { ...args, customSystemPrompt: undefined })
  assert.equal(requests[1].messages[0].content, 'FILE OVERRIDE PROMPT')
  assert.equal(retrievalCalls, 0, 'retrieval must default off')
  for (const [conversationId, expected] of [['A', 'Teach coding'], ['B', 'Teach English'], ['new', 'Explain using TypeScript']]) {
    await handlers.get('ai:chat:start')({ sender }, { ...args, conversationId })
    assert.ok(requests.at(-1).messages[0].content.includes(expected))
    if (conversationId !== 'new') assert.ok(!requests.at(-1).messages[0].content.includes('Explain using TypeScript'))
  }
  await handlers.get('ai:chat:start')({ sender }, { ...args, conversationId: 'A', customSystemPrompt: undefined })
  assert.ok(requests.at(-1).messages[0].content.includes('Teach coding'))
  await chat.saveConversationPrompt('B', { mode: 'none', text: 'Teach English' })
  await handlers.get('ai:chat:start')({ sender }, { ...args, conversationId: 'B' })
  assert.equal(requests.at(-1).messages[0].content, 'FILE OVERRIDE PROMPT')
  values.set(prompt.conversationPromptKey('bad'), 'broken json')
  const beforeBadPrompt = requests.length
  assert.equal(await handlers.get('ai:chat:start')({ sender }, { ...args, conversationId: 'bad' }), false)
  assert.equal(requests.length, beforeBadPrompt)
  await handlers.get('ai:chat:start')({ sender }, { ...args, retrieveNotes: true })
  assert.equal(retrievalCalls, 1)
  assert.ok(requests.at(-1).messages.some(message => message.content.includes('参考文本')))
  assert.ok(events.some(event => event.contextSummary?.sources[0]?.id === 'n1'))
  const beforeRejected = requests.length
  assert.equal(await handlers.get('ai:chat:start')({ sender }, { ...args, inputBudget: 2048, messages: [{ role: 'user', content: '中'.repeat(9000) }] }), false)
  assert.equal(requests.length, beforeRejected, 'over-budget input must never reach fetch')
  assert.match(events.at(-1).error, /预算/)
  cancelMode = true
  const pending = handlers.get('ai:chat:start')({ sender }, { ...args, requestId: 'cancel' })
  await handlers.get('ai:chat:abort')({ sender }, 'cancel')
  assert.equal(await pending, false)
  assert.equal(events.at(-1).aborted, true)
  console.log('AI runtime: settings round-trip, prompt/file override, stream and abort PASS')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
