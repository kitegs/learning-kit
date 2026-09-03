import type { IpcMain } from 'electron'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { createWorker, PSM, type Worker } from 'tesseract.js'

const require = createRequire(import.meta.url)
let workerPromise: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    const languagePackage = require.resolve('@tesseract.js-data/chi_sim')
    const langPath = join(dirname(languagePackage), '4.0.0')
    workerPromise = createWorker('chi_sim', 1, {
      langPath,
      gzip: true,
      cacheMethod: 'none',
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
      })
      return worker
    }).catch((error) => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

export function registerOcrIpcs(ipc: IpcMain): void {
  ipc.handle('ocr:recognize', async (_event, imageDataUrl: string) => {
    if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/png;base64,')) throw new Error('OCR 仅接受本地 PNG 页面图像')
    if (imageDataUrl.length > 40_000_000) throw new Error('页面图像过大，请降低缩放后重试')
    const payload = imageDataUrl.slice(imageDataUrl.indexOf(',') + 1)
    const image = Buffer.from(payload, 'base64')
    const worker = await getWorker()
    const result = await worker.recognize(image)
    return { text: result.data.text || '', confidence: Number(result.data.confidence || 0) }
  })
}

export async function terminateOcr(): Promise<void> {
  const promise = workerPromise
  workerPromise = null
  if (!promise) return
  try { await (await promise).terminate() } catch { /* app is already closing */ }
}
