import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { app } from 'electron'

/** All configured providers expose an OpenAI-compatible /chat/completions endpoint. */
const PROVIDER_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  custom: 'https://api.openai.com/v1/chat/completions'
}

const DEFAULT_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
  dashscope: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long'],
  custom: []
}

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StartArgs {
  requestId: string
  provider: string
  model: string
  messages: ChatMsg[]
  temperature?: number
  apiKey?: string
  baseUrl?: string // override endpoint for 'custom'
}

function loadSystemPrompt(): string {
  // requirement: prompt comes from promt/ dir (user-provided later).
  // Look first inside the workspace promt/ folder, then bundled resources.
  const candidates = [
    join(process.cwd(), 'promt', 'system.txt'),
    join(app.getAppPath(), 'promt', 'system.txt'),
    join(app.getAppPath(), 'resources', 'promt', 'system.txt')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf-8')
  }
  return [
    'You are a patient private learning assistant for a single user.',
    'Adapt to study topics in computer science, math, and English (and what the user asks for).',
    'Be concise and grounded; avoid fabricating facts. If unsure, say so explicitly.',
    'Prefer to explain with code, formulas, or examples. Markdown supported.',
    'Help the user learn, review, make notes, and plan reviews.'
  ].join('\n')
}

;(global as any).__send = (channel: string, payload: unknown) => {
  const win = BrowserWindow.getAllWindows()[0]
  win?.webContents.send(channel, payload)
}

export function registerAiIpcs(ipc: typeof ipcMain): void {
  ipc.handle('ai:models', (_e, provider: string) => DEFAULT_MODELS[provider] || [])

  ipc.handle('ai:system-prompt', () => loadSystemPrompt())

  ipc.handle(
    'ai:chat:start',
    async (e, args: StartArgs) => {
      const win = BrowserWindow.fromWebContents(e.sender)!
      const provider = (args.provider || 'openai').toLowerCase()
      const endpoint = args.baseUrl?.trim() || PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.openai
      const apiKey = (args.apiKey || '').trim()
      if (!apiKey) {
        win.webContents.send(`ai:chunk:${args.requestId}`, {
          done: true,
          error: `未设置 ${provider} 的 API key，请到设置中填写`
        })
        return false
      }

      // inject system prompt if none
      const messages: ChatMsg[] =
        args.messages && args.messages.length && args.messages[0].role === 'system'
          ? args.messages
          : [{ role: 'system', content: loadSystemPrompt() }, ...args.messages]

      const body = {
        model: args.model || 'deepseek-v4-flash',
        messages,
        stream: true,
        temperature: args.temperature ?? 0.6
      }

      const ctrl = new AbortController()
      ;(global as any).__aiReq ??= new Map()
      ;(global as any).__aiReq.set(args.requestId, ctrl)

      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify(body),
          signal: ctrl.signal
        })
        if (!resp.ok || !resp.body) {
          const text = await resp.text().catch(() => '')
          win.webContents.send(`ai:chunk:${args.requestId}`, {
            done: true,
            error: `HTTP ${resp.status} ${resp.statusText}\n${text}`.trim()
          })
          return false
        }

        const reader = resp.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buf = ''
        let acc = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          let nl: number
          while ((nl = buf.indexOf('\n')) >= 0) {
            let line = buf.slice(0, nl).trim()
            buf = buf.slice(nl + 1)
            if (!line) continue
            if (line.startsWith('data:')) line = line.slice(5).trim()
            if (line === '[DONE]') {
              buf = ''
              continue
            }
            try {
              const j = JSON.parse(line)
              const delta = j.choices?.[0]?.delta?.content ?? ''
              if (delta) {
                acc += delta
                win.webContents.send(`ai:chunk:${args.requestId}`, { delta, content: acc, done: false })
              }
            } catch {
              /* keep buffering */
            }
          }
        }
        win.webContents.send(`ai:chunk:${args.requestId}`, { delta: '', content: acc, done: true })
        return acc
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          win.webContents.send(`ai:chunk:${args.requestId}`, { done: true, aborted: true })
        } else {
          win.webContents.send(`ai:chunk:${args.requestId}`, { done: true, error: String(err?.message || err) })
        }
        return false
      } finally {
        ;(global as any).__aiReq.delete(args.requestId)
      }
    }
  )

  ipc.handle('ai:chat:abort', (_e, requestId: string) => {
    const map: Map<string, AbortController> = (global as any).__aiReq
    const ctrl = map?.get(requestId)
    if (ctrl) {
      ctrl.abort()
      map.delete(requestId)
    }
    return true
  })

  // test connection: send a minimal request and return success/error
  ipc.handle('ai:test', async (_e, args: { provider: string; model: string; apiKey: string; baseUrl?: string }) => {
    const provider = (args.provider || 'openai').toLowerCase()
    const endpoint = args.baseUrl?.trim() || PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.openai
    const apiKey = (args.apiKey || '').trim()
    if (!apiKey) return { ok: false, error: 'API Key is empty' }
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: args.model || 'deepseek-v4-flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5, stream: false }),
        signal: AbortSignal.timeout(15000)
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        return { ok: false, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` }
      }
      const data = await resp.json() as any
      const reply = data.choices?.[0]?.message?.content || '(empty)'
      return { ok: true, reply: reply.slice(0, 100) }
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) }
    }
  })
}