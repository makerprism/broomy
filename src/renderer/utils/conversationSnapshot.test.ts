import { describe, expect, it, vi } from 'vitest'
import { buildConversationSnapshot } from './conversationSnapshot'

describe('buildConversationSnapshot', () => {
  it('returns null for empty content', () => {
    expect(buildConversationSnapshot('', { maxLines: 10, maxBytes: 1000 })).toBeNull()
    expect(buildConversationSnapshot(null, { maxLines: 10, maxBytes: 1000 })).toBeNull()
  })

  it('returns full content when under limits', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123)
    const snapshot = buildConversationSnapshot('a\nb\nc', { maxLines: 10, maxBytes: 1000 })
    expect(snapshot).toEqual({
      format: 'plain-text-v1',
      content: 'a\nb\nc',
      capturedAt: 123,
      truncated: false,
      approxLineCount: 3,
    })
    vi.restoreAllMocks()
  })

  it('keeps only last lines when line limit exceeded', () => {
    const snapshot = buildConversationSnapshot('1\n2\n3\n4', { maxLines: 2, maxBytes: 1000 })
    expect(snapshot?.content).toBe('3\n4')
    expect(snapshot?.truncated).toBe(true)
    expect(snapshot?.approxLineCount).toBe(2)
  })

  it('trims bytes from start using utf8-safe boundary', () => {
    const snapshot = buildConversationSnapshot('abc😀def', { maxLines: 10, maxBytes: 7 })
    expect(snapshot?.content.length).toBeGreaterThan(0)
    expect(snapshot?.content.includes('😀')).toBe(true)
    expect(snapshot?.truncated).toBe(true)
  })
})
