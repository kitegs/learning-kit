// End-to-end Electron UI test for notebook anchor persistence.
// Uses Electron's built-in Chromium DevTools Protocol; no browser-test package.

const { spawn } = require('child_process')
const { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('fs')
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
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="notebook-page-left"]')?.textContent?.includes(${JSON.stringify(text)}) || false`), `Notebook text did not become ready: ${text}`)
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

async function pasteMarkdownFixture(cdp, noteTitle) {
  const source = readFileSync(join(ROOT, 'tests', 'fixtures', 'notebook-paste-math.md'), 'utf8')
  const pasted = await cdp.evaluate(`(() => {
    const el = document.querySelector('[data-testid="notebook-page-left"]');
    if (!el) return false;
    el.focus();
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const transfer = new DataTransfer(); transfer.setData('text/plain', ${JSON.stringify(source)});
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }));
    return true;
  })()`)
  if (!pasted) throw new Error('Notebook page was not available for Markdown paste')
  await waitFor(() => cdp.evaluate(`(async () => {
    const note = (await window.lk.notesList()).find((item) => item.title === ${JSON.stringify(noteTitle)});
    if (!note) return false;
    const saved = await window.lk.notesGet(note.id);
    const body = String(saved?.body || '');
    return body.includes('katex-block') && body.includes('<ol') && body.includes('观察') && body.includes('触发词') && body.includes('操作') && body.includes('<table') && !body.includes('$$') && !body.includes('\\\\[');
  })()`), 'Markdown paste lost math, list items or table after pagination and autosave', 15000)
}

async function pasteBracketFormulaWithoutEscapedDelimiters(cdp, noteTitle) {
  const source = `[\n\\lim_{x\\to 0} \\frac{\\sin x}{x}=1\n]`
  const pasted = await cdp.evaluate(`(() => {
    const el = document.querySelector('[data-testid="notebook-page-left"]');
    if (!el) return false;
    el.focus();
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const transfer = new DataTransfer(); transfer.setData('text/plain', ${JSON.stringify(source)});
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }));
    return true;
  })()`)
  if (!pasted) throw new Error('Notebook page was not available for stripped-delimiter formula paste')
  await waitFor(() => cdp.evaluate(`(async () => {
    const note = (await window.lk.notesList()).find((item) => item.title === ${JSON.stringify(noteTitle)});
    const saved = note ? await window.lk.notesGet(note.id) : null;
    const body = String(saved?.body || '');
    return (body.match(/katex-block/g) || []).length >= 3 && !body.includes('<p>[</p>');
  })()`), 'Formula with stripped bracket escapes remained visible as source', 15000)
}

async function testWholeNotebookSelection(cdp) {
  const result = await cdp.evaluate(`(async () => {
    const page = document.querySelector('[data-testid="notebook-page-left"]');
    if (!page) return null;
    page.focus();
    page.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
    await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    const transfer = new DataTransfer();
    page.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: transfer }));
    const state = {
      selected: document.querySelector('.book-table')?.classList.contains('whole-selected') || false,
      hint: document.querySelector('.whole-selection-hint')?.textContent || '',
      plain: transfer.getData('text/plain'),
      html: transfer.getData('text/html')
    };
    page.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return state;
  })()`)
  if (!result?.selected || !result.hint.includes('已全选整本')) throw new Error('Ctrl+A did not enter whole-notebook selection mode')
  if (!result.plain.includes('第 1 页') || !result.plain.includes('第 2 页') || !result.plain.includes('目标正文')) throw new Error('Whole-notebook copy did not include text from all logical pages')
  if (!result.html.includes('data-lk-notebook-selection') || !result.html.includes('data-lk-page="2"')) throw new Error('Whole-notebook rich clipboard payload lost page boundaries')
}

async function testInkSettingsAndUndo(cdp) {
  await click(cdp, '[data-testid="notebook-ink-settings"]')
  await waitFor(() => cdp.evaluate(`(() => {
    const popper = [...document.querySelectorAll('.el-popper')].find((item) => item.textContent.includes('荧光宽度') && item.textContent.includes('透明度'));
    return !!popper && getComputedStyle(popper).display !== 'none';
  })()`), 'Annotation parameter popover did not open')
  await clickButtonByText(cdp, '荧光笔')
  await click(cdp, '[data-testid="notebook-ink-settings"]')

  const point = await cdp.evaluate(`(() => {
    const canvas = document.querySelector('.left-paper canvas.ink');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + rect.width * .38, y: rect.top + rect.height * .4 };
  })()`)
  if (!point) throw new Error('Notebook ink canvas was not available')
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + 90, y: point.y + 2, button: 'left', buttons: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x + 90, y: point.y + 2, button: 'left', buttons: 0, clickCount: 1 })
  await waitFor(() => cdp.evaluate(`(() => {
    const canvas = document.querySelector('.left-paper canvas.ink');
    const pixels = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!pixels) return false;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0 && pixels[index] < 255) return true;
    return false;
  })()`), 'Highlighter did not render translucent pixels')
  await cdp.evaluate(`document.querySelector('.book-table').dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); true`)
  await waitFor(() => cdp.evaluate(`(() => {
    const canvas = document.querySelector('.left-paper canvas.ink');
    const pixels = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!pixels) return false;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) return false;
    return true;
  })()`), 'Ctrl+Z did not remove the highlighter operation')
}

