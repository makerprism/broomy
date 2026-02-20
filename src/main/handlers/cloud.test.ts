import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HandlerContext } from './types'

const mockSyncSessions = vi.fn()
const mockEnsureSessionVm = vi.fn()
const mockDecommissionSessionVm = vi.fn()
const mockShutdownAll = vi.fn()

vi.mock('../cloud/vmManager', () => ({
  cloudVmManager: {
    syncSessions: (...args: unknown[]) => mockSyncSessions(...args),
    ensureSessionVm: (...args: unknown[]) => mockEnsureSessionVm(...args),
    decommissionSessionVm: (...args: unknown[]) => mockDecommissionSessionVm(...args),
    shutdownAll: (...args: unknown[]) => mockShutdownAll(...args),
  },
}))

function createCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    isE2ETest: false,
    isScreenshotMode: false,
    isDev: false,
    isWindows: false,
    ptyProcesses: new Map(),
    ptyOwnerWindows: new Map(),
    fileWatchers: new Map(),
    watcherOwnerWindows: new Map(),
    profileWindows: new Map(),
    mainWindow: null,
    E2E_MOCK_SHELL: undefined,
    FAKE_CLAUDE_SCRIPT: undefined,
    ...overrides,
  }
}

describe('cloud handlers', () => {
  let handlers: Record<string, Function>
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers[channel] = handler
    }),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = {}
  })

  it('forwards profileId for decommission requests', async () => {
    const { register } = await import('./cloud')
    register(mockIpcMain as never, createCtx())

    const session = { id: 's1', status: 'idle', isArchived: true }
    mockDecommissionSessionVm.mockResolvedValue(undefined)

    const result = await handlers['cloud:decommissionSessionVm']({}, 'work-profile', session)

    expect(mockDecommissionSessionVm).toHaveBeenCalledWith('work-profile', session)
    expect(result).toEqual({ success: true })
  })

  it('returns e2e mock response without calling vm manager', async () => {
    const { register } = await import('./cloud')
    register(mockIpcMain as never, createCtx({ isE2ETest: true }))

    const session = { id: 's1', status: 'idle', isArchived: true }
    const result = await handlers['cloud:decommissionSessionVm']({}, 'work-profile', session)

    expect(mockDecommissionSessionVm).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true })
  })
})
