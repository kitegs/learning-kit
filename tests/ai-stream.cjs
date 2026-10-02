const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const exportsObject = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('electron/main/ai-stream.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsObject, TextDecoder })
const { consumeAiStream } = exportsObject
function stream(text) {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close() } })
}
async function main() {
  let received = ''
  assert.equal(await consumeAiStream(stream(': ping\r\ndata: {"choices":[{"delta":{"content":"中文"}}]}\r\n\r\ndata: [DONE]'), d => received += d), '中文')
  assert.equal(received, '中文')
  const { parseTokenUsage } = (() => { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync('electron/main/ai-diagnostics.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports }); return exports })()
  let usage
  assert.equal(await consumeAiStream(stream('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":20,"completion_tokens":5,"total_tokens":25}}\n\ndata: [DONE]\n\n'), () => {}, value => usage = parseTokenUsage(value)), 'ok')
  assert.equal(usage.total, 25, 'usage after finish_reason must not be lost')
  for (const invalid of [null, {}, { prompt_tokens: -1, completion_tokens: 1, total_tokens: 0 }, { prompt_tokens: '1', completion_tokens: 1, total_tokens: 2 }]) assert.equal(parseTokenUsage(invalid), null)
  await assert.rejects(consumeAiStream(stream('data: {"error":{"message":"quota"}}\n\n'), () => {}), /quota/)
  await assert.rejects(consumeAiStream(stream('data: bad\n\n'), () => {}), /格式/)
  await assert.rejects(consumeAiStream(stream('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'), () => {}), /提前结束/)
  assert.equal(await consumeAiStream(stream('data: {"choices":\ndata: [{"delta":{"content":"multi"},"finish_reason":"stop"}]}\n\n'), () => {}), 'multi')
  await assert.rejects(consumeAiStream(stream('data: {"choices":[{"finish_reason":"length"}]}\n\n'), () => {}), /长度限制/)
  console.log('AI stream: split UTF-8, CRLF, tail, provider errors, malformed and interrupted streams PASS')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
