import { app, BrowserWindow, dialog, ipcMain, shell, protocol } from 'electron'
import { join } from 'path'
import { consumeStartupRecoveryNotice, getPersistenceStatus, initDb, persist } from './db'
import { registerAiIpcs } from './ai'
import { registerDbIpcs } from './ipc-db'
import { registerBookIpcs, registerBookProtocol } from './book'
import { registerSrsIpcs } from './srs'
import { registerNoteIpcs } from './notes'
import { registerSearchIpcs } from './search'
import { registerPrdV3Ipcs } from './prd-v3'
import { startDrawioServer, stopDrawioServer } from './drawio-server'
import { registerSafetyIpcs } from './safety'
import { registerToolIpcs } from './tool-service'
import { registerOcrIpcs, terminateOcr } from './ocr'

// UI tests run the real app against an isolated disposable profile. Production
// launches never set this variable and continue to use Electron's normal path.
const isolatedUserData = process.env['LK_E2E_USER_DATA_DIR']
if (isolatedUserData) app.setPath('userData', isolatedUserData)

// register privileged scheme before any app ready (CSP + fetch support)
protocol.registerSchemesAsPrivileged([
  { scheme: 'book', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

let mainWindow: BrowserWindow | null = null
let allowWindowClose = false
let closeFallback: NodeJS.Timeout | null = null
let databaseReady = false

function createWindow(): void {
  allowWindowClose = false
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Learning Kit',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // disable built-in Ctrl+wheel pinch zoom and Ctrl+/- shortcuts
    // we want our own wheel logic to handle zoom, not Chromium's
    mainWindow?.webContents.setVisualZoomLevelLimits(1, 1)
  })

  mainWindow.on('close', (event) => {
    if (allowWindowClose) return
    event.preventDefault()
    mainWindow?.webContents.send('app:before-close')
    if (closeFallback) clearTimeout(closeFallback)
    closeFallback = setTimeout(() => {
      closeFallback = null
      if (!persist()) {
        dialog.showErrorBox('数据尚未保存', `无法安全关闭 Learning Kit：${getPersistenceStatus().message || '本地资料库写入失败'}。请检查磁盘空间或权限后重试。`)
        return
      }
      allowWindowClose = true
      mainWindow?.destroy()
    }, 2500)
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    // swallow Ctrl+= / Ctrl+- / Ctrl+0 so our renderer controls zoom
    if (input.control && (input.key === '=' || input.key === '-' || input.key === '0')) {
      event.preventDefault()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await initDb()
  databaseReady = true
  registerBookProtocol()
  registerDbIpcs(ipcMain)
  registerAiIpcs(ipcMain)
  registerBookIpcs(ipcMain)
  registerSrsIpcs(ipcMain)
  registerNoteIpcs(ipcMain)
  registerSearchIpcs(ipcMain)
  registerPrdV3Ipcs(ipcMain)
  registerSafetyIpcs(ipcMain)
  registerToolIpcs(ipcMain)
  registerOcrIpcs(ipcMain)
  ipcMain.handle('app:close-ready', () => {
    if (closeFallback) clearTimeout(closeFallback)
    closeFallback = null
    if (!persist()) {
      dialog.showErrorBox('数据尚未保存', `无法安全关闭 Learning Kit：${getPersistenceStatus().message || '本地资料库写入失败'}。请检查磁盘空间或权限后重试。`)
      return false
    }
    allowWindowClose = true
    mainWindow?.close()
    return true
  })

  // Start draw.io static file server
  const drawioPort = await startDrawioServer()
  ipcMain.handle('drawio:port', () => drawioPort)

  createWindow()

  const recovery = consumeStartupRecoveryNotice()
  if (recovery && !isolatedUserData) {
    const options = {
      type: 'warning',
      title: '已恢复本地资料库',
      message: 'Learning Kit 检测到主资料库异常，已从最近有效副本恢复。',
      detail: recovery.corruptPath
        ? `异常文件已保留在：${recovery.corruptPath}\n恢复来源：${recovery.recoveredFrom}`
        : `恢复来源：${recovery.recoveredFrom}`
    } as const
    void (mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  dialog.showErrorBox('无法打开本地资料库', `${message}\n\nLearning Kit 未创建空资料库，也没有覆盖原文件。`)
  app.quit()
})

app.on('window-all-closed', () => {
  stopDrawioServer()
  void terminateOcr()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (!databaseReady) return
  if (!persist()) {
    event.preventDefault()
    dialog.showErrorBox('数据尚未保存', `无法退出 Learning Kit：${getPersistenceStatus().message || '本地资料库写入失败'}。请检查磁盘空间或权限后重试。`)
  }
})
