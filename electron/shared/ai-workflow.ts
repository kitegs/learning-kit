export interface AiTokenUsage { input: number; output: number; total: number }
export type AiFailureCode = 'configuration' | 'input' | 'http' | 'stream' | 'network' | 'timeout' | 'cancelled'
export interface AiDiagnostic {
  id: string
  requestId: string
  conversationId: string | null
  provider: string
  model: string
  startedAt: number
  durationMs: number
  firstContentMs: number | null
  status: 'completed' | 'failed' | 'cancelled'
  failureCode?: AiFailureCode
  httpStatus?: number
  usage: AiTokenUsage | null
}
export interface AgentToolInput { action: string; params: Record<string, unknown> }
export interface AgentStep {
  id: string
  kind: 'model' | 'tool'
  label: string
  status: 'running' | 'completed' | 'pending_confirmation' | 'applied' | 'failed' | 'rejected' | 'undone' | 'interrupted'
  attempts: number
  operationId?: string
  input?: AgentToolInput
  preview?: string
  error?: string
}
export interface AgentRun {
  id: string
  requestId: string
  conversationId: string | null
  startedAt: number
  updatedAt: number
  maxSteps: number
  usedSteps: number
  status: 'model_running' | 'awaiting_tools' | 'awaiting_confirmation' | 'executing' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
  steps: AgentStep[]
  error?: string
}
