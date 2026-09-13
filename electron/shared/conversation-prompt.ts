export type ConversationPrompt = { mode: 'inherit' | 'custom' | 'none'; text: string }
export function conversationPromptKey(id: string): string {
  if (!id || id.length > 200) throw new Error('对话 ID 无效')
  return `conversationPrompt.${id}`
}
export function parseConversationPrompt(raw: string | null): ConversationPrompt {
  if (raw === null) return { mode: 'inherit', text: '' }
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error('对话 Prompt 配置损坏，请重新保存') }
  if (!value || typeof value !== 'object') throw new Error('对话 Prompt 配置无效')
  const config = value as Record<string, unknown>
  if ((config.mode !== 'inherit' && config.mode !== 'custom' && config.mode !== 'none') || typeof config.text !== 'string' || config.text.length > 20000) throw new Error('对话 Prompt 模式无效或超过 20000 字符')
  if (config.mode === 'custom' && !config.text.trim()) throw new Error('请输入本对话的 Prompt')
  return { mode: config.mode as ConversationPrompt['mode'], text: config.text }
}
export function resolveConversationPrompt(config: ConversationPrompt, globalPrompt?: string): string | undefined {
  return config.mode === 'inherit' ? globalPrompt : config.mode === 'custom' ? config.text : undefined
}
