import { describe, expect, it, vi } from 'vitest'
import { buildSessionTranscript, getWorktreeSessionTranscriptPath, persistSessionTranscript } from './sessionTranscript'

const session = {
  id: 'session 1',
  name: 'Test Session',
  directory: '/tmp/repo',
}

describe('sessionTranscript utils', () => {
  it('builds transcript content with metadata', () => {
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-02-19T00:00:00.000Z')

    const content = buildSessionTranscript(session, 'line a\nline b')

    expect(content).toContain('Session: Test Session')
    expect(content).toContain('Session ID: session 1')
    expect(content).toContain('Directory: /tmp/repo')
    expect(content).toContain('Saved At: 2026-02-19T00:00:00.000Z')
    expect(content).toContain('line a\nline b')
    vi.restoreAllMocks()
  })

  it('builds sanitized worktree transcript path', () => {
    expect(getWorktreeSessionTranscriptPath(session)).toBe('/tmp/repo/.broomy-session-session_1.txt')
  })

  it('persists transcript and appends local exclude marker', async () => {
    vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true } as never)
    vi.mocked(window.shell.exec).mockResolvedValue({ success: true, stdout: '/tmp/repo/.git/info/exclude\n', stderr: '', exitCode: 0 } as never)
    vi.mocked(window.fs.exists).mockResolvedValue(true as never)
    vi.mocked(window.fs.readFile).mockResolvedValue('# existing\n' as never)

    const lastSaved: Record<string, string> = {}
    await persistSessionTranscript(session, 'content', 'buffer-content', lastSaved)

    expect(window.fs.writeFile).toHaveBeenCalledWith('/tmp/repo/.broomy-session-session_1.txt', 'content')
    expect(window.fs.appendFile).toHaveBeenCalledWith(
      '/tmp/repo/.git/info/exclude',
      expect.stringContaining('.broomy-session-*.txt'),
    )
    expect(lastSaved['session 1']).toBe('buffer-content')
  })
})
