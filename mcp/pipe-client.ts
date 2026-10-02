import { createConnection } from 'node:net'
import { randomUUID } from 'node:crypto'

export function callDesktop(method: string, params: unknown): Promise<unknown> {
  const pipe = process.env.LK_MCP_PIPE, token = process.env.LK_MCP_TOKEN
  if (!pipe?.startsWith('\\\\.\\pipe\\learning-kit-') || !token || !/^[a-f0-9]{64}$/.test(token)) {
    return Promise.reject(new Error('缺少有效 MCP 配置。请在 Learning Kit 设置中开启服务并复制客户端配置。'))
  }
  // 一次调用一个短连接：桌面端重启后下一次调用即可重新连接，不保留失效 socket。
  return new Promise((resolve, reject) => {
    const id = randomUUID(), socket = createConnection(pipe)
    let raw = '', settled = false
    const finish = (error?: Error, data?: unknown) => {
      if (settled) return
      settled = true; clearTimeout(timer); socket.destroy()
      if (error) reject(error); else resolve(data)
    }
    const timer = setTimeout(() => finish(new Error('桌面 MCP 请求超时，请确认应用仍在运行。')), 10000)
    socket.on('connect', () => socket.write(JSON.stringify({ id, token, method, params }) + '\n'))
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      raw += chunk
      if (Buffer.byteLength(raw) > 262144) { finish(new Error('响应过大')); return }
      if (!raw.includes('\n')) return
      try {
        const response = JSON.parse(raw.slice(0, raw.indexOf('\n'))) as { id: string; ok: boolean; data?: unknown; error?: string }
        if (response.id !== id) throw new Error('响应 ID 不匹配')
        finish(response.ok ? undefined : new Error(response.error || 'MCP 导入失败'), response.data)
      } catch { finish(new Error('桌面 MCP 响应无效')) }
    })
    // 不回显 socket/环境变量，避免错误信息泄漏本机地址和凭据。
    socket.on('error', () => finish(new Error('无法连接 Learning Kit，请打开应用并启用 MCP 服务。')))
    socket.on('close', () => { if (!settled) finish(new Error('桌面 MCP 连接已关闭')) })
  })
}
