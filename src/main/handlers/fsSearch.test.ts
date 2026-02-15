import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../workerPool', () => ({
  runInWorker: vi.fn(),
}))

import { runInWorker } from '../workerPool'
import { register } from './fsSearch'
import type { HandlerContext } from './types'

function createMockCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
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

function setupHandlers(ctx?: HandlerContext) {
  const handlers: Record<string, Function> = {}
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers[channel] = handler
    }),
  }
  register(mockIpcMain as never, ctx ?? createMockCtx())
  return handlers
}

describe('fsSearch handler', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('registers fs:search channel', () => {
    const handlers = setupHandlers()
    expect(handlers['fs:search']).toBeDefined()
  })

  it('returns empty array in E2E mode', async () => {
    const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
    const result = await handlers['fs:search'](null, '/dir', 'query')
    expect(result).toEqual([])
    expect(runInWorker).not.toHaveBeenCalled()
  })

  it('delegates to runInWorker in normal mode', async () => {
    const mockResults = [{ name: 'file.ts', path: '/dir/file.ts', matchType: 'filename' }]
    vi.mocked(runInWorker).mockResolvedValue(mockResults)

    const handlers = setupHandlers()
    const result = await handlers['fs:search'](null, '/project', 'search')
    expect(result).toEqual(mockResults)
    expect(runInWorker).toHaveBeenCalledWith(
      expect.stringContaining('fsSearch.worker.js'),
      { dirPath: '/project', query: 'search' },
    )
  })
})
