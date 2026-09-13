// Real UI and restart persistence, using an isolated Electron profile.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const existing = fs.readFileSync(path.join(__dirname, 'notebook-anchor.e2e.cjs'), 'utf8')
const setup = existing.slice(0, existing.indexOf('async function click(cdp, selector)'))
const context = { require, __dirname, process, console, WebSocket, fetch, setTimeout, clearTimeout }
vm.runInNewContext(setup + '\nglobalThis.helpers = { launchApp, closeApp, waitFor };', context)
const { launchApp, closeApp, waitFor } = context.helpers
const chat = `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('chat')`
async function main() {
  let app
  const button = async text => app.cdp.evaluate(`[...document.querySelectorAll('button')].find(b => b.getClientRects().length && b.textContent.trim() === ${JSON.stringify(text)}).click()`)
  const open = async () => {
    await app.cdp.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Prompt ·')).click()`)
    await waitFor(() => app.cdp.evaluate(`!![...document.querySelectorAll('.el-radio-button')].find(b => b.getClientRects().length && !b.classList.contains('is-disabled'))`), 'Prompt dialog not ready')
  }
  const mode = async label => app.cdp.evaluate(`[...document.querySelectorAll('.el-radio-button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`)
  const draft = async value => app.cdp.evaluate(`(() => { const el = document.querySelector('[data-testid="conversation-prompt-input"] textarea'); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  const saved = async (id, expectedMode, expectedText) => waitFor(() => app.cdp.evaluate(`${chat}.loadConversationPrompt(${JSON.stringify(id)}).then(v => v.mode === ${JSON.stringify(expectedMode)} && v.text === ${JSON.stringify(expectedText)})`), 'Saved prompt mismatch')
  try {
    app = await launchApp()
    const ids = await app.cdp.evaluate(`(async () => { const c = ${chat}; const a = await c.newConv(null, '编程学习'); const b = await c.newConv(null, '英语练习'); await c.selectConv(a.id); return [a.id,b.id]; })()`)
    await open(); await mode('本对话专属'); await button('编程导师')
    assert.ok(await app.cdp.evaluate(`document.querySelector('[data-testid="conversation-prompt-input"] textarea').value.includes('编程导师')`))
    await draft('Teach coding only'); await button('保存到本对话'); await saved(ids[0], 'custom', 'Teach coding only')
    await app.cdp.evaluate(`${chat}.selectConv(${JSON.stringify(ids[1])})`)
    await waitFor(() => app.cdp.evaluate(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Prompt · 全局'))`), 'Second conversation did not inherit')
    await open(); await mode('本对话专属'); await draft('Teach English only'); await button('保存到本对话'); await saved(ids[1], 'custom', 'Teach English only')
    await open(); await draft('discard me'); await button('取消'); await saved(ids[1], 'custom', 'Teach English only')
    await open(); await mode('不追加自定义'); await button('保存到本对话'); await saved(ids[1], 'none', 'Teach English only')
    assert.equal(app.cdp.events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0)
    await closeApp(app); app = null
    app = await launchApp()
    await saved(ids[0], 'custom', 'Teach coding only'); await saved(ids[1], 'none', 'Teach English only')
    await app.cdp.evaluate(`${chat}.selectConv(${JSON.stringify(ids[0])})`)
    await open()
    assert.equal(await app.cdp.evaluate(`document.querySelector('[data-testid="conversation-prompt-input"] textarea').value`), 'Teach coding only')
    await mode('继承全局'); await button('保存到本对话'); await saved(ids[0], 'inherit', 'Teach coding only')
    assert.equal(app.cdp.events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0)
    await closeApp(app); app = null
    console.log('Conversation prompts: templates, editing, isolation, cancel, modes and restart PASS')
  } finally { if (app) await closeApp(app) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
