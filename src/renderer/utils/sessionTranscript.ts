import type { Session } from '../store/sessions'

const TRANSCRIPT_IGNORE_MARKER = '.broomy-session-*.txt'

export type SessionTranscriptSource = Pick<Session, 'id' | 'name' | 'directory'>

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function buildSessionTranscript(session: SessionTranscriptSource, buffer: string): string {
  const timestamp = new Date().toISOString()
  return [
    `Session: ${session.name}`,
    `Session ID: ${session.id}`,
    `Directory: ${session.directory}`,
    `Saved At: ${timestamp}`,
    '',
    buffer,
  ].join('\n')
}

export function getWorktreeSessionTranscriptPath(session: SessionTranscriptSource): string {
  return `${session.directory}/.broomy-session-${sanitizeFileName(session.id)}.txt`
}

async function ensureWorktreeTranscriptIgnored(session: SessionTranscriptSource): Promise<void> {
  const gitPath = await window.shell.exec('git rev-parse --git-path info/exclude', session.directory)
  if (!gitPath.success) return

  const excludePath = gitPath.stdout.trim()
  if (!excludePath) return

  const exists = await window.fs.exists(excludePath)
  if (!exists) {
    const init = `# Broomy local session transcript files\n${TRANSCRIPT_IGNORE_MARKER}\n`
    await window.fs.writeFile(excludePath, init)
    return
  }

  const existing = await window.fs.readFile(excludePath)
  if (existing.includes(TRANSCRIPT_IGNORE_MARKER)) return

  const needsNewline = existing.length > 0 && !existing.endsWith('\n')
  const toAppend = `${needsNewline ? '\n' : ''}# Broomy local session transcript files\n${TRANSCRIPT_IGNORE_MARKER}\n`
  await window.fs.appendFile(excludePath, toAppend)
}

export async function persistSessionTranscript(
  session: SessionTranscriptSource,
  content: string,
  sourceBuffer: string,
  lastSaved: Record<string, string>,
): Promise<void> {
  const worktreeTranscriptPath = getWorktreeSessionTranscriptPath(session)
  const result = await window.fs.writeFile(worktreeTranscriptPath, content)
  if (!result.success) return

  try {
    await ensureWorktreeTranscriptIgnored(session)
  } catch {
    // Keep transcript persistence best-effort even if ignore setup fails.
  }
  lastSaved[session.id] = sourceBuffer
}
