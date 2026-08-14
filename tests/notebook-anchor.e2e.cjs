// End-to-end Electron UI test for notebook anchor persistence.
// Uses Electron's built-in Chromium DevTools Protocol; no browser-test package.

const { spawn } = require('child_process')
const { mkdtempSync, rmSync } = require('fs')
const { tmpdir } = require('os')
const { join, resolve } = require('path')

const ROOT = resolve(__dirname, '..')
const ELECTRON = require('electron')
const PROFILE = mkdtempSync(join(tmpdir(), 'learning-kit-anchor-e2e-'))
const TARGET_TITLE = `UI锚点目标-${Date.now()}`
const SOURCE_TITLE = `UI跨笔记目录-${Date.now()}`
const TARGET_TEXT = '跨笔记持久锚点'
const SOURCE_TEXT = '点击跳转到目标知识点'
let activeApp = null

function delay(ms) { return new Promise((resolveDelay) => setTimeout(resolveDelay, ms)) }

class CdpSession {
  constructor(url) {
    this.nextId = 1
    this.pending = new Map()
    this.socket = new WebSocket(url)
    this.events = []
  }

  async connect() {
    await new Promise((resolveOpen, reject) => {
      this.socket.addEventListener('open', resolveOpen, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (!message.id) {
        if (message.method === 'Runtime.exceptionThrown' || message.method === 'Runtime.consoleAPICalled') this.events.push(message)
        return
      }
      const request = this.pending.get(message.id)
      if (!request) return
      this.pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
    })
    await this.send('Runtime.enable')
    return this
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolveRequest, reject) => {
      this.pending.set(id, { resolve: resolveRequest, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    })
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
    }
    return response.result.value
  }

  close() { this.socket.close() }
}

async function waitFor(predicate, message, timeout = 10000) {
  const until = Date.now() + timeout
  let lastError
  while (Date.now() < until) {
    try {
      const value = await predicate()
      if (value) return value
    } catch (error) { lastError = error }
    await delay(100)
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ''}`)
}

async function connectToPage(port) {
  const targets = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`).catch(() => null)
    if (!response?.ok) return null
    const list = await response.json()
    return list.some((target) => target.type === 'page') ? list : null
  }, 'Electron DevTools endpoint did not become ready', 15000)
  const page = targets.find((target) => target.type === 'page')
  return new CdpSession(page.webSocketDebuggerUrl).connect()
}

