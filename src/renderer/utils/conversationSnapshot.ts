import type { ConversationSnapshot } from '../store/sessions'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export type SnapshotLimits = {
  maxLines: number
  maxBytes: number
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
  let normalized = content

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
