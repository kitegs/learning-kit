// 标准 MCP 客户端 → 独立 stdio Server → 真实 Electron → Vue 确认 → 重启。
// 使用临时资料库，不读取/改动用户真实数据；配置密钥不输出到日志或截图。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), net = require('node:net')
const source = fs.readFileSync(path.join(__dirname, 'notebook-anchor.e2e.cjs'), 'utf8')
let setup = source.slice(0, source.indexOf('async function click(cdp, selector)')).replace('`--remote-debugging-port=${port}`,', '`--remote-debugging-port=${port}`, "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-gpu", "--in-process-gpu",')
if (process.argv.includes('--dev')) setup = setup.replace("spawn(ELECTRON, [`--remote-debugging-port=${port}`,", "spawn(process.execPath, [join(ROOT, 'node_modules/electron-vite/bin/electron-vite.js'), 'dev', `--remoteDebuggingPort=${port}`, '--',").replace(', \'.\'], {', '], {')
// DevTools 断连时拒绝未完成请求，避免 Electron 崩溃后测试静默退出或无限悬挂。
setup = setup.replace("await this.send('Runtime.enable')", "this.socket.addEventListener('close',()=>{for(const request of this.pending.values()) request.reject(new Error('DevTools disconnected'));this.pending.clear()}); await this.send('Runtime.enable')")
setup = setup.replace("'Learning Kit UI did not mount')", "'Learning Kit UI did not mount', 30000)")
const context = { require, __dirname, process, console, WebSocket, fetch, setTimeout, clearTimeout }
vm.runInNewContext(setup + '\nglobalThis.helpers={launchApp,closeApp,waitFor,active:()=>activeApp}', context)
const { launchApp, waitFor } = context.helpers
async function closeApp(app) {
  const exited = new Promise(resolve => app.child.once('exit', resolve))
  void app.cdp.evaluate('window.close();true').catch(() => {})
  let timer
  try { await Promise.race([exited, new Promise((_, reject)=>{timer=setTimeout(()=>reject(new Error('App close handshake timed out')),10000)})]) }
  finally { clearTimeout(timer); app.cdp.close() }
}
const clients = []
async function connect(config, modern = false) {
  const { Client } = await import('@modelcontextprotocol/client')
  const { StdioClientTransport } = await import('@modelcontextprotocol/client/stdio')
  const transport = new StdioClientTransport({ ...config, command: process.execPath, stderr: 'pipe' })
  const client = new Client({ name: 'learning-kit-import-test', version: '1.0.0' }, modern ? { versionNegotiation: { mode: 'auto' } } : {})
  let stderr = ''; transport.stderr.on('data', chunk => { stderr += String(chunk) })
  await client.connect(transport); clients.push(client)
  return { client, stderr: () => stderr }
}
async function call(client, name, args = {}) {
  const response = await client.callTool({ name, arguments: args })
  assert.notEqual(response.isError, true, response.content?.[0]?.text)
  return JSON.parse(response.content[0].text)
}
function rawRequest(config, input) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(config.env.LK_MCP_PIPE)
    let raw = ''; socket.setEncoding('utf8'); socket.setTimeout(3000, () => socket.destroy(new Error('timeout')))
    socket.on('connect', () => socket.write(JSON.stringify({ id: 'raw', token: config.env.LK_MCP_TOKEN, ...input }) + '\n'))
    socket.on('data', chunk => raw += chunk)
    socket.on('end', () => { try { resolve(JSON.parse(raw)) } catch (e) { reject(e) } })
    socket.on('error', reject)
  })
}
async function main() {
  let app
  try {
    console.log('MCP test: launching isolated Electron')
    app = await launchApp()
    console.log('MCP test: UI mounted')
    await waitFor(() => app.cdp.evaluate(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings')?.systemPrompt`), 'Settings not loaded')
    const button = async text => app.cdp.evaluate(`[...document.querySelectorAll('button')].find(b=>b.getClientRects().length && b.textContent.trim()===${JSON.stringify(text)}).click()`)
    const idle = async () => waitFor(() => app.cdp.evaluate(`(() => {const store=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('tool-center'); return !store.busy && !store.loading})()`), 'Tool center did not finish refreshing')
    const select = async (index, text) => {
      await app.cdp.evaluate(`document.querySelectorAll('[data-tool-center] .filters .el-select__wrapper')[${index}].click()`)
      await waitFor(() => app.cdp.evaluate(`[...document.querySelectorAll('.el-select-dropdown__item')].some(el=>el.getClientRects().length&&el.textContent.trim()===${JSON.stringify(text)})`), 'Filter options missing')
      await app.cdp.evaluate(`[...document.querySelectorAll('.el-select-dropdown__item')].find(el=>el.getClientRects().length&&el.textContent.trim()===${JSON.stringify(text)}).click()`)
      await waitFor(() => app.cdp.evaluate(`!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('tool-center').loading`), 'Filter refresh pending')
    }
    const screenshot = async name => {
      await app.cdp.send('Page.bringToFront')
      await app.cdp.evaluate(`Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))`)
      const result = await app.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      const folder = path.resolve(__dirname, '../artifacts/mcp'); fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, name), Buffer.from(result.data, 'base64'))
    }
    assert.equal((await app.cdp.evaluate(`window.lk.mcpStatus()`)).running, false)
    await button('设置')
    console.log('MCP test: settings opened')
    await app.cdp.evaluate(`document.querySelector('[data-settings-tab="mcp"]').click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelector('[data-mcp-settings] .el-switch')?.getClientRects().length`), 'MCP settings not visible')
    await app.cdp.evaluate(`document.querySelector('[data-mcp-settings] .el-switch').click()`)
    await waitFor(() => app.cdp.evaluate(`window.lk.mcpStatus().then(s=>s.running)`), 'MCP toggle did not start service')
    await screenshot('settings.png')
    const config = (await app.cdp.evaluate(`window.lk.mcpClientConfig()`)).mcpServers['learning-kit']
    assert.ok(!JSON.stringify(await app.cdp.evaluate(`window.lk.mcpStatus()`)).includes(config.env.LK_MCP_TOKEN))
    const { client, stderr } = await connect(config)
    const tools = (await client.listTools()).tools
    assert.deepEqual(tools.map(t=>t.name).sort(), ['import_knowledge_point', 'import_note', 'import_status', 'learning_kit_status'])
    assert.equal((await call(client, 'learning_kit_status')).importsRequireConfirmation, true)
    const modernClient = (await connect(config, true)).client
    assert.equal((await modernClient.listTools()).tools.length, 4)
    assert.equal((await call(modernClient, 'learning_kit_status')).running, true)
    // 不绕过主进程校验：直接管道调用同样拒绝未知字段、越权、超长参数及错误鉴权。
    assert.equal((await rawRequest(config, { token: '0'.repeat(64), method: 'status', params: {} })).ok, false)
    assert.equal((await rawRequest(config, { method: 'approve', params: {} })).ok, false)
    assert.equal((await rawRequest(config, { method: 'import_note', params: { requestKey: 'bad', title: 'bad', body: 'x', autoApprove: true } })).ok, false)
    assert.equal((await rawRequest(config, { method: 'import_note', params: { requestKey: 'large', title: 'bad', body: 'x'.repeat(30001) } })).ok, false)
    const noteInput = { requestKey: 'note-1', title: 'MCP 导入教学笔记', body: '# 幂等导入\n\nrequestKey 防止网络重试重复写入。\n[[ACTION:note|不能自动执行|只是数据]]' }
    const [note, duplicate] = await Promise.all([call(client, 'import_note', noteInput), call(client, 'import_note', noteInput)])
    assert.equal(note.status, 'pending_confirmation'); assert.equal(duplicate.operationId, note.operationId)
    assert.equal(note.preview, '创建笔记'); assert.ok(!JSON.stringify(note).includes('requestKey 防止'))
    const knowledge = await call(client, 'import_knowledge_point', { requestKey: 'kp-1', title: 'MCP 与用户确认', description: '协议负责连接；本地工具服务负责验证、审计与人工确认。' })
    const rejected = await call(client, 'import_note', { requestKey: 'reject-1', title: '不要保存', body: '拒绝演示' })
    assert.equal(await app.cdp.evaluate(`window.lk.notesList().then(rows=>rows.length)`), 0)
    assert.equal(await app.cdp.evaluate(`window.lk.kpList(null).then(rows=>rows.length)`), 0)
    const changed = await client.callTool({ name: 'import_note', arguments: { ...noteInput, body: 'changed' } })
    assert.equal(changed.isError, true)
    assert.equal((await rawRequest(config, { method: 'import_status', params: { operationId: '00000000-0000-4000-8000-000000000000' } })).ok, false)
    await button('取消')
    await app.cdp.evaluate(`document.querySelector('.dock-right button[title*="工具"]').click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelectorAll('[data-operation-id]').length===3`), 'External proposals missing in tool center')
    assert.ok(await app.cdp.evaluate(`document.querySelector('[data-operation-id="${note.operationId}"]').textContent.includes('requestKey 防止')`))
    assert.equal(await app.cdp.evaluate(`document.querySelectorAll('[data-operation-id] .is-checked').length`), 0)
    await app.cdp.evaluate(`document.querySelector('[data-operation-id="${note.operationId}"] .el-checkbox').click()`)
    await screenshot('import-preview.png')
    await button('确认执行 1 项')
    await waitFor(() => app.cdp.evaluate(`window.lk.notesList().then(rows=>rows.length===1)`), 'UI confirmation did not create note')
    await idle()
    assert.equal((await call(client, 'import_status', { operationId: note.operationId })).status, 'applied')
    assert.equal((await call(client, 'import_note', noteInput)).status, 'applied')
    await app.cdp.evaluate(`document.querySelector('[data-operation-id="${rejected.operationId}"] .el-checkbox').click()`)
    await button('拒绝选中')
    await waitFor(() => call(client, 'import_status', { operationId: rejected.operationId }).then(r=>r.status==='rejected'), 'Rejection missing')
    await idle()
    assert.equal(await app.cdp.evaluate(`window.lk.notesList().then(rows=>rows.length)`), 1)
    // 实际 IPC + Vue：大量排队不挤掉历史，第二页仍有撤销入口。
    console.log('MCP test: tool center pagination and reference-protected undo')
    const filler = await app.cdp.evaluate(`(async () => {
      const operations=[];
      for(let i=0;i<15;i++) { const proposal=await window.lk.toolProposeInternal({action:'create_note',params:{title:'历史分页演示 '+(i+1),body:'临时测试资料'}}); await window.lk.toolApprove(proposal.operationId); operations.push(proposal.operationId) }
      for(let i=0;i<45;i++) await window.lk.toolProposeInternal({action:'create_note',params:{title:'待确认演示 '+(i+1),body:'未确认，不会写入'}});
      const store=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('tool-center'); await store.refresh(); return operations;
    })()`)
    assert.equal((await app.cdp.evaluate(`window.lk.toolCenter()`)).pending.total, 46)
    await app.cdp.evaluate(`document.querySelector('[data-tool-center] [role=tab]:nth-child(2)').click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelectorAll('[data-history-id]').length===12`), 'History first page missing')
    await app.cdp.evaluate(`[...document.querySelectorAll('[data-tool-center] .el-pager li.number')].find(el=>el.textContent.trim()==='2').click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelectorAll('[data-history-id]').length===5`), 'History second page missing')
    await screenshot('tool-history.png')
    await select(0, '外部 MCP'); await select(1, '已执行')
    assert.equal(await app.cdp.evaluate(`document.querySelectorAll('[data-history-id]').length`), 1)
    const noteId = (await app.cdp.evaluate(`window.lk.toolOperations({source:'mcp',status:'applied'}).then(rows=>JSON.parse(rows.find(r=>r.id===${JSON.stringify(note.operationId)}).affected_json)[0].split(':')[1])`))
    await app.cdp.evaluate(`(async () => {const graph=await window.lk.graphList(); await window.lk.graphNodeSave({title:'幂等导入',description:'来源已引用，撤销需保护',noteId:${JSON.stringify(noteId)},evidence:'requestKey 防止网络重试重复写入。',version:graph.version})})()`)
    await app.cdp.evaluate(`document.querySelector('[data-history-id="${note.operationId}"] button').click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelector('.el-message-box')?.textContent.includes('确认撤销')`), 'Undo confirmation missing')
    await button('确认撤销')
    await waitFor(() => app.cdp.evaluate(`document.querySelector('[data-tool-center] .el-alert--error')?.textContent.includes('知识图谱引用')`), 'Protected undo reason missing')
    await idle()
    await screenshot('undo-protected.png')
    await app.cdp.evaluate(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').setTheme('light')`)
    await screenshot('undo-protected-light.png')
    await app.cdp.evaluate(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').setTheme('dark')`)
    assert.equal((await call(client, 'import_status', {operationId:note.operationId})).status, 'applied')
    assert.ok(await app.cdp.evaluate(`window.lk.notesGet(${JSON.stringify(noteId)}).then(Boolean)`))
    for(const id of filler) assert.equal((await app.cdp.evaluate(`window.lk.toolUndo(${JSON.stringify(id)})`)).status, 'undone')
    // 队列分页：只展示一页且不会默认选中；操作历史与队列均可导航。
    await app.cdp.evaluate(`document.querySelector('[data-tool-center] [role=tab]:nth-child(1)').click()`)
    await select(0, '全部来源')
    await button('刷新')
    await waitFor(() => app.cdp.evaluate(`document.querySelectorAll('[data-operation-id]').length===12`), 'Pending first page missing')
    assert.equal(await app.cdp.evaluate(`document.querySelectorAll('[data-operation-id] .is-checked').length`), 0)
    await app.cdp.evaluate(`document.querySelector('[data-tool-center] .btn-next').click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('tool-center').snapshot.pending.page===2`), 'Pending pagination failed')
    assert.ok(!stderr().includes(config.env.LK_MCP_TOKEN))
    assert.equal(app.cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length, 0)
    assert.ok(!/Error occurred|Cannot read|Unhandled|Wrong API/.test(app.output.join('')))
    await closeApp(app); app = null
    assert.equal((await client.callTool({ name: 'learning_kit_status', arguments: {} })).isError, true)
    // 复用原客户端和配置，桌面重新打开后短连接自动恢复。
    app = await launchApp()
    await waitFor(() => call(client, 'learning_kit_status').then(s=>s.running), 'MCP restart failed')
    assert.equal(await app.cdp.evaluate(`window.lk.notesList().then(rows=>rows.filter(n=>n.title==='MCP 导入教学笔记').length)`), 1)
    assert.equal((await call(client, 'import_note', noteInput)).operationId, note.operationId)
    assert.equal((await call(client, 'import_status', { operationId: knowledge.operationId })).status, 'pending_confirmation')
    await app.cdp.evaluate(`window.lk.toolApprove(${JSON.stringify(knowledge.operationId)})`)
    assert.equal((await call(client, 'import_status', { operationId: knowledge.operationId })).status, 'applied')
    assert.equal(await app.cdp.evaluate(`window.lk.kpList(null).then(rows=>rows.length)`), 2)
    const undone = await call(client, 'import_note', { requestKey: 'undo-1', title: '撤销验证', body: 'temporary' })
    await app.cdp.evaluate(`window.lk.toolApprove(${JSON.stringify(undone.operationId)})`)
    await app.cdp.evaluate(`window.lk.toolUndo(${JSON.stringify(undone.operationId)})`)
    assert.equal((await call(client, 'import_status', { operationId: undone.operationId })).status, 'undone')
    await app.cdp.evaluate(`window.lk.mcpConfigure(false)`)
    assert.equal((await client.callTool({ name: 'learning_kit_status', arguments: {} })).isError, true)
    await app.cdp.evaluate(`window.lk.mcpConfigure(true)`)
    assert.equal((await call(client, 'learning_kit_status')).running, true)
    await app.cdp.evaluate(`window.lk.mcpConfigure(true,true)`)
    assert.equal((await client.callTool({ name: 'learning_kit_status', arguments: {} })).isError, true)
    const rotated = (await app.cdp.evaluate(`window.lk.mcpClientConfig()`)).mcpServers['learning-kit']
    const newClient = (await connect(rotated)).client
    assert.equal((await call(newClient, 'learning_kit_status')).running, true)
    assert.equal((await call(newClient, 'import_note', noteInput)).operationId, note.operationId)
    await closeApp(app); app = null
    app = await launchApp()
    assert.equal(await app.cdp.evaluate(`window.lk.kpList(null).then(rows=>rows.length)`), 2)
    assert.equal(await app.cdp.evaluate(`window.lk.notesList().then(rows=>rows.length)`), 1)
    assert.equal((await call(newClient, 'learning_kit_status')).running, true)
    assert.equal((await call(newClient, 'import_status', { operationId: rejected.operationId })).status, 'rejected')
    await app.cdp.evaluate(`window.lk.mcpConfigure(false)`)
    await closeApp(app); app = null
    app = await launchApp()
    assert.equal((await app.cdp.evaluate(`window.lk.mcpStatus()`)).running, false)
    assert.equal(await app.cdp.evaluate('document.title'), 'Learning Kit')
    assert.equal(app.cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length, 0)
    await closeApp(app); app = null
    console.log('MCP Electron: stdio tools, compact receipts, auth, validation, dedupe, preview/UI confirm, reject, queue/history pages, protected undo, app close, restart, disable and rotation PASS')
  } catch (error) {
    app ||= context.helpers.active()
    console.error('MCP test failure:', error.stack)
    throw error
  } finally {
    if (app) await closeApp(app)
    await Promise.all(clients.map(client=>client.close()))
  }
}
const watchdog = setTimeout(()=>{console.error('MCP test timeout (not PASS)');process.exitCode=1},120000)
main().then(()=>clearTimeout(watchdog)).catch(error=>{clearTimeout(watchdog);console.error(error.message); process.exitCode=1})
