import { app, BrowserWindow, ipcMain, shell, protocol } from 'electron'
import { join } from 'path'
import { initDb } from './db'
import { registerAiIpcs } from './ai'
import { registerDbIpcs } from './ipc-db'
import { registerBookIpcs, registerBookProtocol } from './book'
import { registerSrsIpcs } from './srs'
import { registerNoteIpcs } from './notes'
import { registerSearchIpcs } from './search'

// register privileged scheme before any app ready (CSP + fetch support)
protocol.registerSchemesAsPrivileged([
  { scheme: 'book', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
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
  // register custom protocol before windows are created
  registerBookProtocol()
  registerDbIpcs(ipcMain)
  registerAiIpcs(ipcMain)
  registerBookIpcs(ipcMain)
  registerSrsIpcs(ipcMain)
  registerNoteIpcs(ipcMain)
  registerSearchIpcs(ipcMain)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})