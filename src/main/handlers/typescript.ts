import { IpcMain } from 'electron'
import { join } from 'path'
import { runInWorker } from '../workerPool'
import { HandlerContext } from './types'

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('ts:getProjectContext', async (_event, projectRoot: string) => {
    if (ctx.isE2ETest) {
      return {
        projectRoot,
        compilerOptions: { target: 'es2020', module: 'esnext', jsx: 'react-jsx', strict: true, esModuleInterop: true },
        files: [
          { path: 'src/index.ts', content: 'export const test = true;\n' },
          { path: 'src/utils.ts', content: 'export function add(a: number, b: number) { return a + b; }\n' },
        ],
      }
    }

    const workerPath = join(__dirname, 'workers/tsProject.worker.js')
    return runInWorker(workerPath, { projectRoot })
  })
}
