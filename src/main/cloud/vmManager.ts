import type { SessionExecutionData } from '../../preload/apis/types'

type SessionStatus = 'working' | 'idle' | 'error'

export type CloudSessionSnapshot = {
  id: string
  status: SessionStatus
  isArchived: boolean
  execution?: SessionExecutionData
}

type VmInfo = {
  id?: string
  name: string
  host?: string
  location: string
}

type UbicloudVm = {
  id: string
  ip4: string | null
  location: string
  name: string
  state: string
  unix_user: string
}

const UBICLOUD_BASE_URL = 'https://api.ubicloud.com'
const IDLE_DECOMMISSION_MS = 5 * 60 * 1000
const SESSION_KEY_SEPARATOR = '\u001f'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRemoteExecution(execution: SessionExecutionData | undefined): execution is Extract<SessionExecutionData, { mode: 'remote-ssh' }> {
  return execution?.mode === 'remote-ssh'
}

function sanitizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 50) || 'session'
}

class UbicloudApi {
  private readonly token: string
  private readonly projectId: string

  constructor() {
    const token = process.env.UBI_TOKEN
    const projectId = process.env.UBI_PROJECT_ID
    if (!token) {
      throw new Error('Missing UBI_TOKEN environment variable')
    }
    if (!projectId) {
      throw new Error('Missing UBI_PROJECT_ID environment variable')
    }
    this.token = token
    this.projectId = projectId
  }

