/**
 * 管理 AI 请求的生命周期，不负责调用模型或更新界面。
 * 每条请求始终归属于发起它的渲染进程，直到请求处理函数的 finally 释放记录。
 */
export class AiRequestRegistry {
  // 两层索引：WebContents.id → 请求 ID → 取消控制器。
  // 不同渲染进程可以使用相同请求 ID；取消操作只能影响自己的请求。
  private readonly owners = new Map<number, Map<string, AbortController>>()

  /** 注册请求并返回控制器；调用方把其 signal 交给 fetch。 */
  begin(owner: number, id: string): AbortController {
    if (typeof id !== 'string' || !id.trim() || id.length > 200) throw new Error('AI 请求 ID 无效')
    const requests = this.owners.get(owner) ?? new Map<string, AbortController>()
    // 禁止覆盖仍在运行的控制器，否则旧请求会失去取消入口。
    if (requests.has(id)) throw new Error('该 AI 请求仍在处理中，请使用新的请求 ID')
    const controller = new AbortController()
    requests.set(id, controller)
    this.owners.set(owner, requests)
    return controller
  }

  abort(owner: number, id: string): void {
    // abort 只发出取消信号，不代表异步代码已经退出。
    // 此处不能删除记录：等调用方执行 finally 后，才允许复用这个 ID。
    // 不存在的请求无需处理，因此重复点击“停止”也是安全的。
    this.owners.get(owner)?.get(id)?.abort()
  }

  release(owner: number, id: string, controller: AbortController): void {
    const requests = this.owners.get(owner)
    // 比较对象身份，而不只是 ID：旧请求的迟到清理不能删除新请求的控制器。
    if (requests?.get(id) !== controller) return
    requests.delete(id)
    // 最后一条请求结束时也移除外层索引，避免长期保留空分组。
    if (!requests.size) this.owners.delete(owner)
  }

  abortOwner(owner: number): void {
    // 渲染进程销毁后，取消其全部网络请求；记录仍由各自 finally 释放。
    for (const controller of this.owners.get(owner)?.values() ?? []) controller.abort()
  }
}
