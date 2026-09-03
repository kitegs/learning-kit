import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createWorker } from 'tesseract.js'

const imagePath = process.argv[2]
if (!imagePath) throw new Error('usage: node tests/ocr-smoke.mjs <image-path>')

const require = createRequire(import.meta.url)
const langPath = join(dirname(require.resolve('@tesseract.js-data/chi_sim')), '4.0.0')
const worker = await createWorker('chi_sim', 1, { langPath, gzip: true, cacheMethod: 'none' })
try {
  const result = await worker.recognize(await readFile(imagePath))
  const text = result.data.text.trim()
  assert(text.length >= 4, 'OCR should return visible text from the smoke-test image')
  console.log(JSON.stringify({ confidence: Math.round(result.data.confidence), preview: text.slice(0, 120) }))
} finally {
  await worker.terminate()
}
