import type { ConversationSnapshot } from '../store/sessions'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export type SnapshotLimits = {
  maxLines: number
  maxBytes: number
}

const TRANSIENT_RESTORE_LINES = [
  /^\[Restored terminal snapshot from previous app session\.\]$/,
  /^\[This does not reconnect the underlying OpenCode process\.\]$/,
  /^\[Injected restore context into the running agent session\.\]$/,
  /^\[Auto-restored context\] Previous session context:/,
]

function isTransientRestoreLine(line: string): boolean {
  return TRANSIENT_RESTORE_LINES.some((pattern) => pattern.test(line))
}

function sanitizeSnapshotContent(content: string): string {
  const normalized = content.replace(/\r\n?/g, '\n')
  const cleanedLines = normalized
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => !isTransientRestoreLine(line.trim()))

  while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] === '') {
    cleanedLines.pop()
  }

  return cleanedLines.join('\n')
}

function trimToUtf8Boundary(bytes: Uint8Array, startIndex: number): Uint8Array {
  let start = startIndex
  while (start < bytes.length && (bytes[start] & 0b11000000) === 0b10000000) {
    start++
  }
  return bytes.slice(start)
}

export function buildConversationSnapshot(
  content: string | null | undefined,
  limits: SnapshotLimits,
): ConversationSnapshot | null {
  if (!content) return null

  let truncated = false
  let normalized = sanitizeSnapshotContent(content)

  const lines = normalized.split('\n')
  if (lines.length > limits.maxLines) {
    normalized = lines.slice(-limits.maxLines).join('\n')
    truncated = true
  }

  const bytes = textEncoder.encode(normalized)
  if (bytes.length > limits.maxBytes) {
    const sliced = trimToUtf8Boundary(bytes, bytes.length - limits.maxBytes)
    normalized = textDecoder.decode(sliced)
    truncated = true
  }

  if (!normalized) return null

  return {
    format: 'plain-text-v1',
    content: normalized,
    capturedAt: Date.now(),
    truncated,
    approxLineCount: normalized.split('\n').length,
  }
}
