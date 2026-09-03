// End-to-end Electron UI test for PDF reading state and annotations.
// Uses a disposable profile and a generated PDF; never touches user data.

const { spawn } = require('child_process')
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('fs')
const { tmpdir } = require('os')
const { join, resolve } = require('path')
const initSqlJs = require('sql.js')

const ROOT = resolve(__dirname, '..')
const ELECTRON = require('electron')
const PROFILE = mkdtempSync(join(tmpdir(), 'learning-kit-pdf-e2e-'))
const BOOK_ID = `pdf-e2e-${Date.now()}`
const BOOK_TITLE = `PDF 阅读回归-${Date.now()}`
const STICKY_TEXT = '切换与重启后仍然存在的便签'
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
    const response = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
    return response.result.value
  }

  close() { this.socket.close() }
}

async function waitFor(predicate, message, timeout = 12000) {
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
  return new CdpSession(targets.find((target) => target.type === 'page').webSocketDebuggerUrl).connect()
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
  const cdp = await connectToPage(port)
  activeApp = { child, cdp, output }
  await waitFor(() => cdp.evaluate(`!!document.querySelector('.dock-root')`), 'Learning Kit UI did not mount')
  return activeApp
}

async function closeApp(app) {
  const exited = new Promise((resolveExit) => app.child.once('exit', resolveExit))
  await app.cdp.evaluate(`window.close(); true`).catch(() => {})
  const closed = await Promise.race([exited.then(() => true), delay(7000).then(() => false)])
  app.cdp.close()
  if (!closed) throw new Error('Electron did not close after the save handshake')
  activeApp = null
}

function makePdf(filePath) {
  const pageStream = (label) => `BT\n/F1 24 Tf\n72 720 Td\n(${label}) Tj\nET\n`
  const streams = ['Reader page one', 'Reader page two selectable text', 'Reader page three'].map(pageStream)
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(streams[0])} >>\nstream\n${streams[0]}endstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>',
    `<< /Length ${Buffer.byteLength(streams[1])} >>\nstream\n${streams[1]}endstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R >>',
    `<< /Length ${Buffer.byteLength(streams[2])} >>\nstream\n${streams[2]}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index <= objects.length; index++) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  writeFileSync(filePath, pdf)
}

async function seedBook() {
  const dataDir = join(PROFILE, 'data')
  const booksDir = join(dataDir, 'books')
  mkdirSync(booksDir, { recursive: true })
  const bookPath = join(booksDir, `${BOOK_ID}.pdf`)
  makePdf(bookPath)
  const SQL = await initSqlJs({ locateFile: (file) => join(ROOT, 'node_modules', 'sql.js', 'dist', file) })
  const databasePath = join(dataDir, 'learning-kit-v3.db')
  const db = new SQL.Database(readFileSync(databasePath))
  db.run('INSERT INTO books(id,title,kind,file_path,total_pages,last_page) VALUES(?,?,?,?,?,?)', [BOOK_ID, BOOK_TITLE, 'pdf', bookPath, 3, 1])
  writeFileSync(databasePath, Buffer.from(db.export()))
  db.close()
}

async function click(cdp, selector) {
  const clicked = await cdp.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true })()`)
  if (!clicked) throw new Error(`Element not found: ${selector}`)
}

async function clickButton(cdp, label, root = 'document') {
  const clicked = await cdp.evaluate(`(() => {
    const base = ${root};
    const button = [...base.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(label)});
    if (!button) return false; button.click(); return true;
  })()`)
  if (!clicked) throw new Error(`Button not found: ${label}`)
}

async function openBook(cdp) {
  await click(cdp, '[data-testid="dock-mode-library"]')
  await waitFor(() => cdp.evaluate(`!!document.querySelector('[data-book-id="${BOOK_ID}"]')`), 'Seeded PDF did not appear in the library')
  await click(cdp, `[data-book-id="${BOOK_ID}"]`)
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="pdf-current-page"]')?.textContent.includes('/ 3') || false`), 'PDF reader did not render the generated book', 15000)
  await waitFor(() => cdp.evaluate(`!!document.querySelector('.textLayer span')`), 'PDF text layer did not render', 15000)
}