async function pasteAppLink(cdp, href) {
  const pasted = await cdp.evaluate(`(() => {
    const el = document.querySelector('[data-testid="notebook-page-left"]');
    if (!el) return false;
    el.focus();
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const transfer = new DataTransfer(); transfer.setData('text/plain', ${JSON.stringify(href)});
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }));
    return true;
  })()`)
  if (!pasted) throw new Error('Notebook page was not available for app-link paste')
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="notebook-page-left"] a[href=${JSON.stringify(href)}]') ? true : false`), 'Pasted app link was not auto-detected')
}

async function clickLastAppLink(cdp, href) {
  const clicked = await cdp.evaluate(`(() => {
    const links = [...document.querySelectorAll('[data-testid="notebook-page-left"] a[href=${JSON.stringify(href)}]')];
    const link = links.at(-1); if (!link) return false; link.click(); return true;
  })()`)
  if (!clicked) throw new Error('Auto-detected app link was not clickable')
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

async function testCollapsibleNoteNavigation(cdp) {
  await click(cdp, '[data-testid="note-nav-toggle"]')
  await waitFor(() => cdp.evaluate(`document.querySelector('.side')?.classList.contains('collapsed') && document.querySelector('.side')?.getBoundingClientRect().width <= 44`), 'Note navigation did not collapse to the compact rail')
  await click(cdp, '.side-rail button[title="笔记库"]')
  await waitFor(() => cdp.evaluate(`!document.querySelector('.side')?.classList.contains('collapsed') && document.querySelector('.side')?.getBoundingClientRect().width >= 200 && localStorage.getItem('lk_notes_nav_open') === 'true'`), 'Note navigation did not reopen or persist its state')
}

async function testNotebookWorkspacePan(cdp) {
  const start = await cdp.evaluate(`(() => {
    const table = document.querySelector('.book-table');
    const spread = document.querySelector('.book-spread');
    if (!table || !spread) return null;
    const rect = table.getBoundingClientRect();
    for (let y = rect.top + 8; y < rect.bottom - 8; y += 24) {
      for (const candidate of [{ x: rect.left + 8, direction: 1 }, { x: rect.right - 8, direction: -1 }]) {
        if (document.elementFromPoint(candidate.x, y) === table) return { x: candidate.x, y, direction: candidate.direction, before: spread.style.transform };
      }
    }
    return null;
  })()`)
  if (!start) throw new Error('No blank notebook workspace point was available for panning')
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 })
  await waitFor(() => cdp.evaluate(`document.querySelector('.book-table')?.classList.contains('grabbing') || false`), 'Blank workspace did not enter paper-grab mode')
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + start.direction * 20, y: start.y + 12, button: 'left', buttons: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + start.direction * 42, y: start.y + 26, button: 'left', buttons: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: start.x + start.direction * 42, y: start.y + 26, button: 'left', buttons: 0, clickCount: 1 })
  await waitFor(() => cdp.evaluate(`document.querySelector('.book-spread')?.style.transform !== ${JSON.stringify(start.before)}`), 'Dragging blank notebook workspace did not move the paper')
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
  await testCollapsibleNoteNavigation(cdp)
  await testNotebookWorkspacePan(cdp)
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
  await clickButtonByText(cdp, '本篇章节')
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="note-chapter-nav"] .chapter-item') ? true : false`), 'Shared chapter navigation did not receive the notebook heading')
  await click(cdp, '[data-testid="note-chapter-nav"] .chapter-item')
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="notebook-page-left"] h1.heading-revealed') ? true : false`), 'Shared chapter navigation did not locate the heading')
  await clickButtonByText(cdp, '笔记库')

  await clickButtonByText(cdp, '版式')
  await chooseSelectOption(cdp, '[data-testid="notebook-font-family"]', '微软雅黑')
  await chooseSelectOption(cdp, '[data-testid="notebook-font-size"]', '24px')
  await waitFor(() => cdp.evaluate(`(() => { const el = document.querySelector('[data-testid="notebook-page-left"]'); const style = getComputedStyle(el); return style.fontSize === '24px' && style.fontFamily.includes('Microsoft YaHei') })()`), 'Font family or size did not update')
  await click(cdp, '[data-testid="notebook-global-layout"]')
  await waitFor(() => cdp.evaluate(`(() => { try { const saved = JSON.parse(localStorage.getItem('lk_notebook_global_layout_v1') || '{}'); return localStorage.getItem('lk_notebook_global_layout_enabled_v1') === 'true' && saved.fontFamily === 'sans' && saved.fontSize === 24; } catch { return false } })()`), 'Shared notebook layout preference was not enabled and persisted')
  await pasteClipboardScreenshot(cdp)
  await testInkSettingsAndUndo(cdp)

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
  await waitFor(() => cdp.evaluate(`(() => { const el = document.querySelector('[data-testid="notebook-page-left"]'); const style = el ? getComputedStyle(el) : null; return style?.fontSize === '24px' && style.fontFamily.includes('Microsoft YaHei') })()`), 'New note did not inherit the shared notebook layout')
  await setPaperText(cdp, SOURCE_TEXT)
  await selectTextAndOpenMenu(cdp, SOURCE_TEXT)
  await clickMenu(cdp, '链接到笔记位置…')
  await confirmPrompt(cdp)
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="notebook-page-left"] a[href="app://block/${blockId}"]') ? true : false`), 'Cross-note link was not inserted')

  await click(cdp, `[data-testid="notebook-page-left"] a[href="app://block/${blockId}"]`)
  await assertNavigation(cdp, blockId)
  await selectNoteByTitle(cdp, SOURCE_TITLE)
  await pasteAppLink(cdp, `app://block/${blockId}`)
  await clickLastAppLink(cdp, `app://block/${blockId}`)
  await assertNavigation(cdp, blockId)
  await pasteMarkdownFixture(cdp, TARGET_TITLE)
  await pasteBracketFormulaWithoutEscapedDelimiters(cdp, TARGET_TITLE)
  await testWholeNotebookSelection(cdp)
  await closeApp(activeApp)
  return blockId
}

