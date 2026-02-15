import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('tsProject.worker', () => {
  let mockPostMessage: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
    mockPostMessage = vi.fn()
  })

  async function runWorker(workerData: { projectRoot: string }, fsMocks: Record<string, unknown> = {}) {
    vi.doMock('worker_threads', () => ({
      parentPort: { postMessage: mockPostMessage },
      workerData,
    }))
    vi.doMock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => ''),
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(() => ({ size: 100 })),
      ...fsMocks,
    }))
    await import('./tsProject.worker')
    return mockPostMessage
  }

  it('returns mock data for E2E mode', async () => {
    await runWorker({ projectRoot: '/my/project' })

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'result',
      data: expect.objectContaining({
        projectRoot: '/my/project',
        compilerOptions: expect.any(Object),
        files: expect.any(Array),
      }),
    })
  })

  it('parses tsconfig.json and collects project files', async () => {
    await runWorker({ projectRoot: '/project' }, {
      existsSync: vi.fn((path: string) => {
        if (path === '/project/tsconfig.json') return true
        return false
      }),
      readFileSync: vi.fn((path: string) => {
        if (path === '/project/tsconfig.json') {
          return JSON.stringify({
            compilerOptions: { target: 'es2021', strict: true },
          })
        }
        if (path === '/project/src/app.ts') {
          return 'export const app = true;'
        }
        return ''
      }),
      readdirSync: vi.fn((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes) {
          if (dir === '/project') {
            return [
              { name: 'src', isDirectory: () => true },
              { name: 'tsconfig.json', isDirectory: () => false },
              { name: 'node_modules', isDirectory: () => true },
            ]
          }
          if (dir === '/project/src') {
            return [
              { name: 'app.ts', isDirectory: () => false },
              { name: 'readme.md', isDirectory: () => false },
            ]
          }
        }
        return []
      }),
      statSync: vi.fn(() => ({ size: 100 })),
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data.projectRoot).toBe('/project')
    expect(data.compilerOptions).toEqual({ target: 'es2021', strict: true })
    expect(data.files).toHaveLength(1)
    expect(data.files[0].path).toBe('src/app.ts')
  })

  it('skips directories in SKIP_DIRS', async () => {
    await runWorker({ projectRoot: '/project' }, {
      existsSync: vi.fn((path: string) => path === '/project/tsconfig.json'),
      readFileSync: vi.fn((path: string) => {
        if (path === '/project/tsconfig.json') return JSON.stringify({ compilerOptions: {} })
        return ''
      }),
      readdirSync: vi.fn((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes && dir === '/project') {
          return [
            { name: '.git', isDirectory: () => true },
            { name: 'node_modules', isDirectory: () => true },
            { name: 'dist', isDirectory: () => true },
            { name: 'build', isDirectory: () => true },
          ]
        }
        return []
      }),
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data.files).toHaveLength(0)
  })

  it('includes .ts, .tsx, .js, .jsx files', async () => {
    await runWorker({ projectRoot: '/project' }, {
      existsSync: vi.fn((path: string) => path === '/project/tsconfig.json'),
      readFileSync: vi.fn((path: string) => {
        if (path === '/project/tsconfig.json') return JSON.stringify({ compilerOptions: {} })
        return 'content'
      }),
      readdirSync: vi.fn((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes && dir === '/project') {
          return [
            { name: 'a.ts', isDirectory: () => false },
            { name: 'b.tsx', isDirectory: () => false },
            { name: 'c.js', isDirectory: () => false },
            { name: 'd.jsx', isDirectory: () => false },
            { name: 'e.css', isDirectory: () => false },
          ]
        }
        return []
      }),
      statSync: vi.fn(() => ({ size: 50 })),
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data.files).toHaveLength(4)
  })

  it('skips files larger than 1MB', async () => {
    await runWorker({ projectRoot: '/project' }, {
      existsSync: vi.fn((path: string) => path === '/project/tsconfig.json'),
      readFileSync: vi.fn((path: string) => {
        if (path === '/project/tsconfig.json') return JSON.stringify({ compilerOptions: {} })
        return 'content'
      }),
      readdirSync: vi.fn((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes && dir === '/project') {
          return [
            { name: 'small.ts', isDirectory: () => false },
            { name: 'huge.ts', isDirectory: () => false },
          ]
        }
        return []
      }),
      statSync: vi.fn((path: string) => {
        if (path === '/project/huge.ts') return { size: 2 * 1024 * 1024 }
        return { size: 100 }
      }),
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data.files).toHaveLength(1)
    expect(data.files[0].path).toBe('small.ts')
  })

  it('handles tsconfig with extends', async () => {
    await runWorker({ projectRoot: '/project' }, {
      existsSync: vi.fn((path: string) => {
        if (path === '/project/tsconfig.json') return true
        if (path === '/project/tsconfig.base.json') return true
        return false
      }),
      readFileSync: vi.fn((path: string) => {
        if (path === '/project/tsconfig.json') {
          return JSON.stringify({
            extends: './tsconfig.base.json',
            compilerOptions: { strict: true },
          })
        }
        if (path === '/project/tsconfig.base.json') {
          return JSON.stringify({
            compilerOptions: { target: 'es2020', module: 'esnext' },
          })
        }
        return ''
      }),
      readdirSync: vi.fn(() => []),
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data.compilerOptions).toEqual({
      target: 'es2020',
      module: 'esnext',
      strict: true,
    })
  })

  it('handles tsconfig with comments', async () => {
    await runWorker({ projectRoot: '/project' }, {
      existsSync: vi.fn((path: string) => path === '/project/tsconfig.json'),
      readFileSync: vi.fn((path: string) => {
        if (path === '/project/tsconfig.json') {
          return `{
            // This is a comment
            "compilerOptions": {
              "target": "es2020" /* inline comment */
            }
          }`
        }
        return ''
      }),
      readdirSync: vi.fn(() => []),
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data.compilerOptions).toEqual({ target: 'es2020' })
  })

  it('handles missing tsconfig.json gracefully', async () => {
    await runWorker({ projectRoot: '/project' })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data.projectRoot).toBe('/project')
    expect(data.compilerOptions).toEqual({})
    expect(data.files).toEqual([])
  })

  it('handles extends from node_modules', async () => {
    await runWorker({ projectRoot: '/project' }, {
      existsSync: vi.fn((path: string) => {
        if (path === '/project/tsconfig.json') return true
        if (path === '/project/node_modules/@tsconfig/node18/tsconfig.json') return true
        return false
      }),
      readFileSync: vi.fn((path: string) => {
        if (path === '/project/tsconfig.json') {
          return JSON.stringify({
            extends: '@tsconfig/node18/tsconfig.json',
            compilerOptions: { outDir: './dist' },
          })
        }
        if (path === '/project/node_modules/@tsconfig/node18/tsconfig.json') {
          return JSON.stringify({
            compilerOptions: { target: 'es2023', module: 'node16' },
          })
        }
        return ''
      }),
      readdirSync: vi.fn(() => []),
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data.compilerOptions).toEqual({
      target: 'es2023',
      module: 'node16',
      outDir: './dist',
    })
  })

  it('handles unreadable directories gracefully', async () => {
    await runWorker({ projectRoot: '/project' }, {
      existsSync: vi.fn((path: string) => path === '/project/tsconfig.json'),
      readFileSync: vi.fn((path: string) => {
        if (path === '/project/tsconfig.json') return JSON.stringify({ compilerOptions: {} })
        return ''
      }),
      readdirSync: vi.fn((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes && dir === '/project') {
          return [{ name: 'src', isDirectory: () => true }]
        }
        if (opts?.withFileTypes && dir === '/project/src') {
          throw new Error('EACCES')
        }
        return []
      }),
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data.files).toHaveLength(0)
  })

  it('limits extends chain depth to 5', async () => {
    await runWorker({ projectRoot: '/project' }, {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn((path: string) => {
        if (String(path).includes('tsconfig')) {
          return JSON.stringify({
            extends: './tsconfig.json',
            compilerOptions: { strict: true },
          })
        }
        return ''
      }),
      readdirSync: vi.fn(() => []),
    })

    // Should not infinite loop
    const data = mockPostMessage.mock.calls[0][0].data
    expect(data.projectRoot).toBe('/project')
  })

  it('discovers monorepo tsconfigs in subdirectories', async () => {
    await runWorker({ projectRoot: '/project' }, {
      existsSync: vi.fn((path: string) => {
        if (path === '/project/tsconfig.json') return false
        if (path === '/project/packages/tsconfig.json') return true
        if (path === '/project/apps/tsconfig.json') return true
        return false
      }),
      readFileSync: vi.fn((path: string) => {
        if (path === '/project/packages/tsconfig.json') {
          return JSON.stringify({ compilerOptions: { target: 'es2021', baseUrl: '.' } })
        }
        if (path === '/project/apps/tsconfig.json') {
          return JSON.stringify({ compilerOptions: { target: 'es2022', baseUrl: './' } })
        }
        return ''
      }),
      readdirSync: vi.fn((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes && dir === '/project') {
          return [
            { name: 'packages', isDirectory: () => true },
            { name: 'apps', isDirectory: () => true },
            { name: '.git', isDirectory: () => true },
            { name: 'node_modules', isDirectory: () => true },
          ]
        }
        if (opts?.withFileTypes) return []
        return []
      }),
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data.compilerOptions.target).toBe('es2021')
    expect(data.compilerOptions.paths).toEqual({
      '*': ['packages/*', 'apps/*'],
    })
  })

  it('posts error message when getProjectContext throws', async () => {
    vi.doMock('worker_threads', () => ({
      parentPort: { postMessage: mockPostMessage },
      workerData: null,
    }))
    vi.doMock('fs', () => ({
      existsSync: vi.fn(() => { throw new Error('fatal') }),
      readFileSync: vi.fn(),
      readdirSync: vi.fn(),
      statSync: vi.fn(),
    }))
    await import('./tsProject.worker')

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' }),
    )
  })
})