async function launchApp() {
  const port = 19000 + Math.floor(Math.random() * 15000)
  const output = []
  const child = spawn(ELECTRON, [`--remote-debugging-port=${port}`, '.'], {
    cwd: ROOT,
    env: { ...process.env, ELECTRON_RENDERER_URL: '', LK_E2E_USER_DATA_DIR: PROFILE },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  child.stdout.on('data', (chunk) => output.push(String(chunk)))
  child.stderr.on('data', (chunk) => output.push(String(chunk)))
  child.once('exit', (code) => { if (code && activeApp?.child === child) activeApp.exitError = `Electron exited with ${code}` })
  const cdp = await connectToPage(port)
  activeApp = { child, cdp, output, exitError: '' }
  await waitFor(() => cdp.evaluate(`document.querySelector('.dock-root') ? true : false`), 'Learning Kit UI did not mount')
  return activeApp
}

async function closeApp(app) {
  const exited = new Promise((resolveExit) => app.child.once('exit', resolveExit))
  await app.cdp.evaluate(`window.close(); true`).catch(() => {})
  const result = await Promise.race([exited.then(() => true), delay(7000).then(() => false)])
  app.cdp.close()
  if (!result) throw new Error('Electron did not close after the save handshake')
  activeApp = null
}

async function click(cdp, selector) {
  const clicked = await cdp.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true })()`)
  if (!clicked) throw new Error(`Element not found: ${selector}`)
}

async function setInput(cdp, selector, value) {
  const changed = await cdp.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
  if (!changed) throw new Error(`Input not found: ${selector}`)
}

async function setPaperText(cdp, text) {
  const changed = await cdp.evaluate(`(() => {
    const el = document.querySelector('[data-testid="notebook-page-left"]');
    if (!el) return false;
    el.focus();
    el.innerHTML = '<p>' + ${JSON.stringify(text)} + '</p>';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(text)} }));
    return true;
  })()`)
  if (!changed) throw new Error('Left notebook page is not available')
}

async function selectTextAndOpenMenu(cdp, text) {
  const opened = await cdp.evaluate(`(() => {
    const el = document.querySelector('[data-testid="notebook-page-left"]');
    if (!el) return false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const start = node.textContent.indexOf(${JSON.stringify(text)});
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start); range.setEnd(node, start + ${JSON.stringify(text)}.length);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      const box = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 80, clientY: box.top + 80, button: 2 }));
      return true;
    }
    return false;
  })()`)
  if (!opened) throw new Error(`Could not select notebook text: ${text}`)
  await waitFor(() => cdp.evaluate(`document.querySelector('.cx-menu') ? true : false`), 'Context menu did not open')
}

async function clickMenu(cdp, label) {
  const clicked = await cdp.evaluate(`(() => {
    const items = [...document.querySelectorAll('[data-testid="context-menu-item"]')];
    const item = items.find((candidate) => candidate.dataset.label === ${JSON.stringify(label)});
    if (!item) return false; item.click(); return true;
  })()`)
  if (!clicked) throw new Error(`Context menu action not found: ${label}`)
}

async function clickButtonByText(cdp, label) {
  const clicked = await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(label)});
    if (!button) return false; button.click(); return true;
  })()`)
  if (!clicked) throw new Error(`Button not found: ${label}`)
}

async function chooseSelectOption(cdp, selector, label) {
  await click(cdp, selector)
  await waitFor(() => cdp.evaluate(`[
    ...document.querySelectorAll('.el-select-dropdown__item')
  ].some((item) => item.textContent.trim() === ${JSON.stringify(label)})`), `Select option did not open: ${label}`)
  const selected = await cdp.evaluate(`(() => {
    const option = [...document.querySelectorAll('.el-select-dropdown__item')].find((item) => item.textContent.trim() === ${JSON.stringify(label)});
    if (!option) return false; option.click(); return true;
  })()`)
  if (!selected) throw new Error(`Select option not found: ${label}`)
}

async function pasteClipboardScreenshot(cdp) {
  const pasted = await cdp.evaluate(`(() => {
    const el = document.querySelector('[data-testid="notebook-page-left"]');
    if (!el) return false;
    el.focus();
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (char) => char.charCodeAt(0));
    const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'clipboard-screenshot.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }));
    return true;
  })()`)
  if (!pasted) throw new Error('Notebook page was not available for screenshot paste')
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="notebook-page-left"] img[src^="data:image/png"]') ? true : false`), 'Clipboard screenshot was not inserted')
}

async function confirmPrompt(cdp) {
  await waitFor(() => cdp.evaluate(`document.querySelector('.el-message-box') ? true : false`), 'Location chooser did not open')
  const confirmed = await cdp.evaluate(`(() => {
    const box = document.querySelector('.el-message-box');
    const buttons = [...box.querySelectorAll('button')];
    const button = buttons.find((item) => item.classList.contains('el-button--primary')) || buttons.at(-1);
    if (!button) return false; button.click(); return true;
  })()`)
  if (!confirmed) throw new Error('Prompt confirmation button not found')
}

async function openNotes(cdp) {
  await click(cdp, '[data-testid="dock-mode-notes"]')
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="notebook-page-left"]') ? true : false`), 'Notebook did not open')
}