async function currentRelativeAnchor(cdp) {
  return cdp.evaluate(`(() => {
    const viewport = document.querySelector('[data-testid="pdf-canvas-wrap"]');
    const page = viewport?.querySelector('.page-container');
    if (!viewport || !page) return -1;
    const pageBox = page.getBoundingClientRect(); const frame = viewport.getBoundingClientRect();
    return (frame.top + viewport.clientHeight / 2 - pageBox.top) / pageBox.height;
  })()`)
}

async function testReaderFlow(cdp) {
  await cdp.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); true`)
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="pdf-current-page"]')?.textContent.includes('第 2 / 3 页') || false`), 'Keyboard navigation did not reach page 2')
  await waitFor(() => cdp.evaluate(`[...document.querySelectorAll('.textLayer span')].some((item) => item.textContent.includes('page two'))`), 'Page 2 text layer did not finish rendering', 15000)

  const beforeZoom = await cdp.evaluate(`(() => {
    const viewport = document.querySelector('[data-testid="pdf-canvas-wrap"]');
    viewport.scrollTop = Math.min(300, viewport.scrollHeight - viewport.clientHeight);
    viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    const page = viewport.querySelector('.page-container').getBoundingClientRect();
    const frame = viewport.getBoundingClientRect();
    return (frame.top + viewport.clientHeight / 2 - page.top) / page.height;
  })()`)
  await cdp.evaluate(`(() => { const viewport = document.querySelector('[data-testid="pdf-canvas-wrap"]'); viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 })); return true })()`)
  await waitFor(() => cdp.evaluate(`document.querySelector('.zoom-lbl')?.textContent.trim() === '130%'`), 'Ctrl+wheel did not zoom the PDF')
  await waitFor(() => cdp.evaluate(`!document.querySelector('[data-testid="pdf-reader"] .loading')`), 'Zoom render did not finish')
  const afterZoom = await cdp.evaluate(`(() => {
    const viewport = document.querySelector('[data-testid="pdf-canvas-wrap"]');
    const page = viewport.querySelector('.page-container').getBoundingClientRect();
    const frame = viewport.getBoundingClientRect();
    return (frame.top + viewport.clientHeight / 2 - page.top) / page.height;
  })()`)
  if (Math.abs(beforeZoom - afterZoom) > 0.08) throw new Error(`Zoom lost the reading anchor: ${beforeZoom} -> ${afterZoom}`)

  const selected = await cdp.evaluate(`(() => {
    const span = [...document.querySelectorAll('.textLayer span')].find((item) => item.textContent.includes('selectable'));
    if (!span?.firstChild) return false;
    const range = document.createRange(); range.selectNodeContents(span);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const box = span.getBoundingClientRect();
    span.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: box.left + 4, clientY: box.top + 4 }));
    return true;
  })()`)
  if (!selected) throw new Error('Could not select generated PDF text')
  await waitFor(() => cdp.evaluate(`!!document.querySelector('.sel-popup')`), 'Text selection actions did not open')
  await clickButton(cdp, 'Highlight', `document.querySelector('.sel-popup')`)
  await waitFor(() => cdp.evaluate(`window.lk.highlightList(${JSON.stringify(BOOK_ID)}).then((rows) => rows.some((row) => row.page === 2 && row.rects_json))`), 'Text highlight was not saved on page 2')

  await clickButton(cdp, '手绘批注')
  await waitFor(() => cdp.evaluate(`!!document.querySelector('[data-testid="pdf-annotation-canvas"]')`), 'Annotation canvas did not open')
  await clickButton(cdp, '手绘荧光笔')
  await cdp.evaluate(`(() => {
    const canvas = document.querySelector('[data-testid="pdf-annotation-canvas"]'); const box = canvas.getBoundingClientRect();
    const event = (type, x, y) => canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: box.left + x, clientY: box.top + y }));
    event('mousedown', 130, 180); event('mousemove', 240, 180); event('mouseup', 240, 180); return true;
  })()`)
  await waitFor(() => cdp.evaluate(`window.lk.annList(${JSON.stringify(BOOK_ID)}, 2).then((rows) => rows.some((row) => { if (row.type !== 'highlighter') return false; const data = JSON.parse(row.data); return data.opacity > 0 && data.opacity < 0.6; }))`), 'Transparent hand-drawn highlight was not saved on page 2')

  await clickButton(cdp, '便签')
  await cdp.evaluate(`(() => {
    const canvas = document.querySelector('[data-testid="pdf-annotation-canvas"]'); const box = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: box.left + 180, clientY: box.top + 260 })); return true;
  })()`)
  await waitFor(() => cdp.evaluate(`!!document.querySelector('.sticky-note textarea')`), 'Sticky note did not appear')
  await cdp.evaluate(`(() => {
    const bar = document.querySelector('.sticky-bar'); const box = bar.getBoundingClientRect();
    bar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: box.left + 10, clientY: box.top + 5 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: box.left + 70, clientY: box.top + 45 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: box.left + 70, clientY: box.top + 45 }));
    const input = document.querySelector('.sticky-note textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(STICKY_TEXT)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`)

  // Switch immediately, before the 350 ms debounce, to exercise the flush path.
  await click(cdp, '[data-testid="dock-mode-chat"]')
  await waitFor(() => cdp.evaluate(`!!document.querySelector('.composer')`), 'Chat view did not open')
  await clickButton(cdp, '\u2190 \u56de\u5230\u7535\u5b50\u4e66')
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="pdf-current-page"]')?.textContent.includes('第 2 / 3 页') || false`), 'Returning from another module lost the current page')
  await waitFor(() => cdp.evaluate(`document.querySelector('.zoom-lbl')?.textContent.trim() === '130%'`), 'Returning from another module lost the zoom')
  await waitFor(() => cdp.evaluate(`document.querySelector('.sticky-note textarea')?.value === ${JSON.stringify(STICKY_TEXT)}`), 'Returning from another module lost sticky text')
  const restoredAnchor = await currentRelativeAnchor(cdp)
  if (Math.abs(afterZoom - restoredAnchor) > 0.08) throw new Error(`Returning from another module lost the reading position: ${afterZoom} -> ${restoredAnchor}`)
  const sticky = await cdp.evaluate(`window.lk.annList(${JSON.stringify(BOOK_ID)}, 2).then((rows) => rows.find((row) => row.type === 'sticky')).then((row) => row && JSON.parse(row.data))`)
  if (!sticky || sticky.x <= 0.22 || sticky.y <= 0.22) throw new Error(`Sticky drag position was overwritten by text save: ${JSON.stringify(sticky)}`)
  return afterZoom
}

