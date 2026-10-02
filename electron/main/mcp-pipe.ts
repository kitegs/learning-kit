import { app, BrowserWindow, ipcMain } from 'electron'
import { createServer, type Server, type Socket } from 'node:net'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getDb, qOne, qRun, schedulePersist } from './db'
import { registerIpc } from './ipc-helpers'
import { dispatchMcpImport, mcpPendingCount } from './mcp-import'
import type { McpStatus, McpClientConfig } from '../shared/mcp'

let server: Server | null = null
const sockets = new Set<Socket>()
let enabled = false, token = '', pipe = '', lastError: string | null = null, shuttingDown = false
let configureQueue: Promise<unknown> = Promise.resolve()
let rateWindow = 0, rateCount = 0
const setting = (key: string) => (qOne(getDb(), 'SELECT value FROM settings WHERE key=?', [key]) as { value: string } | undefined)?.value
function save(key: string, value: string) { qRun(getDb(), 'INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', [key, value]); schedulePersist() }
function setPipe() {
  // 地址随凭据轮换改变；绑定当前资料库，测试配置不会连接到真实用户资料。
  const hash = createHash('sha256').update(app.getPath('userData') + token).digest('hex').slice(0, 32)
  pipe = `\\\\.\\pipe\\learning-kit-${hash}`
}
export function mcpStatus(): McpStatus { return { enabled, running: !!server?.listening, pending: mcpPendingCount(), error: lastError } }
function broadcast() { for (const win of BrowserWindow.getAllWindows()) win.webContents.send('mcp:changed', mcpStatus()) }
export function stopMcpServer(): void {
  // 先断开所有连接，防止最终持久化之后又收到导入写入。
  for (const socket of sockets) socket.destroy()
  sockets.clear()
  const previous = server; server = null
  previous?.close()
}
export function shutdownMcpServer(): void { shuttingDown = true; stopMcpServer() }
export function cancelMcpShutdown(): void {
  shuttingDown = false
  lastError = enabled ? '关闭已取消，MCP 暂停接收导入；请先处理保存问题，再关闭并重新开启服务。' : null
  broadcast()
}
async function start(): Promise<void> {
  if (process.platform !== 'win32') { lastError = '当前 MCP 本机入口仅支持 Windows'; return }
  if (shuttingDown || server?.listening) return
  const candidate = createServer(socket => {
    if (sockets.size >= 16) { socket.destroy(); return }
    sockets.add(socket); socket.setTimeout(10000, () => socket.destroy())
    let buffer = Buffer.alloc(0), handled = false
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    socket.on('data', chunk => {
      if (handled || !enabled || shuttingDown) { socket.destroy(); return }
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length > 262144) { socket.destroy(); return }
      const end = buffer.indexOf(10)
      if (end < 0) return
      handled = true
      let id = ''
      try {
        const request = JSON.parse(buffer.subarray(0, end).toString('utf8')) as Record<string, unknown>
        if (!request || typeof request !== 'object' || typeof request.id !== 'string' || request.id.length > 100) throw new Error('请求格式无效')
        id = request.id
        // 长度先校验再恒定时间比较，不将密钥、地址或原始报文写进日志。
        if (typeof request.token !== 'string' || !/^[a-f0-9]{64}$/.test(request.token) || !timingSafeEqual(Buffer.from(request.token, 'hex'), Buffer.from(token, 'hex'))) throw new Error('MCP 凭据无效，请重新复制配置')
        if (Date.now() - rateWindow > 60000) { rateWindow = Date.now(); rateCount = 0 }
        if (++rateCount > 120) throw new Error('MCP 请求过于频繁，请稍后重试')
        if (typeof request.method !== 'string') throw new Error('请求方法无效')
        const data = dispatchMcpImport(request.method, request.params)
        socket.end(JSON.stringify({ id, ok: true, data }) + '\n')
        if (request.method.startsWith('import_') && request.method !== 'import_status') broadcast()
      } catch (error) {
        // Zod 仅反馈约束，不回显输入数据；其他错误来自固定业务提示。
        const message = error instanceof Error ? error.message : '导入失败'
        socket.end(JSON.stringify({ id, ok: false, error: message }) + '\n')
      }
    })
  })
  server = candidate
  await new Promise<void>(resolve => {
    candidate.once('listening', () => { lastError = null; resolve() })
    candidate.on('error', () => { lastError = '无法启动本机 MCP 入口，请确认没有重复运行同一资料库的应用'; if (server === candidate) server = null; resolve(); broadcast() })
    candidate.listen(pipe)
  })
}
async function configure(nextEnabled: boolean, rotate: boolean): Promise<McpStatus> {
  if (shuttingDown) throw new Error('应用正在关闭，不能修改 MCP 配置')
  if (typeof nextEnabled !== 'boolean' || typeof rotate !== 'boolean') throw new Error('MCP 配置参数无效')
  if (rotate || !nextEnabled) {
    const previous = server
    if (previous) await new Promise<void>(resolve => { for (const socket of sockets) socket.destroy(); sockets.clear(); server = null; previous.close(() => resolve()) })
  }
  if (rotate) { token = randomBytes(32).toString('hex'); save('mcp.token', token); setPipe() }
  enabled = nextEnabled; save('mcp.enabled', String(enabled))
  if (enabled) await start()
  broadcast()
  return mcpStatus()
}
export async function registerMcpIpcs(ipc: typeof ipcMain): Promise<void> {
  token = setting('mcp.token') || ''
  if (!/^[a-f0-9]{64}$/.test(token)) { token = randomBytes(32).toString('hex'); save('mcp.token', token) }
  setPipe(); enabled = setting('mcp.enabled') === 'true'
  if (enabled) await start()
  registerIpc(ipc, 'mcp:status', () => mcpStatus())
  registerIpc(ipc, 'mcp:configure', (_event, nextEnabled: boolean, rotate = false) => {
    const pending = configureQueue.then(() => configure(nextEnabled, rotate))
    configureQueue = pending.catch(() => {})
    return pending
  })
  registerIpc(ipc, 'mcp:client-config', (): McpClientConfig => {
    if (!server?.listening || !enabled) throw new Error('请先开启 MCP 服务')
    const entry = join(app.getAppPath(), 'out', 'mcp', 'server.js')
    if (!existsSync(entry)) throw new Error('MCP 桥接产物缺失，请先运行 npm run build:mcp')
    // 配置由用户主动复制；不得将此对象加入常规状态、日志或审计。
    return { mcpServers: { 'learning-kit': { command: 'node', args: [entry], env: { LK_MCP_PIPE: pipe, LK_MCP_TOKEN: token } } } }
  })
}
