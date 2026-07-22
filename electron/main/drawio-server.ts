import http from 'http'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

let server: http.Server | null = null
let port = 0

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
}

function getWebappDir(): string {
  // Dev: reference source directly; Prod: from resources
  const devPath = path.join(app.getAppPath(), '..', '..', 'drawio-dev', 'drawio-dev', 'src', 'main', 'webapp')
  if (fs.existsSync(devPath)) return devPath
  const prodPath = path.join(process.resourcesPath || app.getAppPath(), 'drawio')
  if (fs.existsSync(prodPath)) return prodPath
  // fallback: try sibling of learning-kit
  const siblingPath = path.resolve(app.getAppPath(), '..', '..', 'drawio-dev', 'drawio-dev', 'src', 'main', 'webapp')
  if (fs.existsSync(siblingPath)) return siblingPath
  return devPath // will 404 but at least won't crash
}

export function startDrawioServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    if (server) { resolve(port); return }
    const webappDir = getWebappDir()
    console.log('[drawio-server] webapp dir:', webappDir)

    server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0])
      if (urlPath === '/') urlPath = '/index.html'

      const filePath = path.join(webappDir, urlPath)
      // Security: prevent path traversal
      if (!filePath.startsWith(webappDir)) {
        res.writeHead(403); res.end('Forbidden'); return
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404); res.end('Not Found'); return
        }
        const ext = path.extname(filePath).toLowerCase()
        const mime = MIME[ext] || 'application/octet-stream'
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        })
        fs.createReadStream(filePath).pipe(res)
      })
    })

    server.listen(0, '127.0.0.1', () => {
      port = (server!.address() as any).port
      console.log(`[drawio-server] listening on http://127.0.0.1:${port}`)
      resolve(port)
    })

    server.on('error', (e) => {
      console.error('[drawio-server] error:', e)
      reject(e)
    })
  })
}

export function getDrawioPort(): number { return port }

export function stopDrawioServer(): void {
  if (server) { server.close(); server = null; port = 0 }
}