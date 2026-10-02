// 共享元信息仅描述能力，不替代主进程的来源绑定、参数校验和事务检查。
export const toolDefinitions = {
  create_note: { label: '创建笔记', supported: true, confirm: false },
  append_note: { label: '追加笔记', supported: true, confirm: false },
  add_bookmark: { label: '添加书签', supported: true, confirm: false },
  create_flashcard: { label: '创建闪卡', supported: true, confirm: true },
  create_flashcard_from_error: { label: '错题转闪卡', supported: true, confirm: true },
  create_mindmap: { label: '创建思维导图', supported: true, confirm: true },
  create_plan: { label: '创建学习计划', supported: true, confirm: true },
  create_conversation: { label: '创建对话', supported: true, confirm: true },
  create_exercise_set: { label: '创建习题集', supported: true, confirm: true },
  create_knowledge_point: { label: '创建知识点', supported: true, confirm: true },
  create_diagram: { label: '创建 Draw.io 图表', supported: true, confirm: true },
  organize_note: { label: '整理笔记', supported: false, confirm: true },
  delete: { label: '删除资料', supported: false, confirm: true },
  replace_note: { label: '替换笔记', supported: false, confirm: true },
  bulk_move: { label: '批量移动', supported: false, confirm: true },
  import_restore: { label: '恢复导入', supported: false, confirm: true },
  security_change: { label: '修改安全设置', supported: false, confirm: true }
} as const
export type ToolAction = keyof typeof toolDefinitions
export type ToolSource = 'internal-ai' | 'mcp' | 'renderer'
export type ToolStatus = 'pending_confirmation' | 'applied' | 'failed' | 'undone' | 'rejected'
export function toolLabel(action: string): string {
  return Object.hasOwn(toolDefinitions, action) ? toolDefinitions[action as ToolAction].label : `未知操作：${action}`
}
export function supportedTool(action: string): action is ToolAction {
  return Object.hasOwn(toolDefinitions, action) && toolDefinitions[action as ToolAction].supported
}
export function toolStatusLabel(status: string): string {
  return ({ pending_confirmation: '待确认', applied: '已执行', failed: '失败', rejected: '已拒绝', undone: '已撤销' } as Record<string, string>)[status] || status
}
export interface ToolCenterRow {
  id: string; action: ToolAction; source: ToolSource; status: ToolStatus
  preview: string; affected: string[]; error: string | null; createdAt: string
}
export interface ToolCenterQuery {
  source?: ToolSource
  status?: Exclude<ToolStatus, 'pending_confirmation'>
  pendingPage?: number; historyPage?: number
}
export interface ToolCenterPage { items: ToolCenterRow[]; total: number; page: number; pageSize: number }
export interface ToolCenterSnapshot { pending: ToolCenterPage; history: ToolCenterPage }
