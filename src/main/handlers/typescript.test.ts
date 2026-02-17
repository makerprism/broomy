import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../workerPool', () => ({
  runInWorker: vi.fn(),
}))

vi.mock('electron', () => ({
  IpcMain: {},
}))

import { runInWorker } from '../workerPool'
import { register } from './typescript'
import type { HandlerContext } from './types'

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
  } as HandlerContext
}

function setupHandlers(ctx?: HandlerContext) {
  const handlers: Record<string, Function> = {}
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers[channel] = handler
    }),
  }
  register(mockIpcMain as never, ctx ?? createCtx())
  return handlers
}

describe('typescript handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers ts:getProjectContext channel', () => {
    const handlers = setupHandlers()
    expect(handlers['ts:getProjectContext']).toBeDefined()
  })

  describe('ts:getProjectContext', () => {
    it('returns mock data in E2E mode', async () => {
      const handlers = setupHandlers(createCtx({ isE2ETest: true }))
      const result = await handlers['ts:getProjectContext']({}, '/my/project')
      expect(result).toEqual({
        projectRoot: '/my/project',
        compilerOptions: {
          target: 'es2020',
          module: 'esnext',
          jsx: 'react-jsx',
          strict: true,
          esModuleInterop: true,
        },
        files: [
          { path: 'src/index.ts', content: 'export const test = true;\n' },
          { path: 'src/utils.ts', content: 'export function add(a: number, b: number) { return a + b; }\n' },
        ],
      })
      expect(runInWorker).not.toHaveBeenCalled()
    })

    it('delegates to runInWorker in normal mode', async () => {
      const mockResult = {
        projectRoot: '/project',
        compilerOptions: { target: 'es2021', strict: true },
        files: [{ path: 'src/app.ts', content: 'export const app = true;' }],
      }
      vi.mocked(runInWorker).mockResolvedValue(mockResult)

      const handlers = setupHandlers()
      const result = await handlers['ts:getProjectContext']({}, '/project')
      expect(result).toEqual(mockResult)
      const workerPath = vi.mocked(runInWorker).mock.calls[0][0]
      expect(workerPath).toContain('tsProject.worker.js')
      expect(workerPath).not.toContain('../workers')
      expect(runInWorker).toHaveBeenCalledWith(
        expect.stringContaining('tsProject.worker.js'),
        { projectRoot: '/project' },
      )
    })
  })
})
