export interface McpStatus {
  enabled: boolean
  running: boolean
  pending: number
  error: string | null
}
export interface McpClientConfig {
  mcpServers: { 'learning-kit': { command: string; args: string[]; env: { LK_MCP_PIPE: string; LK_MCP_TOKEN: string } } }
}
