import { IpcMain } from 'electron'
import { join } from 'path'
import { runInWorker } from '../workerPool'
import { HandlerContext } from './types'

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('fs:search', async (_event, dirPath: string, query: string) => {
    if (ctx.isE2ETest) {
      return []
    }

    const workerPath = join(__dirname, 'workers/fsSearch.worker.js')
    return runInWorker(workerPath, { dirPath, query })
  })
}
