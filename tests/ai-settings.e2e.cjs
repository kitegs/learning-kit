// Run the real Electron settings UI with a disposable profile; never read user data.
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const assert = require('node:assert/strict')
const existing = fs.readFileSync(path.join(__dirname, 'notebook-anchor.e2e.cjs'), 'utf8')
const setup = existing.slice(0, existing.indexOf('async function click(cdp, selector)'))
const context = { require, __dirname, process, console, WebSocket, fetch, setTimeout, clearTimeout }
vm.runInNewContext(setup + '\nglobalThis.helpers = { launchApp, closeApp, waitFor };', context)
const { launchApp, closeApp, waitFor } = context.helpers
async function main() {
  let app
  try {
    app = await launchApp()
    await waitFor(() => app.cdp.evaluate(`!!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings')?.systemPrompt`), 'Settings did not load')
    await app.cdp.evaluate(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').testMode = true`)
    await app.cdp.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '设置').click()`)
    await app.cdp.evaluate(`document.querySelector('[data-settings-tab="context"]').click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelectorAll('.ai-switches .el-switch').length === 4`), 'AI controls missing')
    assert.equal(await app.cdp.evaluate(`document.querySelector('.retrieval-setting .el-switch').classList.contains('is-checked')`), false)
    await app.cdp.evaluate(`document.querySelector('.context-budget').scrollIntoView({ block: 'center' })`)
    assert.equal(await app.cdp.evaluate(`(() => { const body = document.querySelector('.lk-settings-dialog .el-dialog__body'); return body.clientHeight <= innerHeight * 0.65 + 1 && getComputedStyle(body).overflowY === 'auto'; })()`), true, 'Settings body must scroll within viewport')
    await app.cdp.evaluate(`document.querySelector('.retrieval-setting .el-switch').click(); (() => { const input = document.querySelector('.context-budget input'); input.value = '4096'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); input.blur(); })()`)
    await app.cdp.evaluate(`document.querySelectorAll('.ai-switches .el-switch').forEach(el => el.click()); document.querySelector('[data-settings-tab="prompt"]').click(); [...document.querySelectorAll('.el-form-item')].find(el => el.textContent.includes('自定义指令')).querySelector('.el-switch').click()`)
    await app.cdp.evaluate(`(() => { const el = document.querySelector('textarea[placeholder^="例如：优先用中文"]'); el.value = '测试自定义指令：回答使用中文。'; el.dispatchEvent(new Event('input', { bubbles: true })); })()`)
    await app.cdp.evaluate(`[...document.querySelectorAll('.el-dialog button')].find(b => b.textContent.trim() === '保存').click()`)
    await waitFor(() => app.cdp.evaluate(`window.lk.getSetting('customSystemPrompt').then(v => v === '测试自定义指令：回答使用中文。')`), 'Prompt did not save')
    await closeApp(app); app = null
    app = await launchApp()
    await waitFor(() => app.cdp.evaluate(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings')?.customSystemPromptEnabled`), 'Prompt toggle not restored')
    const result = await app.cdp.evaluate(`(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings'); return { prompt: s.customSystemPrompt, flags: [s.aiIncludeHistory, s.aiIncludeNoteContext, s.aiIncludeProgressContext, s.aiToolProposalsEnabled] }; })()`)
    assert.equal(result.prompt, '测试自定义指令：回答使用中文。')
    assert.deepEqual(Array.from(result.flags), [false, false, false, false])
    assert.equal(await app.cdp.evaluate(`window.lk.getSetting('aiInputBudget')`), '4096')
    assert.equal(await app.cdp.evaluate(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').aiRetrievalEnabled`), true)
    await app.cdp.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '设置').click()`)
    await waitFor(() => app.cdp.evaluate(`!!document.querySelector('.retrieval-setting .el-switch')`), 'Retrieval controls missing after restart')
    await app.cdp.evaluate(`document.querySelector('[data-settings-tab="context"]').click()`)
    await app.cdp.evaluate(`document.querySelector('.retrieval-setting .el-switch').click(); [...document.querySelectorAll('.el-dialog button')].find(b => b.textContent.trim() === '取消').click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').aiRetrievalEnabled === true`), 'Cancel did not restore retrieval preference')
    const proposal = await app.cdp.evaluate(`window.lk.toolProposeInternal({ action: 'create_flashcard', params: { question: 'UI 闪卡问题', answer: 'UI 闪卡答案' } })`)
    assert.equal(proposal.status, 'pending_confirmation')
    await closeApp(app); app = null
    app = await launchApp()
    await waitFor(() => app.cdp.evaluate(`!!document.querySelector('.utility-bar button')`), 'Composer missing')
    await app.cdp.evaluate(`document.querySelector('.utility-bar button').click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelector('.proposal-list')?.textContent.includes('UI 闪卡问题')`), 'Pending card not restored')
    await app.cdp.evaluate(`[...document.querySelectorAll('.el-drawer button')].find(b => b.textContent.includes('确认执行')).click()`)
    await waitFor(() => app.cdp.evaluate(`window.lk.cardAll().then(rows => rows.some(row => row.front === 'UI 闪卡问题'))`), 'Confirmed card missing')
    await closeApp(app); app = null
    app = await launchApp()
    await waitFor(() => app.cdp.evaluate(`window.lk.cardAll().then(rows => rows.some(row => row.front === 'UI 闪卡问题'))`), 'Card not persisted')
    const undone = await app.cdp.evaluate(`window.lk.toolUndo(${JSON.stringify(proposal.operationId)})`)
    assert.equal(undone.status, 'undone')
    assert.equal(await app.cdp.evaluate(`window.lk.cardAll().then(rows => rows.some(row => row.front === 'UI 闪卡问题'))`), false)
    const artifacts = await app.cdp.evaluate(`Promise.all([
      { action: 'create_knowledge_point', params: { title: 'UI 闭包知识点', description: '来自 AI 的未核实来源' } },
      { action: 'create_diagram', params: { title: 'UI Drawio', xml: '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" vertex="1" parent="1" value="UI 节点"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel>' } },
      { action: 'create_mindmap', params: { title: 'UI 导图', body: '# UI 导图\\n- 节点' } },
      { action: 'create_plan', params: { title: 'UI 计划', plan: { goal: '学习', weeks: [{ week: 1, tasks: ['阅读'] }] } } },
      { action: 'create_exercise_set', params: { title: 'UI 习题集', questions: [{ prompt: '问题', answer: '答案' }] } },
      { action: 'create_conversation', params: { title: 'UI 新对话' } }
    ].map(input => window.lk.toolProposeInternal(input)))`)
    assert.ok(artifacts.every(item => item.status === 'pending_confirmation'))
    await app.cdp.evaluate(`document.querySelector('.utility-bar button').click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelectorAll('.proposal-list .proposal').length === 6`), 'Artifact previews missing')
    assert.equal(await app.cdp.evaluate(`document.querySelectorAll('.graph-preview svg rect').length`), 1)
    assert.equal(await app.cdp.evaluate(`window.lk.kpList(null).then(rows => rows.some(row => row.title === 'UI 闭包知识点'))`), false)
    assert.equal(await app.cdp.evaluate(`window.lk.diagList().then(rows => rows.some(row => row.title === 'UI Drawio'))`), false)
    await app.cdp.evaluate(`[...document.querySelectorAll('.el-drawer button')].find(b => b.textContent.includes('确认执行')).click()`)
    await waitFor(() => app.cdp.evaluate(`window.lk.toolOperations({ status: 'applied' }).then(rows => rows.length === 6)`), 'Artifact approval failed')
    await closeApp(app); app = null
    app = await launchApp()
    assert.equal(await app.cdp.evaluate(`window.lk.mindmapList().then(rows => rows.some(row => row.title === 'UI 导图'))`), true)
    assert.equal(await app.cdp.evaluate(`window.lk.planList().then(rows => rows.some(row => row.title === 'UI 计划'))`), true)
    assert.equal(await app.cdp.evaluate(`window.lk.diagList().then(rows => rows.some(row => row.title === 'UI Drawio' && row.format === 'drawio' && row.xml.includes('UI 节点')))`), true)
    await app.cdp.evaluate(`document.querySelector('[data-testid="dock-mode-knowledge"]').click()`)
    await waitFor(() => app.cdp.evaluate(`!!document.querySelector('.knowledge-root')`), 'Knowledge view missing')
    await app.cdp.evaluate(`[...document.querySelectorAll('.filter')].find(button => button.textContent.includes('知识点')).click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelector('.note-grid')?.textContent.includes('UI 闭包知识点')`), 'Saved knowledge point not visible')
    await app.cdp.evaluate(`document.querySelector('.note-grid .note-card').click()`)
    await waitFor(() => app.cdp.evaluate(`!!document.querySelector('input[placeholder="知识点标题"]')`), 'Knowledge editor missing')
    await app.cdp.evaluate(`(() => { const input = document.querySelector('input[placeholder="知识点标题"]'); input.value = 'UI 编辑后知识点'; input.dispatchEvent(new Event('input', { bubbles: true })); [...document.querySelectorAll('.el-dialog button')].find(button => button.textContent.includes('保存知识点')).click(); })()`)
    await waitFor(() => app.cdp.evaluate(`window.lk.kpList(null).then(rows => rows.some(row => row.title === 'UI 编辑后知识点'))`), 'Knowledge edit not saved')
    assert.equal((await app.cdp.evaluate(`window.lk.toolUndo(${JSON.stringify(artifacts[0].operationId)})`)).status, 'failed')
    await app.cdp.evaluate(`document.querySelector('[data-testid="dock-mode-mindmap"]').click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelector('.tree-scroll')?.textContent.includes('UI Drawio')`), 'Saved diagram not in editor list')
    await app.cdp.evaluate(`[...document.querySelectorAll('.tree-item')].find(item => item.textContent.includes('UI Drawio')).click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelector('.mm-root .toolbar .title')?.textContent === 'UI Drawio'`), 'Diagram did not open')
    for (const item of artifacts.slice(1)) assert.equal((await app.cdp.evaluate(`window.lk.toolUndo(${JSON.stringify(item.operationId)})`)).status, 'undone')
    assert.equal(app.cdp.events.filter(event => event.method === 'Runtime.exceptionThrown').length, 0)
    await closeApp(app); app = null
    console.log('AI Electron UI: settings, pending proposal restart, confirm flashcard, persisted card and undo PASS')
  } finally { if (app) await closeApp(app) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
