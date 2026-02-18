import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('fsSearch.worker', () => {
  let mockPostMessage: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
    mockPostMessage = vi.fn()
  })

  async function runWorker(workerData: { dirPath: string; query: string }, fsMocks: Record<string, unknown> = {}) {
    vi.doMock('worker_threads', () => ({
      parentPort: { postMessage: mockPostMessage },
      workerData,
    }))
    vi.doMock('fs', () => ({
      readFileSync: vi.fn(() => 'no match'),
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(() => ({ size: 100 })),
      ...fsMocks,
    }))
    await import('./fsSearch.worker')
    return mockPostMessage
  }

  it('posts result message with search results', async () => {
    await runWorker({ dirPath: '/project', query: 'search' }, {
      readdirSync: vi.fn(() => [
        { name: 'search-result.ts', isDirectory: () => false },
        { name: 'other.ts', isDirectory: () => false },
      ]),
      statSync: vi.fn(() => ({ size: 100 })),
      readFileSync: vi.fn(() => 'no match here'),
    })

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'result',
      data: expect.arrayContaining([
        expect.objectContaining({ name: 'search-result.ts', matchType: 'filename' }),
      ]),
    })
    // 'other.ts' does not match 'search' in name or content
    const data = mockPostMessage.mock.calls[0][0].data
    expect(data).toHaveLength(1)
  })

  it('finds files matching by content', async () => {
    await runWorker({ dirPath: '/project', query: 'findme' }, {
      readdirSync: vi.fn(() => [
        { name: 'file.ts', isDirectory: () => false },
      ]),
      statSync: vi.fn(() => ({ size: 100 })),
      readFileSync: vi.fn(() => 'line 1\nfindme here\nline 3'),
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data).toHaveLength(1)
    expect(data[0].matchType).toBe('content')
    expect(data[0].contentMatches).toHaveLength(1)
    expect(data[0].contentMatches[0].line).toBe(2)
  })

  it('skips ignored directories', async () => {
    await runWorker({ dirPath: '/project', query: 'match' }, {
      readdirSync: vi.fn((dir: string) => {
        if (String(dir) === '/project') {
          return [
            { name: 'node_modules', isDirectory: () => true },
            { name: '.git', isDirectory: () => true },
            { name: 'src', isDirectory: () => true },
          ]
        }
        if (String(dir) === '/project/src') {
          return [
            { name: 'match.ts', isDirectory: () => false },
          ]
        }
        return []
      }),
      statSync: vi.fn(() => ({ size: 100 })),
      readFileSync: vi.fn(() => 'no match'),
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('match.ts')
  })

  it('skips binary extensions for content search', async () => {
    const readFileSync = vi.fn()
    await runWorker({ dirPath: '/project', query: 'image' }, {
      readdirSync: vi.fn(() => [
        { name: 'image.png', isDirectory: () => false },
      ]),
      readFileSync,
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data).toHaveLength(1)
    expect(data[0].matchType).toBe('filename')
    expect(data[0].contentMatches).toEqual([])
    expect(readFileSync).not.toHaveBeenCalled()
  })

  it('skips files larger than MAX_FILE_SIZE for content matching', async () => {
    const readFileSync = vi.fn()
    await runWorker({ dirPath: '/project', query: 'huge' }, {
      readdirSync: vi.fn(() => [
        { name: 'huge.ts', isDirectory: () => false },
      ]),
      statSync: vi.fn(() => ({ size: 2 * 1024 * 1024 })),
      readFileSync,
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data).toHaveLength(1)
    expect(data[0].contentMatches).toEqual([])
    expect(readFileSync).not.toHaveBeenCalled()
  })

  it('handles read errors gracefully during directory walk', async () => {
    await runWorker({ dirPath: '/protected', query: 'query' }, {
      readdirSync: vi.fn(() => { throw new Error('permission denied') }),
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data).toEqual([])
  })

  it('limits content matches per file to 5', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `match line ${i}`)
    await runWorker({ dirPath: '/project', query: 'match' }, {
      readdirSync: vi.fn(() => [
        { name: 'file.ts', isDirectory: () => false },
      ]),
      statSync: vi.fn(() => ({ size: 100 })),
      readFileSync: vi.fn(() => lines.join('\n')),
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data).toHaveLength(1)
    expect(data[0].contentMatches.length).toBeLessThanOrEqual(5)
  })

  it('performs case-insensitive search', async () => {
    await runWorker({ dirPath: '/project', query: 'file' }, {
      readdirSync: vi.fn(() => [
        { name: 'FILE.ts', isDirectory: () => false },
      ]),
      statSync: vi.fn(() => ({ size: 100 })),
      readFileSync: vi.fn(() => 'nothing here'),
    })

    const data = mockPostMessage.mock.calls[0][0].data
    expect(data).toHaveLength(1)
    expect(data[0].matchType).toBe('filename')
  })

  it('posts error message when search throws', async () => {
    vi.doMock('worker_threads', () => ({
      parentPort: { postMessage: mockPostMessage },
      workerData: null, // Will cause error when accessing .query
    }))
    vi.doMock('fs', () => ({
      readFileSync: vi.fn(),
      readdirSync: vi.fn(),
      statSync: vi.fn(),
    }))
    await import('./fsSearch.worker')

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' }),
    )
  })
})
