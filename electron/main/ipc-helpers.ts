import { ipcMain, IpcMainInvokeEvent } from 'electron'

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Wraps ipc.handle with a try-catch that returns { ok, data } or { ok: false, error }.
 *  The renderer calls unwrapIpc() on the promise to restore the throw-on-error behaviour. */
export function registerIpc<T>(
  ipc: typeof ipcMain,
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<T> | T
): void {
  ipc.handle(channel, async (event, ...args): Promise<IpcResult<T>> => {
    try {
      const data = await handler(event, ...args)
      return { ok: true, data }
    } catch (err: any) {
      const msg = err?.message || String(err)
      console.error(`[ipc:${channel}] ${msg}`)
      return { ok: false, error: msg }
    }
  })
}

/** Unwraps an IPC result — throws if !ok, otherwise returns data.
 *  Usage in preload:  ... = () => ipcRenderer.invoke('xxx').then(unwrapIpc) */
export function unwrapIpc<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.data
}
