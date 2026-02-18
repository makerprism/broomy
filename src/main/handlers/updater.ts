import { BrowserWindow, IpcMain } from 'electron'
import { autoUpdater, UpdateInfo } from 'electron-updater'
import { HandlerContext } from './types'

export type UpdateCheckResult = {
  updateAvailable: boolean
  version?: string
  releaseNotes?: string
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  // In E2E or dev mode, return mock/no-op responses
  if (ctx.isE2ETest || ctx.isDev) {
    ipcMain.handle('updater:checkForUpdates', (): UpdateCheckResult => ({
      updateAvailable: false,
    }))
    ipcMain.handle('updater:downloadUpdate', () => {})
    ipcMain.handle('updater:installUpdate', () => {})
    return
  }

  // Configure electron-updater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Forward download progress to all renderer windows
  autoUpdater.on('download-progress', (progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('updater:downloadProgress', progress.percent)
    }
  })

  autoUpdater.on('update-downloaded', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('updater:updateDownloaded')
    }
  })

  ipcMain.handle('updater:checkForUpdates', async (): Promise<UpdateCheckResult> => {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result?.updateInfo) {
        return { updateAvailable: false }
      }
      const info: UpdateInfo = result.updateInfo
      const isNewer = info.version !== autoUpdater.currentVersion?.version
      if (!isNewer) {
        return { updateAvailable: false }
      }
      const releaseNotes = typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n) => (typeof n === 'string' ? n : n.note)).join('\n')
          : undefined
      return {
        updateAvailable: true,
        version: info.version,
        releaseNotes,
      }
    } catch {
      // Network errors, rate limits, etc. — silently fail
      return { updateAvailable: false }
    }
  })

  ipcMain.handle('updater:downloadUpdate', async () => {
    await autoUpdater.downloadUpdate()
  })

  ipcMain.handle('updater:installUpdate', () => {
    autoUpdater.quitAndInstall()
  })
}