async function selectNoteByTitle(cdp, title) {
  const selector = `[data-note-title=${JSON.stringify(title)}]`
  await waitFor(() => cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}) ? true : false`), `Note tree item not found: ${title}`)
  await click(cdp, selector)
  await waitFor(() => cdp.evaluate(`document.querySelector('.title-in input')?.value === ${JSON.stringify(title)}`), `Note did not become active: ${title}`)
}

async function assertNavigation(cdp, blockId) {
  await waitFor(() => cdp.evaluate(`document.querySelector('.title-in input')?.value === ${JSON.stringify(TARGET_TITLE)}`), 'Cross-note link did not open the target note').catch(async (error) => {
    const state = await cdp.evaluate(`(async () => ({
      title: document.querySelector('.title-in input')?.value || '',
      hrefs: [...document.querySelectorAll('[data-testid="notebook-page-left"] a')].map((item) => item.getAttribute('href')),
      block: await window.lk.blockGet(${JSON.stringify(blockId)}),
      messages: [...document.querySelectorAll('.el-message')].map((item) => item.textContent),
      log: localStorage.getItem('lk_action_log')
    }))()`)
    throw new Error(`${error.message}; state=${JSON.stringify(state)}; runtime=${JSON.stringify(cdp.events.slice(-10))}`)
  })
  const located = await waitFor(() => cdp.evaluate(`(async () => {
    const block = await window.lk.blockGet(${JSON.stringify(blockId)});
    const anchor = JSON.parse(block.anchor || '{}');
    const element = document.getElementById(anchor.anchorId || '');
    return !!element && element.classList.contains('revealed');
  })()`), 'Target anchor was not revealed').catch(async (error) => {
    const state = await cdp.evaluate(`(async () => {
      const block = await window.lk.blockGet(${JSON.stringify(blockId)});
      const anchor = JSON.parse(block.anchor || '{}');
      return {
        title: document.querySelector('.title-in input')?.value || '',
        anchor,
        anchorFound: !!document.getElementById(anchor.anchorId || ''),
        body: document.querySelector('[data-testid="notebook-page-left"]')?.innerHTML || '',
        messages: [...document.querySelectorAll('.el-message')].map((item) => item.textContent)
      };
    })()`)
    throw new Error(`${error.message}; state=${JSON.stringify(state)}; runtime=${JSON.stringify(cdp.events.slice(-10))}`)
  })
  if (!located) throw new Error('Target anchor was not revealed')
}

async function firstRun() {
  const { cdp } = await launchApp()
  await openNotes(cdp)
  await setInput(cdp, '.title-in input', TARGET_TITLE)
  await cdp.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true })); true`)
  await waitFor(() => cdp.evaluate(`(() => { const input = document.querySelector('.title-in input'); return document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === input.value.length })()`), 'F2 did not focus and select the note title')
  await setPaperText(cdp, `目标正文：${TARGET_TEXT}`)

  await selectTextAndOpenMenu(cdp, TARGET_TEXT)
  await cdp.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', ctrlKey: true, altKey: true, bubbles: true })); true`)
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="notebook-page-left"] h1') ? true : false`), 'Heading shortcut did not create H1')
  await click(cdp, '.cx-overlay')
  await click(cdp, '[data-testid="notebook-outline-toggle"]')
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="notebook-outline"] .outline-entry') ? true : false`), 'Notebook outline did not list the heading')
  await click(cdp, '[data-testid="notebook-outline"] .outline-entry')
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="notebook-page-left"] h1.heading-revealed') ? true : false`), 'Notebook outline did not locate the heading')
  await click(cdp, '[data-testid="notebook-outline-toggle"]')

  await clickButtonByText(cdp, '字体与版式')
  await chooseSelectOption(cdp, '[data-testid="notebook-font-family"]', '微软雅黑')
  await chooseSelectOption(cdp, '[data-testid="notebook-font-size"]', '24px')
  await waitFor(() => cdp.evaluate(`(() => { const el = document.querySelector('[data-testid="notebook-page-left"]'); const style = getComputedStyle(el); return style.fontSize === '24px' && style.fontFamily.includes('Microsoft YaHei') })()`), 'Font family or size did not update')
  await pasteClipboardScreenshot(cdp)

  await selectTextAndOpenMenu(cdp, TARGET_TEXT)
  await clickMenu(cdp, '复制当前位置链接')

  const savedLocation = await waitFor(() => cdp.evaluate(`localStorage.getItem('lk_last_note_location') || ''`), 'Anchor location was not stored').catch(async (error) => {
    const state = await cdp.evaluate(`(async () => ({
      notes: await window.lk.notesList(),
      blocks: await window.lk.blockList(),
      messages: [...document.querySelectorAll('.el-message')].map((item) => item.textContent),
      body: document.querySelector('[data-testid="notebook-page-left"]')?.innerHTML || '',
      menuVisible: !!document.querySelector('.cx-menu')
    }))()`)
    throw new Error(`${error.message}; state=${JSON.stringify(state)}; runtime=${JSON.stringify(cdp.events.slice(-10))}`)
  })
  const blockId = JSON.parse(savedLocation).href.replace('app://block/', '')
  await waitFor(() => cdp.evaluate(`window.lk.blockGet(${JSON.stringify(blockId)}).then(Boolean)`), 'Anchor block was not persisted')

  await click(cdp, '[data-testid="new-note"]')
  await waitFor(() => cdp.evaluate(`document.querySelectorAll('[data-note-title]').length >= 2`), 'Second note was not created')
  await setInput(cdp, '.title-in input', SOURCE_TITLE)
  await setPaperText(cdp, SOURCE_TEXT)
  await selectTextAndOpenMenu(cdp, SOURCE_TEXT)
  await clickMenu(cdp, '链接到笔记位置…')
  await confirmPrompt(cdp)
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="notebook-page-left"] a[href="app://block/${blockId}"]') ? true : false`), 'Cross-note link was not inserted')

  await click(cdp, `[data-testid="notebook-page-left"] a[href="app://block/${blockId}"]`)
  await assertNavigation(cdp, blockId)
  await closeApp(activeApp)
  return blockId
}

