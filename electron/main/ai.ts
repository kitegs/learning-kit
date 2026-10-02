import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { AiRequestDiagnostic } from './ai-diagnostics'
import { beginAgentRun, finishAgentModel, saveDiagnostic, cancelAgentOwner } from './ai-workflow'
import type { AgentRun, AiDiagnostic, AiFailureCode } from '../shared/ai-workflow'
import { consumeAiStream } from './ai-stream'
import { AiRequestRegistry } from './ai-requests'
import { prepareContext } from './ai-context'
import { retrieveNotes } from './ai-retrieval'
import { retrieveGraph } from './knowledge-graph'
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
  retrieveGraph?: boolean
  diagnosticsEnabled?: boolean
  requestUsage?: boolean
  agentEnabled?: boolean
  agentMaxSteps?: number
}

export interface AiChunkPayload {
  diagnostic?: AiDiagnostic
  agentRun?: AgentRun
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
  const requests = new AiRequestRegistry()
  // 每个渲染进程只绑定一次销毁监听；WeakSet 不会阻止已销毁对象被回收。
  const watchedSenders = new WeakSet<object>()
  ipc.handle('ai:models', (_e, provider: string) => DEFAULT_MODELS[provider] || [])

  ipc.handle('ai:system-prompt', () => loadSystemPrompt())

  ipc.handle(
    'ai:chat:start',
    async (e, args: AiChatStartArgs) => {
      if (!BrowserWindow.fromWebContents(e.sender)) throw new Error('AI 请求窗口已关闭')
      const owner = e.sender.id
      if (!watchedSenders.has(e.sender)) {
        watchedSenders.add(e.sender)
        e.sender.once('destroyed', () => {
          requests.abortOwner(owner)
          try { cancelAgentOwner(owner) } catch { console.warn('[AI agent] 关闭状态保存失败') }
        })
      }
      // 注册放在 try 外：重复 ID 直接让本次 invoke 失败，不进入原请求的
      // chunk 通道，也不执行本次 finally，避免干扰仍在运行的原请求。
      const ctrl = requests.begin(owner, args.requestId)
      const diagnostic = args.diagnosticsEnabled ? new AiRequestDiagnostic({ id: randomUUID(), requestId: args.requestId, conversationId: args.conversationId || null, provider: String(args.provider || 'openai').slice(0, 40), model: String(args.model || '').slice(0, 120), startedAt: Date.now() }) : null
      let agentRun: AgentRun | undefined
      let failureCode: AiFailureCode = 'configuration'
      let httpStatus: number | undefined
      let finalized = false
      const send = (payload: AiChunkPayload) => {
        if (payload.done && !finalized) {
          finalized = true
          const status = payload.aborted ? 'cancelled' : payload.error ? 'failed' : 'completed'
          if (diagnostic) {
            payload.diagnostic = diagnostic.finish(status, status === 'completed' ? undefined : timedOut ? 'timeout' : payload.aborted ? 'cancelled' : failureCode, httpStatus)
            // 观察信息的存储错误不能把成功回答改成失败，也不能输出 Key/正文。
            try { saveDiagnostic(payload.diagnostic) } catch { console.warn('[AI diagnostic] 本地诊断保存失败') }
          }
          if (agentRun) {
            try { agentRun = finishAgentModel(agentRun.id, status); payload.agentRun = agentRun } catch { console.warn('[AI agent] 执行状态保存失败') }
          }
        }
        // 关闭窗口后网络回调仍可能到达，不能再向已销毁的渲染进程发送消息。
        if (!e.sender.isDestroyed()) e.sender.send(`ai:chunk:${args.requestId}`, payload)
      }
      // The built-in contract is always retained. A legacy system message is
      // treated as user customization instead of replacing the safety rules.
      let timedOut = false
      // 超时和用户停止共用取消控制器，但用标志区分两种结束原因。
      const timeout = setTimeout(() => { timedOut = true; ctrl.abort() }, 300_000)

      try {
        if (args.agentEnabled) {
          agentRun = beginAgentRun(owner, args.requestId, args.conversationId, args.agentMaxSteps)
          send({ done: false, agentRun })
        }
        const provider = (args.provider || 'openai').toLowerCase()
        const endpoint = args.baseUrl?.trim() || PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.openai
        const apiKey = (args.apiKey || '').trim()
        if (!apiKey) {
          send({ done: true, error: `未设置 ${provider} 的 API key，请到设置中填写` })
          return false
        }
        const legacySystemPrompt = args.messages.find((message) => message.role === 'system')?.content
        failureCode = 'input'
        let customPrompt = args.customSystemPrompt ?? legacySystemPrompt
        if (args.conversationId) {
          const stored = qOne(getDb(), 'SELECT value FROM settings WHERE key=?', [conversationPromptKey(args.conversationId)]) as { value: string } | undefined
          customPrompt = resolveConversationPrompt(parseConversationPrompt(stored?.value ?? null), customPrompt)
        }
        const messages: AiChatMessage[] = [{ role: 'system', content: composeSystemPrompt(customPrompt) }, ...args.messages.filter(message => message.role !== 'system')]
        const query = [...args.messages].reverse().find(message => message.role === 'user')?.content || ''
        const snippets = [...(args.retrieveGraph === true ? retrieveGraph(query) : []), ...(args.retrieveNotes === true ? retrieveNotes(query) : [])]
        const context = prepareContext(messages, args.inputBudget, snippets.filter((s, i) => snippets.findIndex(row => row.id === s.id) === i))
        send({ done: false, contextSummary: context.summary })
        const body = { model: args.model || 'deepseek-v4-flash', messages: context.messages, stream: true, temperature: args.temperature ?? 0.6, ...(args.requestUsage ? { stream_options: { include_usage: true } } : {}) }
        failureCode = 'network'
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify(body),
          // “停止”、超时、窗口销毁都通过这个 signal 取消 fetch 及响应体读取。
          signal: ctrl.signal
        })
        if (!resp.ok || !resp.body) {
          failureCode = 'http'; httpStatus = resp.status
          const text = await resp.text().catch(() => '')
          send({
            done: true,
            error: `HTTP ${resp.status} ${resp.statusText}\n${text}`.trim()
          })
          return false
        }

        let acc = ''
        failureCode = 'stream'
        await consumeAiStream(resp.body, (delta) => {
          // 取消信号发出后，忽略已经排队、尚未来得及处理的内容片段。
          if (ctrl.signal.aborted) return
          diagnostic?.content()
          acc += delta
          send({ delta, content: acc, done: false })
        }, usage => diagnostic?.tokens(usage))
        // 流读取可能恰好正常结束；再次检查，避免把已取消请求报告为成功。
        ctrl.signal.throwIfAborted()
        send({ delta: '', content: acc, done: true })
        return acc
      } catch (err: any) {
        if (timedOut) {
          send({ done: true, error: 'AI 请求超过五分钟，已停止，请重试' })
        } else if (err?.name === 'AbortError') {
          send({ done: true, aborted: true })
        } else {
          send({ done: true, error: String(err?.message || err) })
        }
        return false
      } finally {
        // 成功、异常、取消以及 try 内提前 return 都会走这里，统一回收资源。
        clearTimeout(timeout)
        requests.release(owner, args.requestId, ctrl)
      }
    }
  )

  ipc.handle('ai:chat:abort', (e, requestId: string) => {
    requests.abort(e.sender.id, requestId)
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
