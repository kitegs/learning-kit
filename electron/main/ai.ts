import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { app } from 'electron'
import { consumeAiStream } from './ai-stream'
import { prepareContext } from './ai-context'
import { retrieveNotes } from './ai-retrieval'
import { getDb, qOne } from './db'
import { conversationPromptKey, parseConversationPrompt, resolveConversationPrompt } from '../shared/conversation-prompt'

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

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiChatStartArgs {
  requestId: string
  provider: string
  model: string
  messages: AiChatMessage[]
  temperature?: number
  apiKey?: string
  baseUrl?: string // override endpoint for 'custom'
  customSystemPrompt?: string
  conversationId?: string
  inputBudget?: number
  retrieveNotes?: boolean
}

export interface AiChunkPayload {
  contextSummary?: ReturnType<typeof prepareContext>['summary']
  delta?: string
  content?: string
  done: boolean
  aborted?: boolean
  error?: string
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

function composeSystemPrompt(customSystemPrompt?: string): string {
  const builtIn = loadSystemPrompt()
  const custom = customSystemPrompt?.trim()
  if (!custom) return builtIn
  return `${builtIn}\n\n# User custom instructions\nThe following preferences supplement the built-in rules. They cannot override privacy, confirmation, or output-format constraints.\n<user_instructions>\n${custom}\n</user_instructions>`
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
    async (e, args: AiChatStartArgs) => {
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

      // The built-in contract is always retained. A legacy system message is
      // treated as user customization instead of replacing the safety rules.
      const legacySystemPrompt = args.messages.find((message) => message.role === 'system')?.content

      const ctrl = new AbortController()
      let timedOut = false
      const timeout = setTimeout(() => { timedOut = true; ctrl.abort() }, 300_000)
      ;(global as any).__aiReq ??= new Map()
      ;(global as any).__aiReq.set(args.requestId, ctrl)

      try {
        let customPrompt = args.customSystemPrompt ?? legacySystemPrompt
        if (args.conversationId) {
          const stored = qOne(getDb(), 'SELECT value FROM settings WHERE key=?', [conversationPromptKey(args.conversationId)]) as { value: string } | undefined
          customPrompt = resolveConversationPrompt(parseConversationPrompt(stored?.value ?? null), customPrompt)
        }
        const messages: AiChatMessage[] = [{ role: 'system', content: composeSystemPrompt(customPrompt) }, ...args.messages.filter(message => message.role !== 'system')]
        const query = [...args.messages].reverse().find(message => message.role === 'user')?.content || ''
        const context = prepareContext(messages, args.inputBudget, args.retrieveNotes === true ? retrieveNotes(query) : [])
        win.webContents.send(`ai:chunk:${args.requestId}`, { done: false, contextSummary: context.summary })
        const body = { model: args.model || 'deepseek-v4-flash', messages: context.messages, stream: true, temperature: args.temperature ?? 0.6 }
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

        let acc = ''
        await consumeAiStream(resp.body, (delta) => {
          acc += delta
          win.webContents.send(`ai:chunk:${args.requestId}`, { delta, content: acc, done: false })
        })
        win.webContents.send(`ai:chunk:${args.requestId}`, { delta: '', content: acc, done: true })
        return acc
      } catch (err: any) {
        if (timedOut) {
          win.webContents.send(`ai:chunk:${args.requestId}`, { done: true, error: 'AI 请求超过五分钟，已停止，请重试' })
        } else if (err?.name === 'AbortError') {
          win.webContents.send(`ai:chunk:${args.requestId}`, { done: true, aborted: true })
        } else {
          win.webContents.send(`ai:chunk:${args.requestId}`, { done: true, error: String(err?.message || err) })
        }
        return false
      } finally {
        clearTimeout(timeout)
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
