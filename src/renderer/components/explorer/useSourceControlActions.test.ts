// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import '../../../test/react-setup'
import { useSourceControlActions } from './useSourceControlActions'
import type { SourceControlData } from './useSourceControlData'

beforeEach(() => {
  vi.clearAllMocks()
})

function makeData(overrides: Partial<SourceControlData> = {}): SourceControlData {
  return {
    stagedFiles: [],
    unstagedFiles: [],
    commitMessage: '',
    setCommitMessage: vi.fn(),
    isCommitting: false,
    setIsCommitting: vi.fn(),
    commitError: null,
    setCommitError: vi.fn(),
    commitErrorExpanded: false,
    setCommitErrorExpanded: vi.fn(),
    isSyncing: false,
    setIsSyncing: vi.fn(),
    isSyncingWithMain: false,
    setIsSyncingWithMain: vi.fn(),
    gitOpError: null,
    setGitOpError: vi.fn(),
    branchChanges: [],
    branchBaseName: 'main',
    branchMergeBase: '',
    isBranchLoading: false,
    branchCommits: [],
    isCommitsLoading: false,
    expandedCommits: new Set<string>(),
    setExpandedCommits: vi.fn(),
    commitFilesByHash: {},
    setCommitFilesByHash: vi.fn(),
    loadingCommitFiles: new Set<string>(),
    setLoadingCommitFiles: vi.fn(),
    prStatus: null,
    isPrLoading: false,
    hasWriteAccess: false,
    isPushingToMain: false,
    setIsPushingToMain: vi.fn(),
    currentHeadCommit: null,
    prComments: [],
    setPrComments: vi.fn(),
    isCommentsLoading: false,
    replyText: {},
    setReplyText: vi.fn(),
    isSubmittingReply: null,
    setIsSubmittingReply: vi.fn(),
    hasChangesSincePush: true,
    resetPr: vi.fn(),
    currentRepo: undefined,
    gitStatus: [],
    ...overrides,
  }
}

