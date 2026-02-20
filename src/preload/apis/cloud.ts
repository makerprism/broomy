import { ipcRenderer } from 'electron'
import type { SessionExecutionData } from './types'

export type CloudSessionSnapshot = {
  id: string
  status: 'working' | 'idle' | 'error'
  isArchived: boolean
  execution?: SessionExecutionData
}

export type CloudApi = {
  syncSessions: (profileId: string, sessions: CloudSessionSnapshot[]) => Promise<{ success: boolean }>
  ensureSessionVm: (profileId: string, session: CloudSessionSnapshot) => Promise<{ success: boolean; host?: string; vmId?: string; vmName?: string; error?: string }>
  decommissionSessionVm: (session: CloudSessionSnapshot) => Promise<{ success: boolean; error?: string }>
  shutdownAll: () => Promise<{ success: boolean }>
}

export const cloudApi: CloudApi = {
  syncSessions: (profileId, sessions) => ipcRenderer.invoke('cloud:syncSessions', profileId, sessions),
  ensureSessionVm: (profileId, session) => ipcRenderer.invoke('cloud:ensureSessionVm', profileId, session),
  decommissionSessionVm: (session) => ipcRenderer.invoke('cloud:decommissionSessionVm', session),
  shutdownAll: () => ipcRenderer.invoke('cloud:shutdownAll'),
}
