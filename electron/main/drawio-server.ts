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
  // drawio-dev lives as a SIBLING of the learning-kit project folder.
  // learning-kit = <workspace>/learning-kit  ->  ../drawio-dev/drawio-dev/src/main/webapp
  const appPath = app.getAppPath()
  const candidates = [
    // env override
    process.env.DRAWIO_WEBAPP,
    // sibling of project folder (our dev layout: <ws>/learning-kit  &  <ws>/drawio-dev)
    path.join(appPath, '..', 'drawio-dev', 'drawio-dev', 'src', 'main', 'webapp'),
    // project folder is itself the workspace root
    path.join(appPath, 'drawio-dev', 'drawio-dev', 'src', 'main', 'webapp'),
    // two levels up (in case project is nested deeper)
    path.join(appPath, '..', '..', 'drawio-dev', 'drawio-dev', 'src', 'main', 'webapp'),
    // packaged app: bundled into resources
    path.join(process.resourcesPath || appPath, 'drawio'),
    path.join(appPath, 'resources', 'drawio'),
  ].filter(Boolean) as string[]

  for (const c of candidates) {
    const idx = path.join(c, 'index.html')
    if (fs.existsSync(idx)) {
      console.log('[drawio-server] using webapp dir:', c)
      return c
    }
  }
  console.error('[drawio-server] WARNING: no draw.io webapp found. Tried:\n  ' + candidates.join('\n  '))
  return candidates[0]
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
          console.log('[drawio-server] 404', urlPath)
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