import { IpcMain } from 'electron'
import { cloudVmManager, type CloudSessionSnapshot } from '../cloud/vmManager'
import type { HandlerContext } from './types'

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('cloud:syncSessions', async (_event, profileId: string, sessions: CloudSessionSnapshot[]) => {
    if (ctx.isE2ETest) {
      return { success: true }
    }
    await cloudVmManager.syncSessions(profileId, sessions)
    return { success: true }
  })

  ipcMain.handle('cloud:ensureSessionVm', async (_event, profileId: string, session: CloudSessionSnapshot) => {
    if (ctx.isE2ETest) {
      return { success: true, host: '127.0.0.1', vmId: 'vm-e2e', vmName: 'broomy-e2e' }
    }
    try {
      const vm = await cloudVmManager.ensureSessionVm(profileId, session)
      return { success: true, host: vm.host, vmId: vm.id, vmName: vm.name }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('cloud:decommissionSessionVm', async (_event, session: CloudSessionSnapshot) => {
    if (ctx.isE2ETest) {
      return { success: true }
    }
    try {
      await cloudVmManager.decommissionSessionVm(session)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('cloud:shutdownAll', async () => {
    if (ctx.isE2ETest) {
      return { success: true }
    }
    await cloudVmManager.shutdownAll()
    return { success: true }
  })
}