async function secondRun(blockId) {
  const { cdp } = await launchApp()
  await openNotes(cdp)
  await selectNoteByTitle(cdp, SOURCE_TITLE)
  await waitFor(() => cdp.evaluate(`document.querySelectorAll('[data-testid="notebook-page-left"] a[href="app://block/${blockId}"]').length >= 2`), 'Saved cross-note link was missing after restart')
  await clickLastAppLink(cdp, `app://block/${blockId}`)
  await assertNavigation(cdp, blockId)
  await waitFor(() => cdp.evaluate(`(() => { const page = document.querySelector('[data-testid="notebook-page-left"]'); const style = getComputedStyle(page); return !!page.querySelector('img[src^="data:image/png"]') && !!page.querySelector('h1') && style.fontSize === '24px' && style.fontFamily.includes('Microsoft YaHei') })()`), 'Heading, screenshot or font settings were missing after restart')
  await closeApp(activeApp)
}

async function databaseRecoveryRun() {
  const sentinel = `database-recovery-${Date.now()}`
  let app = await launchApp()
  await app.cdp.evaluate(`window.lk.setSetting('e2e:database-recovery', ${JSON.stringify(sentinel)})`)
  const saved = await app.cdp.evaluate(`window.lk.databaseRetrySave()`)
  if (!saved) throw new Error('Database retry save did not succeed before corruption test')
  await closeApp(app)

  const dataDir = join(PROFILE, 'data')
  const databasePath = join(dataDir, 'learning-kit-v3.db')
  const backupPath = `${databasePath}.last-good.bak`
  if (!existsSync(backupPath)) throw new Error('Automatic last-good database backup was not created')
  writeFileSync(databasePath, 'intentionally-corrupted-database')

  app = await launchApp()
  await waitFor(() => app.cdp.evaluate(`window.lk.getSetting('e2e:database-recovery').then((value) => value === ${JSON.stringify(sentinel)})`), 'Saved data was not recovered from the last-good database')
  const corruptCopies = readdirSync(dataDir).filter((name) => name.startsWith('learning-kit-v3.db.corrupt-'))
  if (!corruptCopies.length) throw new Error('Corrupted primary database was not preserved for diagnosis')
  await closeApp(app)
}

async function main() {
  try {
    if (process.argv.includes('--database-recovery')) {
      console.log('Learning Kit — 数据库恢复 UI 测试')
      await databaseRecoveryRun()
      console.log('  ✓ 主数据库损坏后从最近有效副本恢复并保留异常文件')
      console.log('\n━━━ 结果: 1 通过, 0 失败 ━━━')
      return
    }
    console.log('Learning Kit — 笔记锚点 UI 测试')
    const blockId = await firstRun()
    console.log('  ✓ 可折叠笔记/章节导航、全局版式继承、空白区拖动、F2、截图、Markdown/公式粘贴、整本全选、荧光笔参数、撤销及跨笔记定位')
    await secondRun(blockId)
    console.log('  ✓ 退出重启后手动与自动识别链接均可定位')
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
