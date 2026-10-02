import type { AiDiagnostic, AiFailureCode, AiTokenUsage } from '../shared/ai-workflow'

/** 只接收服务商实际返回的 usage；缺失或格式异常时保持未知，而非填 0。 */
export function parseTokenUsage(value: unknown): AiTokenUsage | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const counts = [raw.prompt_tokens, raw.completion_tokens, raw.total_tokens]
  if (!counts.every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)) return null
  return { input: counts[0] as number, output: counts[1] as number, total: counts[2] as number }
}

/** 单调时钟不受系统校时影响；墙上时间只用于界面显示请求日期。 */
export class AiRequestDiagnostic {
  private readonly start: number
  private first: number | null = null
  private usage: AiTokenUsage | null = null
  constructor(private readonly meta: Pick<AiDiagnostic, 'id' | 'requestId' | 'conversationId' | 'provider' | 'model' | 'startedAt'>, private readonly clock = () => performance.now()) {
    this.start = clock()
  }
  content(): void { if (this.first === null) this.first = Math.max(0, this.clock() - this.start) }
  tokens(value: unknown): void { const usage = parseTokenUsage(value); if (usage) this.usage = usage }
  finish(status: AiDiagnostic['status'], failureCode?: AiFailureCode, httpStatus?: number): AiDiagnostic {
    return { ...this.meta, durationMs: Math.round(Math.max(0, this.clock() - this.start)), firstContentMs: this.first === null ? null : Math.round(this.first), status, failureCode, httpStatus, usage: this.usage }
  }
}
