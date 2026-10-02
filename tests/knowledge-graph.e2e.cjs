// Real Electron + local fake AI endpoint. Never uses user data or real credentials.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), http = require('node:http'), assert = require('node:assert/strict')
const existing = fs.readFileSync(path.join(__dirname, 'notebook-anchor.e2e.cjs'), 'utf8')
const setup = existing.slice(0, existing.indexOf('async function click(cdp, selector)')).replace('windowsHide: true', 'windowsHide: false').replace('`--remote-debugging-port=${port}`,', '`--remote-debugging-port=${port}`, "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",')
const context = { require, __dirname, process, console, WebSocket, fetch, setTimeout, clearTimeout }
vm.runInNewContext(setup + '\nglobalThis.helpers = { launchApp, closeApp, waitFor };', context)
const { launchApp, closeApp, waitFor } = context.helpers
const stores = `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s`
const graph = `${stores}.get('knowledge-graph')`
const body = '函数是闭包的前置知识。闭包包含词法环境。闭包应用于状态封装。'
const draft = { nodes: ['函数','闭包','词法环境','状态封装'].map((title, i) => ({ key: String(i), title, description: `${title}的学习概念`, evidence: body.split('。').find(s => s.includes(title)) })), edges: [{ from: '0', to: '1', relation: 'prerequisite', evidence: '函数是闭包的前置知识' }, { from: '1', to: '2', relation: 'contains', evidence: '闭包包含词法环境' }, { from: '1', to: '3', relation: 'applies', evidence: '闭包应用于状态封装' }] }
async function main() {
  let app, hold = false
  const requests = []
  const server = http.createServer((req, res) => {
    let input = ''; req.on('data', chunk => { input += chunk })
    req.on('end', () => {
      requests.push(JSON.parse(input)); res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.flushHeaders()
      if (hold) { res.write(': waiting\n\n'); return }
      const content = requests.at(-1).messages.at(-1).content.includes('提取知识图谱') ? JSON.stringify(draft) : '图谱参考回答'
      for (let i = 0; i < content.length; i += 30) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(i, i + 30) } }] })}\n\n`)
      res.end('data: [DONE]\n\n')
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const endpoint = `http://127.0.0.1:${server.address().port}/v1/chat/completions`
  const physicalClick = async expression => {
    await app.cdp.send('Page.bringToFront')
    const point = await app.cdp.evaluate(`(() => {const el=${expression}; el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`)
    await app.cdp.send('Input.dispatchMouseEvent', {type:'mousePressed', ...point, button:'left',clickCount:1})
    await app.cdp.send('Input.dispatchMouseEvent', {type:'mouseReleased', ...point, button:'left',clickCount:1})
  }
  const button = async text => app.cdp.evaluate(`[...document.querySelectorAll('button')].find(b => b.getClientRects().length && b.textContent.trim() === ${JSON.stringify(text)}).click()`)
  const enterGraph = async () => {
    await app.cdp.evaluate(`document.querySelector('[data-testid="dock-mode-knowledge"]').click()`)
    await waitFor(() => app.cdp.evaluate(`!!document.querySelector('[data-testid="knowledge-graph-tab"]')`), 'Knowledge tab missing')
    await app.cdp.evaluate(`document.querySelector('[data-testid="knowledge-graph-tab"]').click()`)
    await waitFor(() => app.cdp.evaluate(`!!${graph}?.data.version`), 'Graph not loaded')
  }
  try {
    app = await launchApp()
    await waitFor(() => app.cdp.evaluate(`!!${stores}.get('settings')?.systemPrompt`), 'Settings not ready')
    const noteId = await app.cdp.evaluate(`(async () => { const s = ${stores}.get('settings'); s.provider='custom'; s.model='test'; s.customBaseUrl=${JSON.stringify(endpoint)}; s.apiKeys.custom='fake-local-key'; s.testMode=false; s.aiInputBudget=16384; await s.setTheme('paper'); return window.lk.notesUpsert({title:'JavaScript 闭包学习',body:${JSON.stringify(body)},kind:'note'}); })()`)
    await enterGraph()
    await button('从笔记提取')
    // Select source through the UI select, not by editing database or draft state.
    await waitFor(() => app.cdp.evaluate(`document.querySelector('.extract-actions .el-select__wrapper')?.getClientRects().length > 0`), 'Extract dialog not visible')
    await physicalClick(`document.querySelector('.extract-actions .el-select__wrapper')`)
    await waitFor(() => app.cdp.evaluate(`[...document.querySelectorAll('.el-select-dropdown__item')].some(e => e.getClientRects().length && e.textContent.includes('JavaScript 闭包学习'))`), 'Source option missing')
    await app.cdp.evaluate(`[...document.querySelectorAll('.el-select-dropdown__item')].find(e => e.getClientRects().length && e.textContent.includes('JavaScript 闭包学习')).click()`)
    await waitFor(() => app.cdp.evaluate(`!!${graph}.source`), 'Source not selected')
    await button('发送笔记并提取')
    await waitFor(() => app.cdp.evaluate(`!${graph}.busy && ${graph}.raw.includes('prerequisite')`), 'Extraction missing')
    assert.ok(requests[0].messages.at(-1).content.includes(body))
    assert.equal(await app.cdp.evaluate(`window.lk.graphList().then(d => d.nodes.length)`), 0)
    await button('校验并预览')
    await waitFor(() => app.cdp.evaluate(`!!${graph}.preview`), 'Preview missing')
    assert.equal(await app.cdp.evaluate(`window.lk.graphList().then(d => d.nodes.length)`), 0)
    await button('关闭（不保存）')
    await waitFor(() => app.cdp.evaluate(`!${graph}.preview`), 'Dismiss did not discard')
    await button('从笔记提取'); await button('校验并预览')
    await waitFor(() => app.cdp.evaluate(`!!${graph}.preview`), 'Second preview missing')
    await button('确认保存图谱')
    await waitFor(() => app.cdp.evaluate(`document.querySelectorAll('.graph-node').length === 4`), 'Saved graph not shown')
    assert.equal(await app.cdp.evaluate(`document.querySelectorAll('.graph-edge').length`), 3)
    await app.cdp.evaluate(`[...document.querySelectorAll('.graph-node')].find(e => e.getAttribute('aria-label') === '闭包').dispatchEvent(new MouseEvent('click',{bubbles:true}))`)
    assert.ok(await app.cdp.evaluate(`document.querySelector('.graph-detail').textContent.includes('JavaScript 闭包学习')`))
    await app.cdp.evaluate(`document.querySelector('[aria-label="放大图谱"]').click()`)
    await button('重置视图')
    await app.cdp.evaluate(`(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(()=>{}))); })()`)
    await app.cdp.send('Page.bringToFront')
    const screenshot = await app.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    const out = path.resolve(__dirname, '../artifacts/knowledge-graph'); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'graph.png'), Buffer.from(screenshot.data, 'base64'))
    // Exercise actual manual edit dialogs.
    await button('编辑知识点')
    await app.cdp.evaluate(`(() => { const el=[...document.querySelectorAll('.el-dialog textarea')].find(e=>e.getClientRects().length); el.value='手动审核后的闭包说明'; el.dispatchEvent(new Event('input',{bubbles:true})); })()`)
    await button('保存节点')
    await waitFor(() => app.cdp.evaluate(`document.querySelector('.graph-detail').textContent.includes('手动审核后的闭包说明')`), 'Manual node edit missing')
    await button('新建知识点')
    await app.cdp.evaluate(`(() => { const el=document.querySelector('input[data-testid="graph-node-title"], [data-testid="graph-node-title"] input'); el.value='作用域'; el.dispatchEvent(new Event('input',{bubbles:true})); })()`)
    await button('保存节点')
    await waitFor(() => app.cdp.evaluate(`document.querySelectorAll('.graph-node').length === 5`), 'Manual node creation missing')
    await button('添加关系')
    async function select(index, label) {
      const wrapper = `[...document.querySelectorAll('.el-dialog')].find(d=>d.querySelector('.el-dialog__title')?.textContent==='编辑有向关系').querySelectorAll('.el-select__wrapper')[${index}]`
      const menuId = await app.cdp.evaluate(`${wrapper}.querySelector('input[aria-controls]').getAttribute('aria-controls')`)
      await physicalClick(wrapper)
      const menu = `document.getElementById(${JSON.stringify(menuId)})`
      await waitFor(() => app.cdp.evaluate(`[...(${menu}?.querySelectorAll('.el-select-dropdown__item')||[])].some(e=>e.getClientRects().length && e.textContent.trim()===${JSON.stringify(label)})`), 'Select option missing')
      await app.cdp.evaluate(`[...${menu}.querySelectorAll('.el-select-dropdown__item')].find(e=>e.textContent.trim()===${JSON.stringify(label)}).click()`)
    }
    await select(0, '作用域'); await select(2, '词法环境'); await button('保存关系')
    await waitFor(() => app.cdp.evaluate(`document.querySelectorAll('.graph-edge').length === 4`), 'Manual edge creation missing')
    await button('编辑'); await select(1, '对比'); await button('保存关系')
    await waitFor(() => app.cdp.evaluate(`document.querySelector('.graph-detail').textContent.includes('对比')`), 'Manual edge update missing')
    await button('删除关系')
    await waitFor(() => app.cdp.evaluate(`!!document.querySelector('.el-message-box__btns .el-button--primary')`), 'Delete confirmation missing')
    await app.cdp.evaluate(`document.querySelector('.el-message-box__btns .el-button--primary').click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelectorAll('.graph-edge').length === 3`), 'Manual edge removal failed')
    // Real network request verifies graph-only source expansion and opt-out.
    await app.cdp.evaluate(`window.lk.aiChatStart({requestId:'graph-query',provider:'custom',model:'test',apiKey:'fake',baseUrl:${JSON.stringify(endpoint)},messages:[{role:'user',content:'闭包是什么'}],retrieveGraph:true})`)
    assert.ok(requests.at(-1).messages.some(m => m.content.includes('图谱路径')))
    await app.cdp.evaluate(`window.lk.aiChatStart({requestId:'plain-query',provider:'custom',model:'test',apiKey:'fake',baseUrl:${JSON.stringify(endpoint)},messages:[{role:'user',content:'闭包是什么'}],retrieveGraph:false})`)
    assert.ok(!requests.at(-1).messages.some(m => m.content.includes('图谱路径')))
    await button('从笔记提取'); hold = true; const before = requests.length; await button('发送笔记并提取')
    await waitFor(() => requests.length > before, 'Stop test request missing'); await button('停止提取')
    await waitFor(() => app.cdp.evaluate(`!${graph}.busy`), 'Extraction did not stop')
    assert.equal(await app.cdp.evaluate(`window.lk.graphList().then(d => d.nodes.length)`), 5)
    hold = false; await button('关闭（不保存）')
    await app.cdp.evaluate(`(async () => { const s=${stores}.get('settings'); s.aiGraphRetrievalEnabled=true; await s.saveAll() })()`)
    assert.equal(await app.cdp.evaluate(`window.lk.getSetting('aiGraphRetrievalEnabled')`), 'true')
    assert.equal(app.cdp.events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0)
    await closeApp(app); app = null; app = await launchApp(); await enterGraph()
    await waitFor(() => app.cdp.evaluate(`document.querySelectorAll('.graph-node').length === 5`), 'Graph did not persist')
    await waitFor(() => app.cdp.evaluate(`${stores}.get('settings').aiGraphRetrievalEnabled === true`), 'Persisted graph setting did not load')
    assert.equal(await app.cdp.evaluate(`window.lk.graphList().then(d => d.sources.every(s => s.note_id === ${JSON.stringify(noteId)} && !s.stale))`), true)
    assert.equal(app.cdp.events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0)
    await closeApp(app); app = null
    console.log('Graph Electron: extraction, cancel, preview, confirm, provenance, SVG, retrieval opt-out, stream stop and restart PASS')
  } catch (error) {
    if (app) console.error('UI diagnostic:', await app.cdp.evaluate(`({notes:${graph}?.data.notes, visibleOptions:[...document.querySelectorAll('.el-select-dropdown__item')].filter(e=>e.getClientRects().length).map(e=>e.textContent), dialogs:[...document.querySelectorAll('.el-dialog')].filter(e=>e.getClientRects().length).map(e=>e.textContent.slice(0,120))})`).catch(()=>null))
    throw error
  } finally { if (app) await closeApp(app); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); process.exitCode=1 })
