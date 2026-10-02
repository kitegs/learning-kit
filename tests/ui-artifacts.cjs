const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { saveUiFailure, redact } = require('./helpers/ui-artifacts.cjs')

async function main() {
  const suite = `artifact-unit-${process.pid}-${Date.now()}`
  const folder = path.resolve(__dirname, '../test-results/ui', suite)
  const token = 'a'.repeat(64)
  const secret = 'sk-example-private'
  const original = new Error(`fake-local-key apiKey="${secret}" LK_MCP_TOKEN=${token} Bearer ${secret}`)
  const originalMessage = original.message
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  try {
    await saveUiFailure(suite, {
      output: [originalMessage], profile: 'must-not-copy-profile',
      cdp: { events: [], send: async method => { assert.equal(method, 'Page.captureScreenshot'); return { data: png.toString('base64') } } }
    }, original)
    assert.deepEqual(fs.readFileSync(path.join(folder, 'failure.png')), png)
    const diagnostic = fs.readFileSync(path.join(folder, 'diagnostic.json'), 'utf8')
    for (const sensitive of ['fake-local-key', token, secret, 'must-not-copy-profile']) assert.ok(!diagnostic.includes(sensitive), `must redact ${sensitive}`)
    assert.equal(original.message, originalMessage, 'evidence capture must not mutate the original error')
    await saveUiFailure(suite, { cdp: { send: async () => { throw new Error('DevTools disconnected') } } }, original)
    assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'diagnostic.json'), 'utf8')).screenshotError, 'DevTools disconnected')
    await saveUiFailure(suite, { cdp: { send: () => new Promise(() => {}) } }, original)
    assert.match(JSON.parse(fs.readFileSync(path.join(folder, 'diagnostic.json'), 'utf8')).screenshotError, /timed out/)
    await saveUiFailure(suite, null, original)
    assert.ok(JSON.parse(fs.readFileSync(path.join(folder, 'diagnostic.json'), 'utf8')).error.includes('[redacted]'))
    assert.ok(!redact(`authorization: Bearer ${secret}`).includes(secret))
    console.log('UI failure evidence: screenshot, redaction, disconnected/timeout/missing window PASS')
  } finally {
    // Only this test's uniquely named output directory; never a user profile.
    fs.rmSync(folder, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
