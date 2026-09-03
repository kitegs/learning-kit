import { dialog, ipcMain } from 'electron'
import { backupDatabase, getPersistenceStatus, persist, restoreDatabase } from './db'

export function registerSafetyIpcs(ipc: typeof ipcMain): void {
  ipc.handle('safety:status', () => getPersistenceStatus())
  ipc.handle('safety:retry-save', () => persist())

  ipc.handle('safety:backup:create', async () => {
    const choice = await dialog.showSaveDialog({
      title: '备份 Learning Kit 数据',
      defaultPath: `learning-kit-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'Learning Kit 备份', extensions: ['db', 'sqlite'] }]
    })
    if (choice.canceled || !choice.filePath) return null
    return backupDatabase(choice.filePath)
  })

  ipc.handle('safety:backup:restore', async () => {
    const choice = await dialog.showOpenDialog({
      title: '恢复 Learning Kit 备份',
      properties: ['openFile'],
      filters: [{ name: 'Learning Kit 备份', extensions: ['db', 'sqlite'] }]
    })
    if (choice.canceled || !choice.filePaths[0]) return false
    restoreDatabase(choice.filePaths[0])
    return true
  })
}