describe('useSourceControlActions', () => {
  describe('handleStage', () => {
    it('calls git.stage with the file path', async () => {
      vi.mocked(window.git.stage).mockResolvedValue({ success: true })
      const onGitStatusRefresh = vi.fn()
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({
          directory: '/repos/project',
          onGitStatusRefresh,
          data,
        })
      )

      await act(async () => {
        await result.current.handleStage('src/index.ts')
      })

      expect(window.git.stage).toHaveBeenCalledWith('/repos/project', 'src/index.ts')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })

    it('does nothing when no directory', async () => {
      const data = makeData()
      const { result } = renderHook(() =>
        useSourceControlActions({ data })
      )

      await act(async () => {
        await result.current.handleStage('src/index.ts')
      })

      expect(window.git.stage).not.toHaveBeenCalled()
    })
  })

  describe('handleStageAll', () => {
    it('calls git.stageAll', async () => {
      vi.mocked(window.git.stageAll).mockResolvedValue({ success: true })
      const onGitStatusRefresh = vi.fn()
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({
          directory: '/repos/project',
          onGitStatusRefresh,
          data,
        })
      )

      await act(async () => {
        await result.current.handleStageAll()
      })

      expect(window.git.stageAll).toHaveBeenCalledWith('/repos/project')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })
  })

  describe('handleUnstage', () => {
    it('calls git.unstage with the file path', async () => {
      vi.mocked(window.git.unstage).mockResolvedValue({ success: true })
      const onGitStatusRefresh = vi.fn()
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({
          directory: '/repos/project',
          onGitStatusRefresh,
          data,
        })
      )

      await act(async () => {
        await result.current.handleUnstage('src/index.ts')
      })

      expect(window.git.unstage).toHaveBeenCalledWith('/repos/project', 'src/index.ts')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })
  })

  describe('handleCommit', () => {
    it('commits when there are staged files', async () => {
      vi.mocked(window.git.commit).mockResolvedValue({ success: true })
      const onGitStatusRefresh = vi.fn()
      const data = makeData({
        stagedFiles: [{ path: 'src/index.ts', status: 'modified' as const, staged: true, indexStatus: 'M', workingDirStatus: ' ' }],
        commitMessage: 'fix: stuff',
      })

      const { result } = renderHook(() =>
        useSourceControlActions({
          directory: '/repos/project',
          onGitStatusRefresh,
          data,
        })
      )

      await act(async () => {
        await result.current.handleCommit()
      })

      expect(window.git.commit).toHaveBeenCalledWith('/repos/project', 'fix: stuff')
      expect(data.setCommitMessage).toHaveBeenCalledWith('')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })

    it('does nothing with empty commit message', async () => {
      const data = makeData({ commitMessage: '' })
      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleCommit()
      })

      expect(window.git.commit).not.toHaveBeenCalled()
    })

    it('shows error on commit failure', async () => {
      vi.mocked(window.git.commit).mockResolvedValue({ success: false, error: 'hook failed' })
      const data = makeData({
        stagedFiles: [{ path: 'src/index.ts', status: 'modified' as const, staged: true, indexStatus: 'M', workingDirStatus: ' ' }],
        commitMessage: 'fix: stuff',
      })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleCommit()
      })

      expect(data.setCommitError).toHaveBeenCalledWith('hook failed')
    })
  })

  describe('handleSync', () => {
    it('calls pull then push', async () => {
      vi.mocked(window.git.pull).mockResolvedValue({ success: true })
      vi.mocked(window.git.push).mockResolvedValue({ success: true })
      const onGitStatusRefresh = vi.fn()
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({
          directory: '/repos/project',
          onGitStatusRefresh,
          data,
        })
      )

      await act(async () => {
        await result.current.handleSync()
      })

      expect(window.git.pull).toHaveBeenCalledWith('/repos/project')
      expect(window.git.push).toHaveBeenCalledWith('/repos/project')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })

    it('shows error when pull fails', async () => {
      vi.mocked(window.git.pull).mockResolvedValue({ success: false, error: 'pull error' })
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleSync()
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({ operation: 'Pull', message: 'pull error' })
      expect(window.git.push).not.toHaveBeenCalled()
    })

    it('shows error when push fails', async () => {
      vi.mocked(window.git.pull).mockResolvedValue({ success: true })
      vi.mocked(window.git.push).mockResolvedValue({ success: false, error: 'push error' })
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleSync()
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({ operation: 'Push', message: 'push error' })
    })
  })

  describe('handleToggleCommit', () => {
    it('expands a commit and loads files', async () => {
      vi.mocked(window.git.commitFiles).mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ])
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleToggleCommit('abc123')
      })

      expect(window.git.commitFiles).toHaveBeenCalledWith('/repos/project', 'abc123')
      expect(data.setExpandedCommits).toHaveBeenCalled()
    })

    it('collapses an already expanded commit', async () => {
      const data = makeData({ expandedCommits: new Set(['abc123']) })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleToggleCommit('abc123')
      })

      expect(window.git.commitFiles).not.toHaveBeenCalled()
      // Should still call setExpandedCommits to remove it
      expect(data.setExpandedCommits).toHaveBeenCalled()
    })
  })

  describe('handlePushNewBranch', () => {
    it('calls git.pushNewBranch', async () => {
      vi.mocked(window.git.pushNewBranch).mockResolvedValue({ success: true })
      const onGitStatusRefresh = vi.fn()
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({
          directory: '/repos/project',
          onGitStatusRefresh,
          data,
        })
      )

      await act(async () => {
        await result.current.handlePushNewBranch('feature/test')
      })

      expect(window.git.pushNewBranch).toHaveBeenCalledWith('/repos/project', 'feature/test')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })
  })

  describe('handleCreatePr', () => {
    it('opens PR create URL', async () => {
      vi.mocked(window.gh.getPrCreateUrl).mockResolvedValue('https://github.com/test/test/compare')
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleCreatePr()
      })

      expect(window.gh.getPrCreateUrl).toHaveBeenCalledWith('/repos/project')
      expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/test/test/compare')
    })
  })

  describe('handleToggleCommit - loading cleanup', () => {
    it('clears loadingCommitFiles after loading', async () => {
      vi.mocked(window.git.commitFiles).mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ])
      const setLoadingCommitFiles = vi.fn()
      const data = makeData({ setLoadingCommitFiles })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleToggleCommit('abc123')
      })

      // Should have been called twice: once to add, once to remove
      expect(setLoadingCommitFiles).toHaveBeenCalledTimes(2)
      // Second call should remove the hash
      const removeFn = setLoadingCommitFiles.mock.calls[1][0]
      const result2 = removeFn(new Set(['abc123']))
      expect(result2.has('abc123')).toBe(false)
    })

    it('handles commit files loading error', async () => {
      vi.mocked(window.git.commitFiles).mockRejectedValue(new Error('failed'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleToggleCommit('abc123')
      })

      // Should set empty array on error
      expect(data.setCommitFilesByHash).toHaveBeenCalled()
      // Should still clear loading state
      expect(data.setLoadingCommitFiles).toHaveBeenCalledTimes(2)
    })
  })

  describe('handleReplyToComment', () => {
    it('posts a reply and refreshes comments', async () => {
      vi.mocked(window.gh.replyToComment).mockResolvedValue({ success: true })
      vi.mocked(window.gh.prComments).mockResolvedValue([])
      const data = makeData({
        prStatus: { number: 42, title: 'Test', state: 'OPEN' as const, url: 'https://example.com', headRefName: 'feature', baseRefName: 'main' },
        replyText: { 1: 'My reply' },
      })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleReplyToComment(1)
      })

      expect(window.gh.replyToComment).toHaveBeenCalledWith('/repos/project', 42, 1, 'My reply')
      expect(data.setReplyText).toHaveBeenCalled()
    })

    it('shows error when reply fails with error result', async () => {
      vi.mocked(window.gh.replyToComment).mockResolvedValue({ success: false, error: 'forbidden' })
      const data = makeData({
        prStatus: { number: 42, title: 'Test', state: 'OPEN' as const, url: 'https://example.com', headRefName: 'feature', baseRefName: 'main' },
        replyText: { 1: 'My reply' },
      })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleReplyToComment(1)
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({ operation: 'Reply', message: 'forbidden' })
    })

    it('shows error when reply throws', async () => {
      vi.mocked(window.gh.replyToComment).mockRejectedValue(new Error('network error'))
      const data = makeData({
        prStatus: { number: 42, title: 'Test', state: 'OPEN' as const, url: 'https://example.com', headRefName: 'feature', baseRefName: 'main' },
        replyText: { 1: 'My reply' },
      })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleReplyToComment(1)
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({ operation: 'Reply', message: 'Error: network error' })
    })

    it('does nothing without PR status', async () => {
      const data = makeData({ prStatus: null, replyText: { 1: 'My reply' } })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleReplyToComment(1)
      })

      expect(window.gh.replyToComment).not.toHaveBeenCalled()
    })
  })

  describe('handleSyncWithMain', () => {
    it('does nothing when no directory', async () => {
      const data = makeData()
      const { result } = renderHook(() =>
        useSourceControlActions({ data })
      )

      await act(async () => {
        await result.current.handleSyncWithMain()
      })

      expect(window.git.pullOriginMain).not.toHaveBeenCalled()
    })

    it('shows error when there are uncommitted changes', async () => {
      const data = makeData({
        gitStatus: [{ path: 'src/index.ts', status: 'modified' as const, staged: false, indexStatus: ' ', workingDirStatus: 'M' }],
      })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleSyncWithMain()
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Sync with main',
        message: 'Commit or stash changes before syncing with main',
      })
    })

    it('syncs successfully', async () => {
      vi.mocked(window.git.pullOriginMain).mockResolvedValue({ success: true })
      const onGitStatusRefresh = vi.fn()
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', onGitStatusRefresh, data })
      )

      await act(async () => {
        await result.current.handleSyncWithMain()
      })

      expect(window.git.pullOriginMain).toHaveBeenCalledWith('/repos/project')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })

    it('handles merge conflicts with agentPtyId', async () => {
      vi.mocked(window.git.pullOriginMain).mockResolvedValue({
        success: false,
        hasConflicts: true,
      })
      const onGitStatusRefresh = vi.fn()
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({
          directory: '/repos/project',
          agentPtyId: 'pty-1',
          onGitStatusRefresh,
          data,
        })
      )

      await act(async () => {
        await result.current.handleSyncWithMain()
      })

      expect(window.pty.write).toHaveBeenCalledWith('pty-1', 'resolve all merge conflicts\r')
      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Sync with main',
        message: 'Merge conflicts detected. Agent is resolving them.',
      })
    })

    it('handles merge conflicts without agentPtyId', async () => {
      vi.mocked(window.git.pullOriginMain).mockResolvedValue({
        success: false,
        hasConflicts: true,
      })
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleSyncWithMain()
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Sync with main',
        message: 'Merge conflicts detected. Resolve them manually.',
      })
    })

    it('handles sync failure', async () => {
      vi.mocked(window.git.pullOriginMain).mockResolvedValue({
        success: false,
        error: 'remote error',
      })
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleSyncWithMain()
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Sync with main',
        message: 'remote error',
      })
    })

    it('handles sync exception', async () => {
      vi.mocked(window.git.pullOriginMain).mockRejectedValue(new Error('network'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleSyncWithMain()
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Sync with main',
        message: 'Error: network',
      })
    })
  })

  describe('handlePushToMain', () => {
    it('does nothing when no directory', async () => {
      const data = makeData()
      const { result } = renderHook(() =>
        useSourceControlActions({ data })
      )

      await act(async () => {
        await result.current.handlePushToMain()
      })

      expect(window.git.isBehindMain).not.toHaveBeenCalled()
    })

    it('pushes to main successfully', async () => {
      vi.mocked(window.git.isBehindMain).mockResolvedValue({ behind: 0, defaultBranch: 'main' })
      vi.mocked(window.gh.mergeBranchToMain).mockResolvedValue({ success: true })
      vi.mocked(window.git.headCommit).mockResolvedValue('abc123')
      const onRecordPushToMain = vi.fn()
      const onGitStatusRefresh = vi.fn()
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({
          directory: '/repos/project',
          onRecordPushToMain,
          onGitStatusRefresh,
          data,
        })
      )

      await act(async () => {
        await result.current.handlePushToMain()
      })

      expect(window.gh.mergeBranchToMain).toHaveBeenCalledWith('/repos/project')
      expect(onRecordPushToMain).toHaveBeenCalledWith('abc123')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })

    it('prompts to sync when behind main', async () => {
      vi.mocked(window.git.isBehindMain).mockResolvedValue({ behind: 3, defaultBranch: 'main' })
      vi.mocked(window.git.pullOriginMain).mockResolvedValue({ success: true })
      vi.mocked(window.confirm).mockReturnValue(true)
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handlePushToMain()
      })

      expect(window.confirm).toHaveBeenCalled()
      expect(window.git.pullOriginMain).toHaveBeenCalled()
    })

    it('continues push when user declines sync', async () => {
      vi.mocked(window.git.isBehindMain).mockResolvedValue({ behind: 3, defaultBranch: 'main' })
      vi.mocked(window.confirm).mockReturnValue(false)
      vi.mocked(window.gh.mergeBranchToMain).mockResolvedValue({ success: true })
      vi.mocked(window.git.headCommit).mockResolvedValue('abc123')
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handlePushToMain()
      })

      expect(window.gh.mergeBranchToMain).toHaveBeenCalled()
    })

    it('handles merge failure', async () => {
      vi.mocked(window.git.isBehindMain).mockResolvedValue({ behind: 0, defaultBranch: 'main' })
      vi.mocked(window.gh.mergeBranchToMain).mockResolvedValue({ success: false, error: 'merge conflict' })
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handlePushToMain()
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Push to main',
        message: 'merge conflict',
      })
    })

    it('handles push to main exception', async () => {
      vi.mocked(window.git.isBehindMain).mockRejectedValue(new Error('network'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handlePushToMain()
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Push to main',
        message: 'Error: network',
      })
    })
  })

  describe('handleRevertFile', () => {
    it('reverts a file when confirmed', async () => {
      vi.mocked(window.confirm).mockReturnValue(true)
      const onGitStatusRefresh = vi.fn()
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', onGitStatusRefresh, data })
      )

      await act(async () => {
        await result.current.handleRevertFile('src/index.ts')
      })

      expect(window.git.checkoutFile).toHaveBeenCalledWith('/repos/project', 'src/index.ts')
      expect(onGitStatusRefresh).toHaveBeenCalled()
    })

    it('does nothing when user cancels confirmation', async () => {
      vi.mocked(window.confirm).mockReturnValue(false)
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleRevertFile('src/index.ts')
      })

      expect(window.git.checkoutFile).not.toHaveBeenCalled()
    })

    it('does nothing when no directory', async () => {
      const data = makeData()
      const { result } = renderHook(() =>
        useSourceControlActions({ data })
      )

      await act(async () => {
        await result.current.handleRevertFile('src/index.ts')
      })

      expect(window.git.checkoutFile).not.toHaveBeenCalled()
    })

    it('handles revert error', async () => {
      vi.mocked(window.confirm).mockReturnValue(true)
      vi.mocked(window.git.checkoutFile).mockRejectedValue(new Error('checkout failed'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleRevertFile('src/index.ts')
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Revert',
        message: 'Error: checkout failed',
      })
    })
  })

  describe('handleCommit - stage all and commit flow', () => {
    it('offers to stage all when no staged files but unstaged exist', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue('stage-all-commit')
      vi.mocked(window.git.stageAll).mockResolvedValue({ success: true })
      vi.mocked(window.git.commit).mockResolvedValue({ success: true })
      const onGitStatusRefresh = vi.fn()
      const data = makeData({
        stagedFiles: [],
        unstagedFiles: [{ path: 'src/index.ts', status: 'modified' as const, staged: false, indexStatus: ' ', workingDirStatus: 'M' }],
        commitMessage: 'fix: stuff',
      })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', onGitStatusRefresh, data })
      )

      await act(async () => {
        await result.current.handleCommit()
      })

      expect(window.menu.popup).toHaveBeenCalled()
      expect(window.git.stageAll).toHaveBeenCalledWith('/repos/project')
      expect(window.git.commit).toHaveBeenCalled()
    })

    it('does nothing when user cancels stage all', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue(null)
      const data = makeData({
        stagedFiles: [],
        unstagedFiles: [{ path: 'src/index.ts', status: 'modified' as const, staged: false, indexStatus: ' ', workingDirStatus: 'M' }],
        commitMessage: 'fix: stuff',
      })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleCommit()
      })

      expect(window.git.commit).not.toHaveBeenCalled()
    })

    it('handles commit exception', async () => {
      vi.mocked(window.git.commit).mockRejectedValue(new Error('commit error'))
      const data = makeData({
        stagedFiles: [{ path: 'src/index.ts', status: 'modified' as const, staged: true, indexStatus: 'M', workingDirStatus: ' ' }],
        commitMessage: 'fix: stuff',
      })

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleCommit()
      })

      expect(data.setCommitError).toHaveBeenCalledWith('Error: commit error')
    })
  })

  describe('handleSync - edge cases', () => {
    it('does nothing when no directory', async () => {
      const data = makeData()
      const { result } = renderHook(() =>
        useSourceControlActions({ data })
      )

      await act(async () => {
        await result.current.handleSync()
      })

      expect(window.git.pull).not.toHaveBeenCalled()
    })

    it('handles sync exception', async () => {
      vi.mocked(window.git.pull).mockRejectedValue(new Error('network'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleSync()
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Sync',
        message: 'Error: network',
      })
    })
  })

  describe('handleStage - error handling', () => {
    it('handles stage error', async () => {
      vi.mocked(window.git.stage).mockRejectedValue(new Error('stage error'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleStage('src/index.ts')
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Stage',
        message: 'Error: stage error',
      })
    })
  })

  describe('handleStageAll - edge cases', () => {
    it('does nothing when no directory', async () => {
      const data = makeData()
      const { result } = renderHook(() =>
        useSourceControlActions({ data })
      )

      await act(async () => {
        await result.current.handleStageAll()
      })

      expect(window.git.stageAll).not.toHaveBeenCalled()
    })

    it('handles stageAll error', async () => {
      vi.mocked(window.git.stageAll).mockRejectedValue(new Error('stage error'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleStageAll()
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Stage',
        message: 'Error: stage error',
      })
    })
  })

  describe('handleUnstage - edge cases', () => {
    it('does nothing when no directory', async () => {
      const data = makeData()
      const { result } = renderHook(() =>
        useSourceControlActions({ data })
      )

      await act(async () => {
        await result.current.handleUnstage('src/index.ts')
      })

      expect(window.git.unstage).not.toHaveBeenCalled()
    })

    it('handles unstage error', async () => {
      vi.mocked(window.git.unstage).mockRejectedValue(new Error('unstage error'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleUnstage('src/index.ts')
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Unstage',
        message: 'Error: unstage error',
      })
    })
  })

  describe('handlePushNewBranch - edge cases', () => {
    it('does nothing when no directory', async () => {
      const data = makeData()
      const { result } = renderHook(() =>
        useSourceControlActions({ data })
      )

      await act(async () => {
        await result.current.handlePushNewBranch('feature/test')
      })

      expect(window.git.pushNewBranch).not.toHaveBeenCalled()
    })

    it('handles push branch failure', async () => {
      vi.mocked(window.git.pushNewBranch).mockResolvedValue({ success: false, error: 'permission denied' })
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handlePushNewBranch('feature/test')
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Push branch',
        message: 'permission denied',
      })
    })

    it('handles push branch exception', async () => {
      vi.mocked(window.git.pushNewBranch).mockRejectedValue(new Error('network'))
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handlePushNewBranch('feature/test')
      })

      expect(data.setGitOpError).toHaveBeenCalledWith({
        operation: 'Push branch',
        message: 'Error: network',
      })
    })
  })

  describe('handleCreatePr - edge cases', () => {
    it('does nothing when no directory', async () => {
      const data = makeData()
      const { result } = renderHook(() =>
        useSourceControlActions({ data })
      )

      await act(async () => {
        await result.current.handleCreatePr()
      })

      expect(window.gh.getPrCreateUrl).not.toHaveBeenCalled()
    })

    it('does nothing when no URL returned', async () => {
      vi.mocked(window.gh.getPrCreateUrl).mockResolvedValue(null)
      const data = makeData()

      const { result } = renderHook(() =>
        useSourceControlActions({ directory: '/repos/project', data })
      )

      await act(async () => {
        await result.current.handleCreatePr()
      })

      expect(window.shell.openExternal).not.toHaveBeenCalled()
    })
  })
})
