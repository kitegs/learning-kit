/** Parse SSE incrementally, including UTF-8 boundaries and an unterminated tail. */
export async function consumeAiStream(body: ReadableStream<Uint8Array>, onDelta: (delta: string) => void): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', content = '', data: string[] = []
  let completed = false
  function dispatch() {
    if (!data.length) return
    const raw = data.join('\n'); data = []
    if (raw.trim() === '[DONE]') { completed = true; return }
    let event: { error?: { message?: string }; choices?: { delta?: { content?: string }; finish_reason?: string | null }[] }
    try { event = JSON.parse(raw) } catch { throw new Error('AI 流数据格式错误，请重试') }
    if (event.error) throw new Error(event.error.message || 'AI 服务商返回错误')
    const choice = event.choices?.[0]
    if (choice?.delta?.content) { content += choice.delta.content; onDelta(choice.delta.content) }
    if (choice?.finish_reason === 'length') throw new Error('回答达到模型长度限制，内容未完整生成')
    if (choice?.finish_reason === 'content_filter') throw new Error('回答被服务商内容过滤器中止')
    if (choice?.finish_reason) completed = true
  }
  function line(value: string) {
    if (!value) { dispatch(); return }
    if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''))
  }
  try {
    while (!completed) {
      const chunk = await reader.read()
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true })
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) {
        line(buffer.slice(0, end).replace(/\r$/, '')); buffer = buffer.slice(end + 1)
        if (completed) break
      }
      if (buffer.length > 2_000_000) throw new Error('AI 流事件过大')
      if (chunk.done) { if (buffer) line(buffer.replace(/\r$/, '')); dispatch(); break }
    }
    if (!completed) throw new Error('AI 连接提前结束，已保留部分回答，请重试')
    return content
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
