import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { CloudVmManager } from './vmManager'

function mockResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 404 ? 'Not Found' : 'OK',
    text: vi.fn().mockResolvedValue(body === null || body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response
}

describe('CloudVmManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    process.env.UBI_TOKEN = 'token'
    process.env.UBI_PROJECT_ID = 'project-1'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete process.env.UBI_TOKEN
    delete process.env.UBI_PROJECT_ID
  })

  it('uses profile-specific default VM name when ensuring a VM', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockResponse(404, { error: { message: 'not found' } }))
      .mockResolvedValueOnce(mockResponse(200, {
        id: 'vm-123',
        ip4: '203.0.113.10',
        location: 'eu-central-h1',
        name: 'broomy-work-profile-session-abc',
        state: 'running',
        unix_user: 'ubuntu',
      }))

    vi.stubGlobal('fetch', fetchMock)

    const manager = new CloudVmManager()
    const vm = await manager.ensureSessionVm('work-profile', {
      id: 'session-abc',
      status: 'working',
      isArchived: false,
      execution: {
        mode: 'remote-ssh',
        provider: 'ubicloud',
        location: 'eu-central-h1',
        size: 'standard-2',
        remoteDir: '~/workspace',
        unixUser: 'ubuntu',
        publicKey: 'ssh-ed25519 AAAATEST',
      },
    })

    expect(vm.name).toBe('broomy-work-profile-session-abc')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/location/eu-central-h1/vm/broomy-work-profile-session-abc'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('decommissions idle remote sessions after idle timeout', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(204, null))
    vi.stubGlobal('fetch', fetchMock)

    const manager = new CloudVmManager()
    const syncPromise = manager.syncSessions('default', [{
      id: 'session-idle',
      status: 'idle',
      isArchived: false,
      execution: {
        mode: 'remote-ssh',
        provider: 'ubicloud',
        location: 'eu-central-h1',
        size: 'standard-2',
        remoteDir: '~/workspace',
        unixUser: 'ubuntu',
        vmName: 'broomy-idle-vm',
      },
    }])

    await syncPromise
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/location/eu-central-h1/vm/broomy-idle-vm'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
