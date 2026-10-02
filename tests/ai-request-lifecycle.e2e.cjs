// Isolated real Electron IPC + local SSE. No actual user data or cloud credentials.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), http = require('node:http'), assert = require('node:assert/strict')
const source = fs.readFileSync(path.join(__dirname, 'notebook-anchor.e2e.cjs'), 'utf8')
let setup = source.slice(0, source.indexOf('async function click(cdp, selector)'))
if (process.argv.includes('--dev')) setup = setup.replace("spawn(ELECTRON, [`--remote-debugging-port=${port}`, '.']", "spawn(process.execPath, [join(ROOT, 'node_modules/electron-vite/bin/electron-vite.js'), 'dev', `--remoteDebuggingPort=${port}`]")
const context = { require, __dirname, process, console, WebSocket, fetch, setTimeout, clearTimeout }
vm.runInNewContext(setup + '\nglobalThis.helpers={launchApp,closeApp,waitFor}', context)
const { launchApp, closeApp, waitFor } = context.helpers
async function main() {
  let app, hold = true, count = 0, disconnected = 0
  const server = http.createServer((request, response) => {
    request.resume()
    request.on('end', () => {
      count++
      response.on('close', () => { disconnected++ })
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.write('data: {"choices":[{"delta":{"content":"测试"}}]}\n\n')
      if (!hold) response.end('data: [DONE]\n\n')
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const args = { requestId: 'lesson-one', provider: 'custom', model: 'test', apiKey: 'fake-local-key', baseUrl: `http://127.0.0.1:${server.address().port}/chat/completions`, messages: [{ role: 'user', content: 'test' }] }
  try {
    app = await launchApp()
    await app.cdp.evaluate(`globalThis.events=[]; window.lk.onAiChunk('lesson-one',p=>events.push(p)); globalThis.pending=window.lk.aiChatStart(${JSON.stringify(args)}); true`)
    await waitFor(() => count === 1, 'Local request missing')
    const duplicate = await app.cdp.evaluate(`window.lk.aiChatStart(${JSON.stringify(args)}).then(()=>false,err=>String(err.message).includes('仍在处理中'))`)
    assert.equal(duplicate, true)
    assert.equal(count, 1)
    assert.equal(await app.cdp.evaluate(`events.filter(p=>p.done).length`), 0)
    await app.cdp.evaluate(`window.lk.aiChatAbort('lesson-one')`)
    assert.equal(await app.cdp.evaluate(`pending`), false)
    assert.equal(await app.cdp.evaluate(`events.at(-1).aborted`), true)
    hold = false
    assert.equal(await app.cdp.evaluate(`window.lk.aiChatStart(${JSON.stringify(args)})`), '测试')
    hold = true
    const beforeClose = disconnected
    await app.cdp.evaluate(`globalThis.closing=window.lk.aiChatStart(${JSON.stringify({ ...args, requestId: 'closing' })}); true`)
    await waitFor(() => count === 3, 'Closing request missing')
    assert.equal(app.cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length, 0)
    await closeApp(app); app = null
    await waitFor(() => disconnected > beforeClose, 'Window close did not release local stream')
    app = await launchApp(); hold = false
    assert.equal(await app.cdp.evaluate(`window.lk.aiChatStart(${JSON.stringify(args)})`), '测试')
    assert.ok(!/Error occurred|Cannot read|Unhandled|Wrong API/.test(app.output.join('')))
    await closeApp(app); app = null
    console.log('AI request Electron: duplicate rejection, original stream intact, abort, ID reuse, close and restart PASS')
  } finally { if (app) await closeApp(app); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)) }
}
main().catch(error=>{ console.error(error); process.exitCode=1 })
