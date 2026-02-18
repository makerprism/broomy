import { ipcRenderer } from 'electron'

export type ShellApi = {
  exec: (command: string, cwd: string) => Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>
  openExternal: (url: string) => Promise<void>
}

export type DialogApi = {
  openFolder: () => Promise<string | null>
}

export type AppApi = {
  isDev: () => Promise<boolean>
  homedir: () => Promise<string>
  platform: () => Promise<string>
  tmpdir: () => Promise<string>
  getVersion: () => Promise<string>
}

export type UpdateCheckResult = {
  updateAvailable: boolean
  version?: string
  releaseNotes?: string
}

export type UpdateApi = {
  checkForUpdates: () => Promise<UpdateCheckResult>
  downloadUpdate: () => Promise<void>
  installUpdate: () => void
  onDownloadProgress: (callback: (percent: number) => void) => () => void
  onUpdateDownloaded: (callback: () => void) => () => void
}

export const shellApi: ShellApi = {
  exec: (command, cwd) => ipcRenderer.invoke('shell:exec', command, cwd),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
}

export const dialogApi: DialogApi = {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
}

export const appApi: AppApi = {
  isDev: () => ipcRenderer.invoke('app:isDev'),
  homedir: () => ipcRenderer.invoke('app:homedir'),
  platform: () => ipcRenderer.invoke('app:platform'),
  tmpdir: () => ipcRenderer.invoke('app:tmpdir'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
}

export const updateApi: UpdateApi = {
  checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
  downloadUpdate: () => ipcRenderer.invoke('updater:downloadUpdate'),
  installUpdate: () => { void ipcRenderer.invoke('updater:installUpdate') },
  onDownloadProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, percent: number) => callback(percent)
    ipcRenderer.on('updater:downloadProgress', handler)
    return () => ipcRenderer.removeListener('updater:downloadProgress', handler)
  },
  onUpdateDownloaded: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('updater:updateDownloaded', handler)
    return () => ipcRenderer.removeListener('updater:updateDownloaded', handler)
  },
}
