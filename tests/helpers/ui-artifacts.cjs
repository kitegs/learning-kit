// Only called by isolated UI tests, before closing the failed Electron window.
const fs = require('node:fs')
const path = require('node:path')

function redact(text) {
  return String(text)
    .replace(/fake-local-key/g, '[redacted]')
    .replace(/\b[\da-f]{64}\b/gi, '[redacted-token]')
    .replace(/\b(Bearer\s+)[\w.-]+/gi, '$1[redacted]')
    .replace(/((?:apiKey|api_key|LK_MCP_TOKEN|authorization)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[redacted]')
}

async function bounded(promise, timeoutMs = 3000) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Evidence capture timed out')), timeoutMs) })])
  } finally { clearTimeout(timer) }
}

async function saveUiFailure(suite, app, error) {
  // No database, storage, store snapshots or MCP client configuration are copied.
  // A broken DevTools connection must not hide or hang the original test failure.
  try {
    const folder = path.resolve(__dirname, '../../test-results/ui', suite)
    fs.mkdirSync(folder, { recursive: true })
    const diagnostic = {
      error: redact(error?.stack || error),
      electron: redact(app?.output?.join('').slice(-8000) || ''),
      exceptions: redact(JSON.stringify(app?.cdp?.events?.filter(event => event.method === 'Runtime.exceptionThrown') || []))
    }
    if (app?.cdp) {
      try {
        const shot = await bounded(app.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }))
        fs.writeFileSync(path.join(folder, 'failure.png'), Buffer.from(shot.data, 'base64'))
      } catch (captureError) { diagnostic.screenshotError = redact(captureError.message) }
    }
    fs.writeFileSync(path.join(folder, 'diagnostic.json'), JSON.stringify(diagnostic, null, 2))
  } catch (captureError) { console.error('UI evidence capture failed:', redact(captureError.message)) }
}

module.exports = { saveUiFailure, redact }
