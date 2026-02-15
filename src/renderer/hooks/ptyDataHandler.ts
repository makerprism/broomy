import { Terminal as XTerm } from '@xterm/xterm'
import { evaluateActivity } from '../utils/terminalActivityDetector'

interface ViewportHelpers {
  isAtBottom: () => boolean
  forceViewportSync: () => void
  isViewportDesynced: () => boolean
  isScrollStuck: (direction: 1 | -1) => boolean
}

interface ScrollTracking {
  state: { pendingScrollRAF: number }
  logScrollDiag?: (label: string, extra?: Record<string, unknown>) => void
}

interface TerminalStateForPtyData {
  isFollowingRef: React.MutableRefObject<boolean>
  processPlanDetection: (data: string) => void
  lastUserInputRef: React.MutableRefObject<number>
  lastInteractionRef: React.MutableRefObject<number>
  lastStatusRef: React.MutableRefObject<'working' | 'idle'>
  idleTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  scheduleUpdate: (update: { status?: 'working' | 'idle' | 'error'; lastMessage?: string }) => void
}

interface CreatePtyDataHandlerArgs {
  terminal: XTerm
  viewportEl: HTMLElement | null
  helpers: ViewportHelpers
  scrollTracking: ScrollTracking
  isAgent: boolean
  state: TerminalStateForPtyData
  effectStartTime: number
}

interface PtyDataHandlerController {
  handleData: (data: string) => void
  clearTimers: () => void
}

export function createPtyDataHandler(args: CreatePtyDataHandlerArgs): PtyDataHandlerController {
  const { terminal, viewportEl, helpers, scrollTracking, isAgent, state, effectStartTime } = args
  let lastWriteViewportY = -1
  let writeJumpCount = 0
  let syncCheckTimeout: ReturnType<typeof setTimeout> | null = null

  const handleData = (data: string) => {
    const preWriteViewportY = terminal.buffer.active.viewportY
    const preWriteBaseY = terminal.buffer.active.baseY
    const preWriteScrollTop = viewportEl?.scrollTop ?? 0

    const hasCursorUp = /\x1b\[\d*A/.test(data) || /\x1b\[\d*F/.test(data)
    const hasCursorMove = hasCursorUp || /\r(?!\n)/.test(data) || /\x1b\[\d*G/.test(data)
    const hasEraseInLine = /\x1b\[\d*K/.test(data)

    terminal.write(data, () => {
      const postViewportY = terminal.buffer.active.viewportY
      const postBaseY = terminal.buffer.active.baseY
      const postScrollTop = viewportEl?.scrollTop ?? 0

      if (lastWriteViewportY >= 0) {
        const viewportDelta = Math.abs(postViewportY - lastWriteViewportY)
        if (viewportDelta > 3 && !helpers.isAtBottom()) {
          writeJumpCount++
          if (writeJumpCount <= 20) {
            console.log(`[scroll-diag] WRITE JUMP #${writeJumpCount}`, JSON.stringify({
              pre: { viewportY: preWriteViewportY, baseY: preWriteBaseY, scrollTop: preWriteScrollTop },
              post: { viewportY: postViewportY, baseY: postBaseY, scrollTop: postScrollTop },
              viewportDelta,
              hasCursorUp, hasCursorMove, hasEraseInLine,
              dataLen: data.length,
              dataSample: data.length > 200 ? `${data.slice(0, 100)}...${data.slice(-100)}` : data,
              isFollowing: state.isFollowingRef.current,
            }))
          }
        }
      }
      lastWriteViewportY = postViewportY

      if (state.isFollowingRef.current) {
        const preScrollBottom = viewportEl?.scrollTop ?? 0
        terminal.scrollToBottom()
        const postScrollBottom = viewportEl?.scrollTop ?? 0
        if (Math.abs(postScrollBottom - preScrollBottom) > 50) {
          console.log(`[scroll-diag] scrollToBottom jump`, JSON.stringify({
            scrollTopBefore: preScrollBottom,
            scrollTopAfter: postScrollBottom,
            delta: postScrollBottom - preScrollBottom,
            viewportY: terminal.buffer.active.viewportY,
            baseY: terminal.buffer.active.baseY,
            hasCursorUp, hasCursorMove,
          }))
        }
        if (!helpers.isAtBottom()) {
          scrollTracking.logScrollDiag?.('scrollToBottom not at bottom after write, scheduling rAF retry')
          scrollTracking.state.pendingScrollRAF = requestAnimationFrame(() => {
            scrollTracking.state.pendingScrollRAF = 0
            if (state.isFollowingRef.current) terminal.scrollToBottom()
          })
        }
      }
    })

    if (!syncCheckTimeout) {
      syncCheckTimeout = setTimeout(() => {
        syncCheckTimeout = null
        if (helpers.isViewportDesynced() || helpers.isScrollStuck(1) || helpers.isScrollStuck(-1)) {
          scrollTracking.logScrollDiag?.('sync check: forcing viewport sync', {
            desynced: helpers.isViewportDesynced(),
            stuckDown: helpers.isScrollStuck(1),
            stuckUp: helpers.isScrollStuck(-1),
          })
          helpers.forceViewportSync()
        }
      }, 500)
    }

    if (!isAgent) return

    state.processPlanDetection(data)
    const now = Date.now()
    const result = evaluateActivity(data.length, now, {
      lastUserInput: state.lastUserInputRef.current,
      lastInteraction: state.lastInteractionRef.current,
      lastStatus: state.lastStatusRef.current,
      startTime: effectStartTime,
    })
    if (result.status === 'working') {
      if (state.idleTimeoutRef.current) clearTimeout(state.idleTimeoutRef.current)
      state.lastStatusRef.current = 'working'
      state.scheduleUpdate({ status: 'working' })
    }
    if (result.scheduleIdle) {
      if (result.status !== 'working' && state.idleTimeoutRef.current) clearTimeout(state.idleTimeoutRef.current)
      state.idleTimeoutRef.current = setTimeout(() => {
        state.lastStatusRef.current = 'idle'
        state.scheduleUpdate({ status: 'idle' })
      }, 1000)
    }
  }

  const clearTimers = () => {
    if (syncCheckTimeout) {
      clearTimeout(syncCheckTimeout)
      syncCheckTimeout = null
    }
  }

  return { handleData, clearTimers }
}