async function verifyRestart(cdp, expectedAnchor) {
  await openBook(cdp)
  await waitFor(() => cdp.evaluate(`document.querySelector('[data-testid="pdf-current-page"]')?.textContent.includes('第 2 / 3 页') || false`), 'Restart lost the current PDF page')
  await waitFor(() => cdp.evaluate(`document.querySelector('.zoom-lbl')?.textContent.trim() === '130%'`), 'Restart lost the PDF zoom')
  const restoredAnchor = await currentRelativeAnchor(cdp)
  if (Math.abs(expectedAnchor - restoredAnchor) > 0.08) throw new Error(`Restart lost the reading position: ${expectedAnchor} -> ${restoredAnchor}`)
  await clickButton(cdp, '手绘批注')
  await waitFor(() => cdp.evaluate(`document.querySelector('.sticky-note textarea')?.value === ${JSON.stringify(STICKY_TEXT)}`), 'Restart lost the sticky note')
  const persisted = await cdp.evaluate(`Promise.all([window.lk.highlightList(${JSON.stringify(BOOK_ID)}), window.lk.annList(${JSON.stringify(BOOK_ID)}, 2)]).then(([highlights, annotations]) => ({ highlights: highlights.length, annotations: annotations.length, state: localStorage.getItem('unused') }))`)
  if (persisted.highlights < 1 || persisted.annotations < 2) throw new Error(`Restart lost PDF annotations: ${JSON.stringify(persisted)}`)
}

async function main() {
  try {
    console.log('Learning Kit — PDF 阅读器 UI 测试')
    let app = await launchApp()
    await closeApp(app)
    await seedBook()

    app = await launchApp()
    await openBook(app.cdp)
    const expectedAnchor = await testReaderFlow(app.cdp)
    await closeApp(app)
    console.log('  ✓ 翻页、缩放锚点、文本标记、手绘荧光笔、便签及模块切换恢复')

    app = await launchApp()
    await verifyRestart(app.cdp, expectedAnchor)
    await closeApp(app)
    console.log('  ✓ 重启后页码、缩放、文本标记、手绘批注和便签仍存在')
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
