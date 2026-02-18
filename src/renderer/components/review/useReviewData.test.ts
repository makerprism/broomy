// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { useReviewData } from './useReviewData'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  // Default mocks
  vi.mocked(window.fs.exists).mockResolvedValue(false)
  vi.mocked(window.git.branchChanges).mockResolvedValue({ files: [], baseBranch: 'main', mergeBase: 'abc1234' })
})

describe('useReviewData', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    expect(result.current.reviewData).toBeNull()
    expect(result.current.comments).toEqual([])
    expect(result.current.comparison).toBeNull()
    expect(result.current.waitingForAgent).toBe(false)
    expect(result.current.pushing).toBe(false)
    expect(result.current.pushResult).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.showGitignoreModal).toBe(false)
    expect(result.current.pendingGenerate).toBe(false)
    expect(result.current.unpushedCount).toBe(0)
  })

  it('computes correct file paths', () => {
    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    expect(result.current.broomyDir).toBe('/test/repo/.broomy')
    expect(result.current.reviewFilePath).toBe('/test/repo/.broomy/review.json')
    expect(result.current.commentsFilePath).toBe('/test/repo/.broomy/comments.json')
    expect(result.current.historyFilePath).toBe('/test/repo/.broomy/review-history.json')
    expect(result.current.promptFilePath).toBe('/test/repo/.broomy/review-prompt.md')
  })

  it('loads review data on mount when file exists', async () => {
    const reviewData = {
      version: 1,
      generatedAt: '2024-01-01',
      overview: { purpose: 'test', approach: 'testing' },
      changePatterns: [],
      potentialIssues: [],
      designDecisions: [],
    }

    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      return path.includes('review.json')
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return JSON.stringify(reviewData)
      return ''
    })

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    // Flush async effects
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.reviewData).toEqual(reviewData)
  })

  it('loads comments on mount when file exists', async () => {
    const comments = [
      { id: 'c-1', file: '/test/src/app.ts', line: 5, body: 'Comment', createdAt: '2024-01-01' },
    ]

    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      return path.includes('comments.json')
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('comments.json')) return JSON.stringify(comments)
      return ''
    })

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.comments).toEqual(comments)
  })

  it('computes unpushedCount from comments', async () => {
    const comments = [
      { id: 'c-1', file: '/test/src/app.ts', line: 5, body: 'Comment 1', createdAt: '2024-01-01', pushed: false },
      { id: 'c-2', file: '/test/src/app.ts', line: 10, body: 'Comment 2', createdAt: '2024-01-01', pushed: true },
      { id: 'c-3', file: '/test/src/app.ts', line: 15, body: 'Comment 3', createdAt: '2024-01-01' },
    ]

    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      return path.includes('comments.json')
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('comments.json')) return JSON.stringify(comments)
      return ''
    })

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.unpushedCount).toBe(2)
  })

  it('resets state when session changes', async () => {
    const { result, rerender } = renderHook(
      ({ sessionId }) => useReviewData(sessionId, '/test/repo', 'main'),
      { initialProps: { sessionId: 'session-1' } }
    )

    // Set some state
    act(() => {
      result.current.setError('some error')
      result.current.setWaitingForAgent(true)
    })

    expect(result.current.error).toBe('some error')

    // Change session
    rerender({ sessionId: 'session-2' })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.waitingForAgent).toBe(false)
    expect(result.current.reviewData).toBeNull()
  })

  it('computes merge-base from git', async () => {
    vi.mocked(window.git.branchChanges).mockResolvedValue({
      files: [],
      baseBranch: 'main',
      mergeBase: 'def5678',
    })

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.mergeBase).toBe('def5678')
  })

  it('provides setter functions', () => {
    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    expect(typeof result.current.setReviewData).toBe('function')
    expect(typeof result.current.setComments).toBe('function')
    expect(typeof result.current.setWaitingForAgent).toBe('function')
    expect(typeof result.current.setPushing).toBe('function')
    expect(typeof result.current.setPushResult).toBe('function')
    expect(typeof result.current.setError).toBe('function')
    expect(typeof result.current.setShowGitignoreModal).toBe('function')
    expect(typeof result.current.setPendingGenerate).toBe('function')
  })

  it('sets mergeBase to empty string when branchChanges fails', async () => {
    vi.mocked(window.git.branchChanges).mockRejectedValue(new Error('git error'))

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.mergeBase).toBe('')
  })

  it('handles review data loading error gracefully', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockRejectedValue(new Error('read error'))

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.reviewData).toBeNull()
  })

  it('handles comments loading error gracefully', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('comments.json')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockRejectedValue(new Error('read error'))

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.comments).toEqual([])
  })

  it('loads comparison data when review and history exist', async () => {
    const reviewData = {
      version: 1,
      generatedAt: '2024-01-02',
      headCommit: 'commit2',
      overview: { purpose: 'test', approach: 'testing' },
      changePatterns: [],
      potentialIssues: [],
      designDecisions: [],
    }
    const history = {
      reviews: [
        { generatedAt: '2024-01-01', headCommit: 'commit1', requestedChanges: [] },
      ],
    }
    const comparison = { newIssues: [], resolvedIssues: [], unchangedIssues: [] }

    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return true
      if (path.includes('review-history.json')) return true
      if (path.includes('comparison.json')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return JSON.stringify(reviewData)
      if (path.includes('review-history.json')) return JSON.stringify(history)
      if (path.includes('comparison.json')) return JSON.stringify(comparison)
      return ''
    })

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(result.current.reviewData).toEqual(reviewData)
    expect(result.current.comparison).toEqual(comparison)
  })

  it('sets comparison to null when no history exists', async () => {
    const reviewData = {
      version: 1,
      generatedAt: '2024-01-02',
      headCommit: 'commit2',
      overview: { purpose: 'test', approach: 'testing' },
      changePatterns: [],
      potentialIssues: [],
      designDecisions: [],
    }

    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return JSON.stringify(reviewData)
      return ''
    })

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(result.current.comparison).toBeNull()
  })

  it('sets comparison to null when no previous review with different commit', async () => {
    const reviewData = {
      version: 1,
      generatedAt: '2024-01-02',
      headCommit: 'commit1',
      overview: { purpose: 'test', approach: 'testing' },
      changePatterns: [],
      potentialIssues: [],
      designDecisions: [],
    }
    const history = {
      reviews: [
        { generatedAt: '2024-01-01', headCommit: 'commit1', requestedChanges: [] },
      ],
    }

    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return true
      if (path.includes('review-history.json')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return JSON.stringify(reviewData)
      if (path.includes('review-history.json')) return JSON.stringify(history)
      return ''
    })

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(result.current.comparison).toBeNull()
  })

  it('sets comparison to null when comparison.json does not exist', async () => {
    const reviewData = {
      version: 1,
      generatedAt: '2024-01-02',
      headCommit: 'commit2',
      overview: { purpose: 'test', approach: 'testing' },
      changePatterns: [],
      potentialIssues: [],
      designDecisions: [],
    }
    const history = {
      reviews: [
        { generatedAt: '2024-01-01', headCommit: 'commit1', requestedChanges: [] },
      ],
    }

    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return true
      if (path.includes('review-history.json')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return JSON.stringify(reviewData)
      if (path.includes('review-history.json')) return JSON.stringify(history)
      return ''
    })

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(result.current.comparison).toBeNull()
  })

  it('sets comparison to null when reviewData is null', async () => {
    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.comparison).toBeNull()
  })

  it('polls for review.json changes and updates reviewData', async () => {
    const reviewData = {
      version: 1,
      generatedAt: '2024-01-02',
      headCommit: 'commit2',
      overview: { purpose: 'new', approach: 'testing' },
      changePatterns: [],
      potentialIssues: [],
      designDecisions: [],
    }

    // Start with no files
    vi.mocked(window.fs.exists).mockResolvedValue(false)

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.reviewData).toBeNull()

    // Now make the review.json appear
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return JSON.stringify(reviewData)
      return ''
    })

    // Advance past the 1-second polling interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    expect(result.current.reviewData).toEqual(reviewData)
    expect(result.current.waitingForAgent).toBe(false)
  })

  it('polls for comments.json changes', async () => {
    const comments = [
      { id: 'c-1', file: '/test/src/app.ts', line: 5, body: 'New comment', createdAt: '2024-01-01' },
    ]

    vi.mocked(window.fs.exists).mockResolvedValue(false)

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.comments).toEqual([])

    // Make comments.json appear
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('comments.json')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('comments.json')) return JSON.stringify(comments)
      return ''
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    expect(result.current.comments).toEqual(comments)
  })

  it('detects review.json deletion via polling', async () => {
    const reviewData = {
      version: 1,
      generatedAt: '2024-01-01',
      overview: { purpose: 'test', approach: 'testing' },
      changePatterns: [],
      potentialIssues: [],
      designDecisions: [],
    }

    // Start with review file
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return JSON.stringify(reviewData)
      return ''
    })

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.reviewData).toEqual(reviewData)

    // Now remove the file
    vi.mocked(window.fs.exists).mockResolvedValue(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    expect(result.current.reviewData).toBeNull()
  })

  it('adds headCommit to review if missing during polling', async () => {
    const reviewData = {
      version: 1,
      generatedAt: '2024-01-02',
      overview: { purpose: 'test', approach: 'testing' },
      changePatterns: [],
      potentialIssues: [],
      designDecisions: [],
    }

    vi.mocked(window.fs.exists).mockResolvedValue(false)

    renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    // Make review.json appear without headCommit
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return JSON.stringify(reviewData)
      return ''
    })
    vi.mocked(window.git.headCommit).mockResolvedValue('newcommit123')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    expect(window.git.headCommit).toHaveBeenCalledWith('/test/repo')
    expect(window.fs.writeFile).toHaveBeenCalled()
  })

  it('updates review history during polling when review changes', async () => {
    const reviewData = {
      version: 1,
      generatedAt: '2024-01-02',
      headCommit: 'newcommit',
      overview: { purpose: 'test', approach: 'testing' },
      changePatterns: [],
      potentialIssues: [],
      designDecisions: [],
      requestedChanges: [],
    }

    vi.mocked(window.fs.exists).mockResolvedValue(false)

    renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    // Make review.json appear
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return true
      if (path.includes('review-history.json')) return false
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return JSON.stringify(reviewData)
      return ''
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    // Should have written history file
    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/test/repo/.broomy/review-history.json',
      expect.any(String)
    )
  })

  it('handles comparison loading error gracefully', async () => {
    const reviewData = {
      version: 1,
      generatedAt: '2024-01-02',
      headCommit: 'commit2',
      overview: { purpose: 'test', approach: 'testing' },
      changePatterns: [],
      potentialIssues: [],
      designDecisions: [],
    }

    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return true
      if (path.includes('review-history.json')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review.json')) return JSON.stringify(reviewData)
      if (path.includes('review-history.json')) throw new Error('read error')
      return ''
    })

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(result.current.comparison).toBeNull()
  })

  it('calls branchChanges without baseBranch when prBaseBranch is empty', async () => {
    vi.mocked(window.git.branchChanges).mockResolvedValue({
      files: [],
      baseBranch: 'main',
      mergeBase: 'abc1234',
    })

    renderHook(() =>
      useReviewData('session-1', '/test/repo')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(window.git.branchChanges).toHaveBeenCalledWith('/test/repo', undefined)
  })

  it('skips merge-base fetch when sessionDirectory is empty', async () => {
    renderHook(() =>
      useReviewData('session-1', '', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(window.git.branchChanges).not.toHaveBeenCalled()
  })
})
