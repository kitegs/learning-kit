import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { callDesktop } from './pipe-client.js'
import { noteSchema, knowledgeSchema, operationSchema, emptySchema } from './schema.js'

async function call(method: string, params: unknown) {
  try {
    const data = await callDesktop(method, params)
    return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
  } catch (error) {
    return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : '调用失败' }] }
  }
}
const writeAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
function createMcpServer() {
  const server = new McpServer({ name: 'learning-kit', version: '0.1.0' })
  server.registerTool('learning_kit_status', {
    description: '检查运行中的 Learning Kit 导入服务。不读取用户笔记或密钥。', inputSchema: emptySchema,
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, params => call('status', params))
  server.registerTool('import_note', {
    description: '提交一篇新笔记的标题与正文（纯文本或 Markdown）。使用唯一 requestKey 防止重试重复导入。同一 key 不可改内容。返回 pending_confirmation 只表示提案已排队，必须由用户在桌面工具中心确认才会保存。不要将待确认称为导入成功。',
    inputSchema: noteSchema, annotations: writeAnnotations
  }, params => call('import_note', params))
  server.registerTool('import_knowledge_point', {
    description: '提交一个知识点及描述到知识库。使用唯一 requestKey；待桌面用户预览确认后保存，不自动建立知识图谱关系。',
    inputSchema: knowledgeSchema, annotations: writeAnnotations
  }, params => call('import_knowledge_point', params))
  server.registerTool('import_status', {
    description: '凭 operationId 查询外部导入的当前状态、操作摘要和保存后的条目 ID；不重复返回正文。不提供确认权限或查询内部 AI 操作的能力。',
    inputSchema: operationSchema, annotations: { readOnlyHint: true, openWorldHint: false }
  }, params => call('import_status', params))
  return server
}

// stdout 由 SDK 独占传输 JSON-RPC；错误只能发 stderr，不能 console.log。
// 工厂入口同时兼容旧版 initialize 握手和新版协议协商。
serveStdio(createMcpServer, {
  legacy: 'serve',
  transport: new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 262144 }),
  onerror: () => console.error('Learning Kit MCP 传输失败')
})