async function secondRun(blockId) {
  const { cdp } = await launchApp()
  await openNotes(cdp)
  await selectNoteByTitle(cdp, SOURCE_TITLE)
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="notebook-page-left"] a[href="app://block/${blockId}"]') ? true : false`), 'Saved cross-note link was missing after restart')
  await click(cdp, `[data-testid="notebook-page-left"] a[href="app://block/${blockId}"]`)
  await assertNavigation(cdp, blockId)
  await waitFor(() => cdp.evaluate(`(() => { const page = document.querySelector('[data-testid="notebook-page-left"]'); const style = getComputedStyle(page); return !!page.querySelector('img[src^="data:image/png"]') && !!page.querySelector('h1') && style.fontSize === '24px' && style.fontFamily.includes('Microsoft YaHei') })()`), 'Heading, screenshot or font settings were missing after restart')
  await closeApp(activeApp)
}

async function main() {
  try {
    console.log('Learning Kit — 笔记锚点 UI 测试')
    const blockId = await firstRun()
    console.log('  ✓ F2、目录、字体、截图、锚点及跨笔记定位')
    await secondRun(blockId)
    console.log('  ✓ 退出重启后链接和锚点仍可定位')
    console.log('\n━━━ 结果: 2 通过, 0 失败 ━━━')
  } catch (error) {
    console.error(`\n  ✗ ${error.stack || error}`)
    if (activeApp?.output.length) console.error('\nElectron output:\n' + activeApp.output.join('').slice(-8000))
    process.exitCode = 1
  } finally {
    if (activeApp?.child && !activeApp.child.killed) activeApp.child.kill()
    await delay(300)
    rmSync(PROFILE, { recursive: true, force: true })
  }
}

main()
