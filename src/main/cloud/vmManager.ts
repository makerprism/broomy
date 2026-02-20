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
  private sessionProfiles = new Map<string, string>()
  private idleTimers = new Map<string, NodeJS.Timeout>()
  private inFlight = new Map<string, Promise<void>>()

  private runExclusive(sessionId: string, fn: () => Promise<void>): Promise<void> {
    const previous = this.inFlight.get(sessionId) ?? Promise.resolve()
    const next = previous.then(fn, fn)
    this.inFlight.set(sessionId, next)
    return next.finally(() => {
      if (this.inFlight.get(sessionId) === next) {
        this.inFlight.delete(sessionId)
      }
    })
  }

  private getApi(): UbicloudApi {
    return new UbicloudApi()
  }

  private clearIdleTimer(sessionId: string): void {
    const timer = this.idleTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.idleTimers.delete(sessionId)
    }
  }

  private isVmEligible(snapshot: CloudSessionSnapshot): boolean {
    return isRemoteExecution(snapshot.execution) && !snapshot.isArchived && snapshot.status !== 'idle'
  }

  private shouldStartIdleTimer(snapshot: CloudSessionSnapshot): boolean {
    return isRemoteExecution(snapshot.execution) && !snapshot.isArchived && snapshot.status === 'idle'
  }

  private scheduleIdleTimer(sessionId: string): void {
    this.clearIdleTimer(sessionId)
    const timer = setTimeout(() => {
      void this.runExclusive(sessionId, async () => {
        const latest = this.sessions.get(sessionId)
        if (!latest || !this.shouldStartIdleTimer(latest)) return
        await this.decommissionVmInternal(sessionId, latest)
      })
    }, IDLE_DECOMMISSION_MS)
    this.idleTimers.set(sessionId, timer)
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

  private async ensureVmInternal(profileId: string, sessionId: string, snapshot: CloudSessionSnapshot): Promise<VmInfo> {
    if (!isRemoteExecution(snapshot.execution)) {
      throw new Error('Session execution is not remote-ssh')
    }

    const existing = this.vmsBySession.get(sessionId)
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
    this.vmsBySession.set(sessionId, vmInfo)
    return vmInfo
  }

  private async decommissionVmInternal(sessionId: string, snapshot: CloudSessionSnapshot): Promise<void> {
    this.clearIdleTimer(sessionId)
    const vmInfo = this.vmsBySession.get(sessionId)
    const execution = snapshot.execution
    const remoteExecution = isRemoteExecution(execution) ? execution : undefined
    if (!remoteExecution && !vmInfo) {
      this.vmsBySession.delete(sessionId)
      return
    }

    const location = vmInfo?.location ?? remoteExecution?.location
    const profileId = this.sessionProfiles.get(sessionId) ?? 'default'
    const vmReference = vmInfo?.id
      ?? remoteExecution?.vmId
      ?? vmInfo?.name
      ?? remoteExecution?.vmName
      ?? (remoteExecution ? getDefaultVmName(profileId, sessionId) : undefined)
    if (!location || !vmReference) {
      this.vmsBySession.delete(sessionId)
      return
    }

    const api = this.getApi()
    await api.deleteVm(location, vmReference)
    this.vmsBySession.delete(sessionId)
  }

  async syncSessions(profileId: string, snapshots: CloudSessionSnapshot[]): Promise<void> {
    const nextMap = new Map<string, CloudSessionSnapshot>(snapshots.map((snapshot) => [snapshot.id, snapshot]))

    for (const snapshot of snapshots) {
      const previousSnapshot = this.sessions.get(snapshot.id)
      this.sessions.set(snapshot.id, snapshot)
      this.sessionProfiles.set(snapshot.id, profileId)
      try {
        await this.runExclusive(snapshot.id, async () => {
          if (this.shouldStartIdleTimer(snapshot)) {
            const wasIdleBefore = previousSnapshot && this.shouldStartIdleTimer(previousSnapshot)
            if (!wasIdleBefore || !this.idleTimers.has(snapshot.id)) {
              this.scheduleIdleTimer(snapshot.id)
            }
            return
          }

          this.clearIdleTimer(snapshot.id)

          if (this.isVmEligible(snapshot)) {
            await this.ensureVmInternal(profileId, snapshot.id, snapshot)
            return
          }

          await this.decommissionVmInternal(snapshot.id, snapshot)
        })
      } catch (error) {
        console.warn(`[cloud] Failed syncing session ${snapshot.id}:`, error)
      }
    }

    for (const [sessionId, previous] of this.sessions) {
      if (nextMap.has(sessionId)) continue
      try {
        await this.runExclusive(sessionId, async () => {
          await this.decommissionVmInternal(sessionId, previous)
        })
      } catch (error) {
        console.warn(`[cloud] Failed decommissioning removed session ${sessionId}:`, error)
      }
      this.sessions.delete(sessionId)
      this.sessionProfiles.delete(sessionId)
    }
  }

  async ensureSessionVm(profileId: string, snapshot: CloudSessionSnapshot): Promise<VmInfo> {
    this.sessions.set(snapshot.id, snapshot)
    this.sessionProfiles.set(snapshot.id, profileId)
    let vmInfo: VmInfo | undefined
    await this.runExclusive(snapshot.id, async () => {
      this.clearIdleTimer(snapshot.id)
      vmInfo = await this.ensureVmInternal(profileId, snapshot.id, snapshot)
    })
    return vmInfo!
  }

  async decommissionSessionVm(snapshot: CloudSessionSnapshot): Promise<void> {
    this.sessions.set(snapshot.id, snapshot)
    await this.runExclusive(snapshot.id, async () => {
      await this.decommissionVmInternal(snapshot.id, snapshot)
    })
    this.sessionProfiles.delete(snapshot.id)
  }

  async shutdownAll(): Promise<void> {
    for (const sessionId of this.idleTimers.keys()) {
      this.clearIdleTimer(sessionId)
    }

    const ids = new Set<string>([
      ...this.sessions.keys(),
      ...this.vmsBySession.keys(),
      ...this.sessionProfiles.keys(),
    ])

    await Promise.all(Array.from(ids).map(async (sessionId) => {
      const snapshot = this.sessions.get(sessionId) ?? {
        id: sessionId,
        status: 'idle',
        isArchived: true,
      }
      try {
        await this.runExclusive(sessionId, async () => {
          await this.decommissionVmInternal(sessionId, snapshot)
        })
      } catch (error) {
        console.warn(`[cloud] Failed to shutdown VM for session ${sessionId}:`, error)
      }
    }))

    this.sessionProfiles.clear()
  }
}

export const cloudVmManager = new CloudVmManager()
