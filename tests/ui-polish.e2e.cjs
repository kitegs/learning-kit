// Real Electron UI, isolated profile, explicitly visible for the requested preview.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const existing = fs.readFileSync(path.join(__dirname, 'notebook-anchor.e2e.cjs'), 'utf8')
const setup = existing.slice(0, existing.indexOf('async function click(cdp, selector)')).replace('windowsHide: true', 'windowsHide: false').replace('`--remote-debugging-port=${port}`,', '`--remote-debugging-port=${port}`, "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",')
const context = { require, __dirname, process, console, WebSocket, fetch, setTimeout, clearTimeout }
vm.runInNewContext(setup + '\nglobalThis.helpers = { launchApp, closeApp, waitFor };', context)
const { launchApp, closeApp, waitFor } = context.helpers
const output = path.resolve(__dirname, '../artifacts/ui-polish')
fs.mkdirSync(output, { recursive: true })
function bounded(promise, name) {
  let timer
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${name} timed out`)), 12000) })]).finally(() => clearTimeout(timer))
}
async function capture(app, name) {
  await bounded(app.cdp.send('Page.bringToFront'), 'bring to front')
  await bounded(app.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }), 'focus')
  await bounded(app.cdp.evaluate(`(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()`), 'settled layout')
  const shot = await bounded(app.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }), 'screenshot')
  const file = path.join(output, name + '.png')
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
  console.log('Screenshot:', file)
}
async function main() {
  let app
  try {
    app = await launchApp()
    console.log('UI started')
    await waitFor(() => app.cdp.evaluate(`!!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings')?.systemPrompt`), 'Settings not ready')
    await app.cdp.evaluate(`(async () => {
      const stores = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s;
      const settings = stores.get('settings'); settings.testMode = true; await settings.setTheme('paper');
      const chat = stores.get('chat'); const conv = await chat.newConv(null, '把知识连接起来');
      await chat.saveNewMessage({ conversation_id: conv.id, role: 'user', content: '我想把今天读到的内容整理成能复习的知识，应该怎么开始？', turn_id: 'preview-turn', sort: 1 });
      await chat.saveNewMessage({ conversation_id: conv.id, role: 'assistant', content: '## 从一个小问题开始\\n\\n不必一次整理整本书。选出今天最有启发的一段，先用自己的话解释它。\\n\\n1. **理解**：它解决了什么问题？\\n2. **连接**：它和已有知识有什么关系？\\n3. **复习**：把最容易忘记的部分变成一道问答。\\n\\n> 学习的进展，不只是读过多少，而是能重新说清楚多少。', turn_id: 'preview-turn', sort: 2 });
      await chat.selectConv(conv.id);
    })()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelector('.chat-scroll')?.textContent.includes('从一个小问题开始')`), 'Demo conversation missing')
    await capture(app, 'workspace')
    await app.cdp.evaluate(`document.querySelector('[data-testid="dock-search"]').click()`)
    await waitFor(() => app.cdp.evaluate(`!!document.querySelector('.search-overlay')`), 'Direct search did not open')
    await app.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await app.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await app.cdp.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '设置').click()`)
    await waitFor(() => app.cdp.evaluate(`!!document.querySelector('[data-settings-tab="connection"]')`), 'Settings nav missing')
    assert.equal(await app.cdp.evaluate(`getComputedStyle(document.querySelector('[data-settings-panel="connection"]')).display !== 'none'`), true)
    await app.cdp.evaluate(`document.querySelector('[data-settings-tab="context"]').click()`)
    await capture(app, 'settings-context')
    await app.cdp.evaluate(`document.querySelector('[data-settings-tab="appearance"]').click()`)
    await capture(app, 'settings-appearance')
    await app.cdp.evaluate(`document.querySelector('[data-theme-choice="forest"]').click()`)
    await waitFor(() => app.cdp.evaluate(`document.documentElement.dataset.theme === 'forest'`), 'Theme card did not preview')
    await app.cdp.evaluate(`(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings'); s.theme = 'forest'; s.applyTheme(); s.model = 'discard-this-model'; s.apiKeys.deepseek = 'discard-this-key'; [...document.querySelectorAll('.el-dialog button')].find(b => b.textContent.trim() === '取消').click(); })()`)
    await waitFor(() => app.cdp.evaluate(`document.documentElement.dataset.theme === 'paper'`), 'Cancel did not restore theme')
    assert.equal(await app.cdp.evaluate(`window.lk.getSetting('apiKey.deepseek')`), null)
    assert.notEqual(await app.cdp.evaluate(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('settings').model`), 'discard-this-model')
    await app.cdp.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '设置').click()`)
    await waitFor(() => app.cdp.evaluate(`!!document.querySelector('[data-settings-tab="appearance"]')`), 'Settings missing on reopen')
    await app.cdp.evaluate(`document.querySelector('[data-settings-tab="appearance"]').click(); document.querySelector('[data-theme-choice="forest"]').click(); [...document.querySelectorAll('.el-dialog button')].find(b => b.textContent.trim() === '保存').click()`)
    await waitFor(() => app.cdp.evaluate(`window.lk.getSetting('theme').then(value => value === 'forest')`), 'Theme save failed')
    await closeApp(app); app = null
    app = await launchApp()
    await waitFor(() => app.cdp.evaluate(`document.documentElement.dataset.theme === 'forest'`), 'Persisted theme missing')
    await app.cdp.evaluate(`document.querySelector('[data-testid="dock-tools"]').click()`)
    await waitFor(() => app.cdp.evaluate(`document.querySelector('.el-drawer')?.textContent.includes('AI 工具管理中心')`), 'Direct tool center did not open')
    assert.equal(app.cdp.events.filter(event => event.method === 'Runtime.exceptionThrown').length, 0)
    await closeApp(app); app = null
    console.log('UI polish: navigation, category panels, cancel, restart and screenshots PASS')
  } finally { if (app) await closeApp(app) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
