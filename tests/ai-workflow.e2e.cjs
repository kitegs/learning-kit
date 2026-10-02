// Real main process + Vue UI in a temporary profile, with a local fake provider.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), http = require('node:http'), assert = require('node:assert/strict')
const { saveUiFailure } = require('./helpers/ui-artifacts.cjs')
const source = fs.readFileSync(path.join(__dirname, 'notebook-anchor.e2e.cjs'), 'utf8')
let setup = source.slice(0, source.indexOf('async function click(cdp, selector)')).replace('`--remote-debugging-port=${port}`,', '`--remote-debugging-port=${port}`, "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",')
if (process.argv.includes('--dev')) setup = source.slice(0, source.indexOf('async function click(cdp, selector)')).replace("spawn(ELECTRON, [`--remote-debugging-port=${port}`, '.']", "spawn(process.execPath, [join(ROOT, 'node_modules/electron-vite/bin/electron-vite.js'), 'dev', `--remoteDebuggingPort=${port}`]")
const context = { require, __dirname, process, console, WebSocket, fetch, setTimeout, clearTimeout, path }
vm.runInNewContext(setup + '\nglobalThis.helpers={launchApp,closeApp,waitFor,active:()=>activeApp}', context)
const { launchApp, closeApp, waitFor } = context.helpers
const stores = `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s`
const settings = `${stores}.get('settings')`, flow = `${stores}.get('ai-workflow')`
async function main() {
  let app
  const requests = []
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', chunk => raw += chunk)
    req.on('end', () => {
      const input = JSON.parse(raw); requests.push(input)
      if (!input.stream) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })); return }
      const query = input.messages.at(-1).content
      if (query.includes('HTTP失败')) { res.writeHead(429); res.end('quota fake-local-key'); return }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.flushHeaders()
      if (query.includes('取消请求')) { res.write(': heartbeat\n\n'); return }
      if (query.includes('坏流')) { res.end('data: invalid\n\n'); return }
      setTimeout(() => {
        if (res.destroyed) return
        const content = query.includes('无用量') ? '没有用量的回答' : '已生成学习产物，确认后保存。\n[[ACTION:note|诊断教学笔记|try/finally 统一清理]]\n[[ACTION:card|取消是否等于结束？|不等于，等待 finally 清理]]'
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })}\n\n`)
        if (!query.includes('无用量')) res.write('data: {"choices":[],"usage":{"prompt_tokens":80,"completion_tokens":40,"total_tokens":120}}\n\n')
        res.end('data: [DONE]\n\n')
      }, 65)
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const endpoint = `http://127.0.0.1:${server.address().port}/v1/chat/completions`
  const button = async text => app.cdp.evaluate(`[...document.querySelectorAll('button')].find(b=>b.getClientRects().length && b.textContent.trim()===${JSON.stringify(text)}).click()`)
  const send = async text => {
    await app.cdp.evaluate(`(() => { const el=document.querySelector('.composer textarea'); el.value=${JSON.stringify(text)}; el.dispatchEvent(new Event('input',{bubbles:true})); })()`)
    await button('发送')
  }
  const direct = extra => `window.lk.aiChatStart(${JSON.stringify({ requestId: `e2e-${Math.random()}`, provider: 'custom', model: 'local-test', baseUrl: endpoint, apiKey: 'fake-local-key', messages: [{ role: 'user', content: '无用量' }], diagnosticsEnabled: true, ...extra })})`
  const screenshot = async name => {
    await app.cdp.send('Page.bringToFront')
    await app.cdp.evaluate(`Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))`)
    const result = await app.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    const folder = path.resolve(__dirname, '../test-results/ui/ai-workflow'); fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, name), Buffer.from(result.data, 'base64'))
  }
  try {
    app = await launchApp()
    await waitFor(() => app.cdp.evaluate(`!!${settings}?.systemPrompt && !!${stores}.get('chat')?.currentConvId`), 'Settings not loaded')
    await app.cdp.evaluate(`(async()=>{const s=${settings}; s.provider='custom';s.model='local-test';s.customBaseUrl=${JSON.stringify(endpoint)};s.apiKeys.custom='fake-local-key';s.testMode=false;s.aiDiagnosticsEnabled=true;s.aiRequestUsage=true;s.aiAgentEnabled=true;s.aiAgentMaxSteps=6;await s.setTheme('paper');await s.saveAll()})()`)
    // Actual composer -> streamed answer -> parsed actions -> Agent preview.
    await send('生成一篇教学笔记和一张闪卡')
    await waitFor(() => app.cdp.evaluate(`${flow}.runs.some(r=>r.steps.length===3 && r.status==='awaiting_confirmation')`), 'Agent preview missing')
    const run = await app.cdp.evaluate(`JSON.parse(JSON.stringify(${flow}.runs.find(r=>r.steps.length===3)))`)
    assert.equal(run.usedSteps, 3)
    assert.equal(await app.cdp.evaluate(`window.lk.notesList().then(rows=>rows.some(n=>n.title==='诊断教学笔记'))`), false)
    assert.equal(await app.cdp.evaluate(`window.lk.cardAll().then(rows=>rows.length)`), 0)
    const diagnostics = await app.cdp.evaluate(`window.lk.aiDiagnosticsList()`)
    assert.equal(diagnostics.length, 1); assert.equal(diagnostics[0].usage.total, 120)
    assert.ok(diagnostics[0].firstContentMs >= 50)
    assert.ok(!JSON.stringify(diagnostics).includes('fake-local-key'))
    assert.ok(requests.find(r=>r.stream).stream_options.include_usage)
    await waitFor(() => app.cdp.evaluate(`document.querySelectorAll('[data-agent-run] [data-step-status="pending_confirmation"]').length===2`), 'Run UI missing')
    await app.cdp.evaluate(`document.querySelector('[data-agent-run] [data-step-status="pending_confirmation"] .el-button--primary').click()`)
    await waitFor(() => app.cdp.evaluate(`window.lk.notesList().then(rows=>rows.some(n=>n.title==='诊断教学笔记'))`), 'Confirmed note missing')
    await screenshot('agent-flow.png')
    await app.cdp.evaluate(`[...document.querySelectorAll('.el-tabs__item')].find(el=>el.textContent==='请求诊断').click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelector('[data-ai-diagnostic]')?.textContent.includes('120')`), 'Diagnostic UI missing')
    await screenshot('request-diagnostics.png')
    assert.equal(app.cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length, 0)
    await closeApp(app); app = null
    app = await launchApp()
    await waitFor(() => app.cdp.evaluate(`${settings}.aiAgentEnabled && ${settings}.aiRequestUsage`), 'Switch persistence missing')
    assert.equal((await app.cdp.evaluate(`window.lk.aiDiagnosticsList()`)).length, 1)
    assert.equal(await app.cdp.evaluate(`window.lk.notesList().then(rows=>rows.filter(n=>n.title==='诊断教学笔记').length)`), 1)
    await button('运行记录')
    await waitFor(() => app.cdp.evaluate(`document.querySelectorAll('[data-agent-run] [data-step-status="pending_confirmation"]').length===1`), 'Pending step not restored')
    await app.cdp.evaluate(`document.querySelector('[data-agent-run] [data-step-status="pending_confirmation"] .el-button--primary').click()`)
    await waitFor(() => app.cdp.evaluate(`window.lk.cardAll().then(rows=>rows.length===1)`), 'Restored confirmation failed')
    await assert.rejects(app.cdp.evaluate(`window.lk.agentStepDecide(${JSON.stringify(run.id)},${JSON.stringify(run.steps[1].id)},'approve')`), /重复执行/)
    // Close the panel using its actual close control before the next composer send.
    await app.cdp.evaluate(`[...document.querySelectorAll('.el-drawer')].find(el=>el.getClientRects().length && el.textContent.includes('AI 运行记录')).querySelector('.el-drawer__close-btn').click()`)
    await app.cdp.evaluate(`${settings}.aiAgentMaxSteps=2`)
    await send('生成超过步骤上限的两个工具')
    await waitFor(() => app.cdp.evaluate(`${flow}.runs.some(r=>r.error?.includes('步骤上限'))`), 'Step cap not enforced')
    assert.equal(await app.cdp.evaluate(`window.lk.toolOperations({status:'pending_confirmation'}).then(rows=>rows.length)`), 0)
    assert.equal(await app.cdp.evaluate(direct({})), '没有用量的回答')
    assert.equal((await app.cdp.evaluate(`window.lk.aiDiagnosticsList()`)).find(d=>d.usage===null)?.status, 'completed')
    for (const [query, code] of [['HTTP失败', 'http'], ['坏流', 'stream']]) {
      assert.equal(await app.cdp.evaluate(direct({ messages: [{ role: 'user', content: query }] })), false)
      const records = await app.cdp.evaluate(`window.lk.aiDiagnosticsList()`)
      assert.ok(records.some(d=>d.failureCode===code)); assert.ok(!JSON.stringify(records).includes('fake-local-key'))
    }
    const cancelId = 'cancel-diagnostic'
    await app.cdp.evaluate(`globalThis.cancelPending=${direct({ requestId: cancelId, messages: [{ role: 'user', content: '取消请求' }], agentEnabled: true })};true`)
    await waitFor(() => requests.some(r=>r.messages.at(-1).content==='取消请求'), 'Pending request absent')
    await app.cdp.evaluate(`window.lk.aiChatAbort(${JSON.stringify(cancelId)})`)
    assert.equal(await app.cdp.evaluate('cancelPending'), false)
    assert.ok((await app.cdp.evaluate(`window.lk.aiDiagnosticsList()`)).some(d=>d.status==='cancelled'))
    assert.ok((await app.cdp.evaluate(`window.lk.agentRunsList()`)).some(r=>r.requestId===cancelId && r.status==='cancelled'))
    const beforeOff = (await app.cdp.evaluate(`window.lk.aiDiagnosticsList()`)).length
    await app.cdp.evaluate(direct({ diagnosticsEnabled: false }))
    assert.equal((await app.cdp.evaluate(`window.lk.aiDiagnosticsList()`)).length, beforeOff)
    await app.cdp.evaluate(`window.lk.aiDiagnosticsClear()`)
    await closeApp(app); app = null
    app = await launchApp()
    assert.equal((await app.cdp.evaluate(`window.lk.aiDiagnosticsList()`)).length, 0)
    assert.equal(await app.cdp.evaluate(`window.lk.cardAll().then(rows=>rows.length)`), 1)
    assert.equal(await app.cdp.evaluate('document.title'), 'Learning Kit')
    assert.equal(app.cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length, 0)
    assert.ok(!/Error occurred|Cannot read|Unhandled|Wrong API/.test(app.output.join('')))
    await closeApp(app); app = null
    console.log('AI workflow Electron: composer, preview, confirm, usage, cap, errors, stop, switches, restart and clear PASS')
  } catch (error) {
    app ||= context.helpers.active()
    await saveUiFailure('ai-workflow', app, error)
    console.error('AI workflow failure evidence saved in test-results/ui/ai-workflow')
    throw error
  } finally { if (app) await closeApp(app); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)) }
}
main().catch(error=>{console.error(error);process.exitCode=1})