  private async request(path: string, init?: RequestInit): Promise<{ status: number; data: unknown }> {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${this.token}`)
    headers.set('Content-Type', 'application/json')
    const response = await fetch(`${UBICLOUD_BASE_URL}${path}`, {
      ...init,
      headers,
    })

    if (response.status === 204) {
      return { status: 204, data: null }
    }

    const text = await response.text()
    const data = text ? (JSON.parse(text) as unknown) : null

    if (!response.ok) {
      const message = typeof data === 'object' && data && 'error' in data
        ? ((data as { error?: { message?: string } }).error?.message ?? response.statusText)
        : response.statusText
      const err = new Error(`Ubicloud API ${response.status}: ${message}`)
      ;(err as Error & { status?: number }).status = response.status
      throw err
    }

    return { status: response.status, data }
  }

  async getVm(location: string, vmReference: string): Promise<UbicloudVm | null> {
    try {
      const { data } = await this.request(
        `/project/${encodeURIComponent(this.projectId)}/location/${encodeURIComponent(location)}/vm/${encodeURIComponent(vmReference)}`,
      )
      return data as UbicloudVm
    } catch (error) {
      if ((error as Error & { status?: number }).status === 404) {
        return null
      }
      throw error
    }
  }

  async createVm(location: string, vmName: string, execution: Extract<SessionExecutionData, { mode: 'remote-ssh' }>): Promise<UbicloudVm> {
    const publicKey = execution.publicKey ?? process.env.BROOMY_UBI_PUBLIC_KEY ?? process.env.UBI_PUBLIC_KEY
    if (!publicKey) {
      throw new Error('Missing SSH public key. Set execution.publicKey or BROOMY_UBI_PUBLIC_KEY')
    }

    const body: Record<string, unknown> = {
      public_key: publicKey,
      enable_ip4: true,
      size: execution.size,
      unix_user: execution.unixUser,
    }

    const { data } = await this.request(
      `/project/${encodeURIComponent(this.projectId)}/location/${encodeURIComponent(location)}/vm/${encodeURIComponent(vmName)}`,
      { method: 'POST', body: JSON.stringify(body) },
    )

    if (!data) throw new Error('Ubicloud create VM returned empty response')
    return data as UbicloudVm
  }

  async deleteVm(location: string, vmReference: string): Promise<void> {
    try {
      await this.request(
        `/project/${encodeURIComponent(this.projectId)}/location/${encodeURIComponent(location)}/vm/${encodeURIComponent(vmReference)}`,
        { method: 'DELETE' },
      )
    } catch (error) {
      if ((error as Error & { status?: number }).status === 404) {
        return
      }
      throw error
    }
  }
}

function getDefaultVmName(profileId: string, sessionId: string): string {
  return `broomy-${sanitizeName(profileId)}-${sanitizeName(sessionId)}`
}

export class CloudVmManager {
  private sessions = new Map<string, CloudSessionSnapshot>()
  private vmsBySession = new Map<string, VmInfo>()
  private idleTimers = new Map<string, NodeJS.Timeout>()
  private inFlight = new Map<string, Promise<void>>()

  private getSessionKey(profileId: string, sessionId: string): string {
    return `${profileId}${SESSION_KEY_SEPARATOR}${sessionId}`
  }

  private getSessionIdFromKey(sessionKey: string): string {
    const index = sessionKey.indexOf(SESSION_KEY_SEPARATOR)
    return index >= 0 ? sessionKey.slice(index + SESSION_KEY_SEPARATOR.length) : sessionKey
  }

  private getProfileIdFromKey(sessionKey: string): string {
    const index = sessionKey.indexOf(SESSION_KEY_SEPARATOR)
    return index >= 0 ? sessionKey.slice(0, index) : 'default'
  }

  private getProfilePrefix(profileId: string): string {
    return `${profileId}${SESSION_KEY_SEPARATOR}`
  }

  private runExclusive(sessionKey: string, fn: () => Promise<void>): Promise<void> {
    const previous = this.inFlight.get(sessionKey) ?? Promise.resolve()
    const next = previous.then(fn, fn)
    this.inFlight.set(sessionKey, next)
    return next.finally(() => {
      if (this.inFlight.get(sessionKey) === next) {
        this.inFlight.delete(sessionKey)
      }
    })
  }

  private getApi(): UbicloudApi {
    return new UbicloudApi()
  }

  private clearIdleTimer(sessionKey: string): void {
    const timer = this.idleTimers.get(sessionKey)
    if (timer) {
      clearTimeout(timer)
      this.idleTimers.delete(sessionKey)
    }
  }

  private isVmEligible(snapshot: CloudSessionSnapshot): boolean {
    return isRemoteExecution(snapshot.execution) && !snapshot.isArchived && snapshot.status !== 'idle'
  }

  private shouldStartIdleTimer(snapshot: CloudSessionSnapshot): boolean {
    return isRemoteExecution(snapshot.execution) && !snapshot.isArchived && snapshot.status === 'idle'
  }

  private scheduleIdleTimer(profileId: string, sessionId: string): void {
    const sessionKey = this.getSessionKey(profileId, sessionId)
    this.clearIdleTimer(sessionKey)
    const timer = setTimeout(() => {
      void this.runExclusive(sessionKey, async () => {
        const latest = this.sessions.get(sessionKey)
        if (!latest || !this.shouldStartIdleTimer(latest)) return
        await this.decommissionVmInternal(sessionKey, latest)
      })
    }, IDLE_DECOMMISSION_MS)
    this.idleTimers.set(sessionKey, timer)
  }

  private async waitForVmHost(api: UbicloudApi, location: string, vmReference: string): Promise<UbicloudVm> {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      const vm = await api.getVm(location, vmReference)
      if (vm?.ip4) {
        return vm
      }
      await sleep(2000)
    }
    throw new Error(`Timed out waiting for VM host address: ${vmReference}`)
  }

  private async ensureVmInternal(sessionKey: string, profileId: string, sessionId: string, snapshot: CloudSessionSnapshot): Promise<VmInfo> {
    if (!isRemoteExecution(snapshot.execution)) {
      throw new Error('Session execution is not remote-ssh')
    }

    const existing = this.vmsBySession.get(sessionKey)
    if (existing?.host) {
      return existing
    }

    const api = this.getApi()
    const vmName = snapshot.execution.vmName ?? getDefaultVmName(profileId, sessionId)
    const location = snapshot.execution.location

    let vm = await api.getVm(location, snapshot.execution.vmId ?? vmName)
    if (!vm) {
      vm = await api.createVm(location, vmName, snapshot.execution)
    }
    const readyVm = vm.ip4 ? vm : await this.waitForVmHost(api, location, vm.id || vm.name)

    const vmInfo: VmInfo = {
      id: readyVm.id,
      name: readyVm.name,
      host: readyVm.ip4 ?? undefined,
      location: readyVm.location,
    }
    this.vmsBySession.set(sessionKey, vmInfo)
    return vmInfo
  }

  private async decommissionVmInternal(sessionKey: string, snapshot: CloudSessionSnapshot): Promise<void> {
    this.clearIdleTimer(sessionKey)
    const vmInfo = this.vmsBySession.get(sessionKey)
    const execution = snapshot.execution
    const remoteExecution = isRemoteExecution(execution) ? execution : undefined
    const sessionId = this.getSessionIdFromKey(sessionKey)
    if (!remoteExecution && !vmInfo) {
      this.vmsBySession.delete(sessionKey)
      return
    }

    const location = vmInfo?.location ?? remoteExecution?.location
    const profileId = this.getProfileIdFromKey(sessionKey)
    const vmReference = vmInfo?.id
      ?? remoteExecution?.vmId
      ?? vmInfo?.name
      ?? remoteExecution?.vmName
      ?? (remoteExecution ? getDefaultVmName(profileId, sessionId) : undefined)
    if (!location || !vmReference) {
      this.vmsBySession.delete(sessionKey)
      return
    }

    const api = this.getApi()
    await api.deleteVm(location, vmReference)
    this.vmsBySession.delete(sessionKey)
  }

  async syncSessions(profileId: string, snapshots: CloudSessionSnapshot[]): Promise<void> {
    const nextMap = new Map<string, CloudSessionSnapshot>(
      snapshots.map((snapshot) => [this.getSessionKey(profileId, snapshot.id), snapshot]),
    )

    for (const snapshot of snapshots) {
      const sessionKey = this.getSessionKey(profileId, snapshot.id)
      const previousSnapshot = this.sessions.get(sessionKey)
      this.sessions.set(sessionKey, snapshot)
      try {
        await this.runExclusive(sessionKey, async () => {
          if (this.shouldStartIdleTimer(snapshot)) {
            const wasIdleBefore = previousSnapshot && this.shouldStartIdleTimer(previousSnapshot)
            if (!wasIdleBefore || !this.idleTimers.has(sessionKey)) {
              this.scheduleIdleTimer(profileId, snapshot.id)
            }
            return
          }

          this.clearIdleTimer(sessionKey)

          if (this.isVmEligible(snapshot)) {
            await this.ensureVmInternal(sessionKey, profileId, snapshot.id, snapshot)
            return
          }

          await this.decommissionVmInternal(sessionKey, snapshot)
        })
      } catch (error) {
        console.warn(`[cloud] Failed syncing session ${snapshot.id}:`, error)
      }
    }

    const profilePrefix = this.getProfilePrefix(profileId)
    for (const [sessionKey, previous] of this.sessions) {
      if (!sessionKey.startsWith(profilePrefix) || nextMap.has(sessionKey)) continue
      const sessionId = this.getSessionIdFromKey(sessionKey)
      try {
        await this.runExclusive(sessionKey, async () => {
          await this.decommissionVmInternal(sessionKey, previous)
        })
      } catch (error) {
        console.warn(`[cloud] Failed decommissioning removed session ${sessionId}:`, error)
      }
      this.sessions.delete(sessionKey)
    }
  }

  async ensureSessionVm(profileId: string, snapshot: CloudSessionSnapshot): Promise<VmInfo> {
    const sessionKey = this.getSessionKey(profileId, snapshot.id)
    this.sessions.set(sessionKey, snapshot)
    let vmInfo: VmInfo | undefined
    await this.runExclusive(sessionKey, async () => {
      this.clearIdleTimer(sessionKey)
      vmInfo = await this.ensureVmInternal(sessionKey, profileId, snapshot.id, snapshot)
    })
    return vmInfo!
  }

  async decommissionSessionVm(profileId: string, snapshot: CloudSessionSnapshot): Promise<void> {
    const sessionKey = this.getSessionKey(profileId, snapshot.id)
    this.sessions.set(sessionKey, snapshot)
    await this.runExclusive(sessionKey, async () => {
      await this.decommissionVmInternal(sessionKey, snapshot)
    })
    this.sessions.delete(sessionKey)
  }

  async shutdownAll(): Promise<void> {
    for (const sessionKey of this.idleTimers.keys()) {
      this.clearIdleTimer(sessionKey)
    }

    const keys = new Set<string>([
      ...this.sessions.keys(),
      ...this.vmsBySession.keys(),
      ...this.idleTimers.keys(),
    ])

    await Promise.all(Array.from(keys).map(async (sessionKey) => {
      const snapshot = this.sessions.get(sessionKey) ?? {
        id: this.getSessionIdFromKey(sessionKey),
        status: 'idle',
        isArchived: true,
      }
      try {
        await this.runExclusive(sessionKey, async () => {
          await this.decommissionVmInternal(sessionKey, snapshot)
        })
      } catch (error) {
        const sessionId = this.getSessionIdFromKey(sessionKey)
        console.warn(`[cloud] Failed to shutdown VM for session ${sessionId}:`, error)
      }
    }))

    this.sessions.clear()
    this.vmsBySession.clear()
    this.idleTimers.clear()
    this.inFlight.clear()
  }
}

export const cloudVmManager = new CloudVmManager()
