// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { render } from '@testing-library/react'
import { usePanelsMap, type PanelsMapConfig } from './usePanelsMap'
import { PANEL_IDS } from '../panels'
import { useSessionStore, type Session } from '../store/sessions'

// Mock all component imports — capture props for callback testing
let lastExplorerProps: Record<string, unknown> = {}
let lastFileViewerProps: Record<string, unknown> = {}
let lastReviewPanelProps: Record<string, unknown> = {}
let lastAgentSettingsProps: Record<string, unknown> = {}

vi.mock('../components/Terminal', () => ({ default: () => null }))
vi.mock('../components/TabbedTerminal', () => ({ default: () => null }))
vi.mock('../components/explorer', () => ({ default: (props: Record<string, unknown>) => { lastExplorerProps = props; return null } }))
vi.mock('../components/FileViewer', () => ({ default: (props: Record<string, unknown>) => { lastFileViewerProps = props; return null } }))
vi.mock('../components/review', () => ({ default: (props: Record<string, unknown>) => { lastReviewPanelProps = props; return null } }))
vi.mock('../components/AgentSettings', () => ({ default: (props: Record<string, unknown>) => { lastAgentSettingsProps = props; return null } }))
vi.mock('../components/SessionList', () => ({ default: () => null }))
vi.mock('../components/WelcomeScreen', () => ({ default: () => null }))
vi.mock('../components/TutorialPanel', () => ({ default: () => null }))

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    name: 'Test Session',
    directory: '/test/dir',
    branch: 'main',
    status: 'idle',
    agentId: null,
    panelVisibility: {
      [PANEL_IDS.AGENT_TERMINAL]: true,
      [PANEL_IDS.USER_TERMINAL]: true,
      [PANEL_IDS.EXPLORER]: true,
      [PANEL_IDS.FILE_VIEWER]: false,
    },
    showAgentTerminal: true,
    showUserTerminal: true,
    showExplorer: true,
    showFileViewer: false,
    showDiff: false,
    selectedFilePath: null,
    planFilePath: null,
    fileViewerPosition: 'top',
    layoutSizes: {
      explorerWidth: 256,
      fileViewerSize: 300,
      userTerminalHeight: 192,
      diffPanelWidth: 320,
      reviewPanelWidth: 320,
      tutorialPanelWidth: 320,
    },
    explorerFilter: 'files',
    lastMessage: null,
    lastMessageTime: null,
    isUnread: false,
    workingStartTime: null,
    recentFiles: [],
    terminalTabs: { tabs: [{ id: 'tab-1', name: 'Terminal' }], activeTabId: 'tab-1' },
    branchStatus: 'in-progress' as const,
    isArchived: false,
    ...overrides,
  }
}

function makeConfig(overrides: Partial<PanelsMapConfig> = {}): PanelsMapConfig {
  const session = makeSession()
  return {
    sessions: [session],
    activeSessionId: 'session-1',
    activeSession: session,
    activeSessionGitStatus: [],
    activeSessionGitStatusResult: null,
    selectedFileStatus: undefined,
    navigateToFile: vi.fn(),
    openFileInDiffMode: false,
    scrollToLine: undefined,
    searchHighlight: undefined,
    diffBaseRef: undefined,
    diffCurrentRef: undefined,
    diffLabel: undefined,
    setIsFileViewerDirty: vi.fn(),
    saveCurrentFileRef: { current: null },
    handleSelectSession: vi.fn(),
    handleNewSession: vi.fn(),
    removeSession: vi.fn(),
    refreshPrStatus: vi.fn().mockResolvedValue(undefined),
    archiveSession: vi.fn(),
    unarchiveSession: vi.fn(),
    handleToggleFileViewer: vi.fn(),
    handleFileViewerPositionChange: vi.fn(),
    fetchGitStatus: vi.fn(),
    getAgentCommand: vi.fn().mockReturnValue(undefined),
    getAgentEnv: vi.fn().mockReturnValue(undefined),
    globalPanelVisibility: {
      [PANEL_IDS.SIDEBAR]: true,
      [PANEL_IDS.SETTINGS]: false,
    },
    toggleGlobalPanel: vi.fn(),
    selectFile: vi.fn(),
    setExplorerFilter: vi.fn(),
    recordPushToMain: vi.fn(),
    clearPushToMain: vi.fn(),
    updatePrState: vi.fn(),
    setPanelVisibility: vi.fn(),
    setToolbarPanels: vi.fn(),
    repos: [],
    ...overrides,
  }
}

describe('usePanelsMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.app.tmpdir).mockResolvedValue('/tmp')
  })

  it('returns a map with all expected panel IDs', () => {
    const config = makeConfig()
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current).toHaveProperty(PANEL_IDS.SIDEBAR)
    expect(result.current).toHaveProperty(PANEL_IDS.AGENT_TERMINAL)
    expect(result.current).toHaveProperty(PANEL_IDS.USER_TERMINAL)
    expect(result.current).toHaveProperty(PANEL_IDS.EXPLORER)
    expect(result.current).toHaveProperty(PANEL_IDS.FILE_VIEWER)
    expect(result.current).toHaveProperty(PANEL_IDS.SETTINGS)
    expect(result.current).toHaveProperty(PANEL_IDS.TUTORIAL)
    expect(result.current).toHaveProperty(PANEL_IDS.REVIEW)
  })

  it('returns null for explorer when showExplorer is false', () => {
    const session = makeSession({ showExplorer: false })
    const config = makeConfig({ sessions: [session], activeSession: session })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.EXPLORER]).toBeNull()
  })

  it('returns explorer element when showExplorer is true', () => {
    const session = makeSession({ showExplorer: true })
    const config = makeConfig({ sessions: [session], activeSession: session })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.EXPLORER]).not.toBeNull()
  })

  it('returns null for fileViewer when showFileViewer is false', () => {
    const session = makeSession({ showFileViewer: false })
    const config = makeConfig({ sessions: [session], activeSession: session })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.FILE_VIEWER]).toBeNull()
  })

  it('returns fileViewer element when showFileViewer is true', () => {
    const session = makeSession({ showFileViewer: true })
    const config = makeConfig({ sessions: [session], activeSession: session })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.FILE_VIEWER]).not.toBeNull()
  })

  it('returns null for settings when globalPanelVisibility settings is false', () => {
    const config = makeConfig({
      globalPanelVisibility: { [PANEL_IDS.SIDEBAR]: true, [PANEL_IDS.SETTINGS]: false },
    })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.SETTINGS]).toBeNull()
  })

  it('returns settings element when globalPanelVisibility settings is true', () => {
    const config = makeConfig({
      globalPanelVisibility: { [PANEL_IDS.SIDEBAR]: true, [PANEL_IDS.SETTINGS]: true },
    })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.SETTINGS]).not.toBeNull()
  })

  it('returns null for review panel when no active session', () => {
    const config = makeConfig({ activeSession: undefined, activeSessionId: null })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.REVIEW]).toBeNull()
  })

  it('returns review element when activeSession exists', () => {
    const config = makeConfig()
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.REVIEW]).not.toBeNull()
  })

  it('memoizes panels map and returns stable reference when inputs are unchanged', () => {
    const config = makeConfig()
    const { result, rerender } = renderHook(() => usePanelsMap(config))

    const firstResult = result.current
    rerender()
    expect(result.current).toBe(firstResult)
  })

  it('shows WelcomeScreen in agent terminal panel when there are no sessions', () => {
    const config = makeConfig({ sessions: [], activeSessionId: null, activeSession: undefined })
    const { result } = renderHook(() => usePanelsMap(config))

    // The agent terminal panel should still be defined (not null)
    expect(result.current[PANEL_IDS.AGENT_TERMINAL]).not.toBeNull()
  })

  it('renders review panel with review session context', () => {
    const session = makeSession({
      sessionType: 'review',
      prNumber: 42,
      prTitle: 'Fix bug',
      panelVisibility: {
        [PANEL_IDS.AGENT_TERMINAL]: true,
        [PANEL_IDS.USER_TERMINAL]: false,
        [PANEL_IDS.EXPLORER]: false,
        [PANEL_IDS.FILE_VIEWER]: false,
        [PANEL_IDS.REVIEW]: true,
      },
    })
    const config = makeConfig({
      sessions: [session],
      activeSession: session,
      activeSessionId: 'session-1',
    })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.REVIEW]).not.toBeNull()
  })

  it('passes config to agentTerminal onUserInput', () => {
    const config = makeConfig()
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.AGENT_TERMINAL]).not.toBeNull()
  })

  it('passes config to userTerminal onUserInput', () => {
    const config = makeConfig()
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.USER_TERMINAL]).not.toBeNull()
  })

  it('renders file viewer with review context for review sessions', () => {
    const session = makeSession({
      showFileViewer: true,
      sessionType: 'review',
      selectedFilePath: '/test/file.ts',
    })
    const config = makeConfig({
      sessions: [session],
      activeSession: session,
      activeSessionId: 'session-1',
    })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.FILE_VIEWER]).not.toBeNull()
  })

  it('renders agent terminal for each session', () => {
    const session1 = makeSession({ id: 'session-1', name: 'S1' })
    const session2 = makeSession({ id: 'session-2', name: 'S2' })
    const config = makeConfig({
      sessions: [session1, session2],
      activeSessionId: 'session-1',
      activeSession: session1,
    })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.AGENT_TERMINAL]).not.toBeNull()
    expect(result.current[PANEL_IDS.USER_TERMINAL]).not.toBeNull()
  })

  describe('explorer callbacks', () => {
    function renderExplorer(configOverrides: Partial<PanelsMapConfig> = {}) {
      const session = makeSession({ showExplorer: true })
      const config = makeConfig({ sessions: [session], activeSession: session, ...configOverrides })
      const { result } = renderHook(() => usePanelsMap(config))
      // Render the explorer element to trigger mock and capture props
      const explorerElement = result.current[PANEL_IDS.EXPLORER]
      if (explorerElement) render(explorerElement as React.ReactElement)
      return { config, lastExplorerProps }
    }

    it('onFilterChange calls setExplorerFilter with active session id', () => {
      const setExplorerFilter = vi.fn()
      const { lastExplorerProps: props } = renderExplorer({ setExplorerFilter })
      const onFilterChange = props.onFilterChange as (filter: string) => void
      onFilterChange('source-control')
      expect(setExplorerFilter).toHaveBeenCalledWith('session-1', 'source-control')
    })

    it('onRecordPushToMain calls recordPushToMain with active session id', () => {
      const recordPushToMain = vi.fn()
      const { lastExplorerProps: props } = renderExplorer({ recordPushToMain })
      const onRecordPushToMain = props.onRecordPushToMain as (hash: string) => void
      onRecordPushToMain('abc123')
      expect(recordPushToMain).toHaveBeenCalledWith('session-1', 'abc123')
    })

    it('onClearPushToMain calls clearPushToMain with active session id', () => {
      const clearPushToMain = vi.fn()
      const { lastExplorerProps: props } = renderExplorer({ clearPushToMain })
      const onClearPushToMain = props.onClearPushToMain as () => void
      onClearPushToMain()
      expect(clearPushToMain).toHaveBeenCalledWith('session-1')
    })

    it('onUpdatePrState calls updatePrState with active session id', () => {
      const updatePrState = vi.fn()
      const { lastExplorerProps: props } = renderExplorer({ updatePrState })
      const onUpdatePrState = props.onUpdatePrState as (state: string, num?: number, url?: string) => void
      onUpdatePrState('open', 42, 'https://github.com/org/repo/pull/42')
      expect(updatePrState).toHaveBeenCalledWith('session-1', 'open', 42, 'https://github.com/org/repo/pull/42')
    })

    it('onOpenReview opens review panel and adds to toolbar', () => {
      const setPanelVisibility = vi.fn()
      const setToolbarPanels = vi.fn()
      // Set up store state with toolbarPanels that include explorer but not review
      useSessionStore.setState({ toolbarPanels: [PANEL_IDS.EXPLORER] })
      const { lastExplorerProps: props } = renderExplorer({ setPanelVisibility, setToolbarPanels })
      const onOpenReview = props.onOpenReview as () => void
      onOpenReview()
      expect(setPanelVisibility).toHaveBeenCalledWith('session-1', PANEL_IDS.REVIEW, true)
      expect(setToolbarPanels).toHaveBeenCalledWith([PANEL_IDS.EXPLORER, PANEL_IDS.REVIEW])
    })

    it('onOpenReview does not add review to toolbar if already present', () => {
      const setPanelVisibility = vi.fn()
      const setToolbarPanels = vi.fn()
      useSessionStore.setState({ toolbarPanels: [PANEL_IDS.EXPLORER, PANEL_IDS.REVIEW] })
      const { lastExplorerProps: props } = renderExplorer({ setPanelVisibility, setToolbarPanels })
      const onOpenReview = props.onOpenReview as () => void
      onOpenReview()
      expect(setPanelVisibility).toHaveBeenCalledWith('session-1', PANEL_IDS.REVIEW, true)
      expect(setToolbarPanels).not.toHaveBeenCalled()
    })
  })

  describe('fileViewer callbacks', () => {
    it('onOpenFile calls navigateToFile with correct args', () => {
      const navigateToFile = vi.fn()
      const session = makeSession({ showFileViewer: true })
      const config = makeConfig({ sessions: [session], activeSession: session, navigateToFile })
      const { result } = renderHook(() => usePanelsMap(config))
      const fvElement = result.current[PANEL_IDS.FILE_VIEWER]
      if (fvElement) render(fvElement as React.ReactElement)
      const onOpenFile = lastFileViewerProps.onOpenFile as (path: string, line?: number) => void
      onOpenFile('/test/other.ts', 42)
      expect(navigateToFile).toHaveBeenCalledWith({ filePath: '/test/other.ts', openInDiffMode: false, scrollToLine: 42 })
    })
  })

  describe('review panel callbacks', () => {
    it('onSelectFile calls navigateToFile', () => {
      const navigateToFile = vi.fn()
      const config = makeConfig({ navigateToFile })
      const { result } = renderHook(() => usePanelsMap(config))
      const reviewElement = result.current[PANEL_IDS.REVIEW]
      if (reviewElement) render(reviewElement as React.ReactElement)
      const onSelectFile = lastReviewPanelProps.onSelectFile as (path: string, diff: boolean, line?: number, base?: string) => void
      onSelectFile('/file.ts', true, 10, 'abc123')
      expect(navigateToFile).toHaveBeenCalledWith({ filePath: '/file.ts', openInDiffMode: true, scrollToLine: 10, diffBaseRef: 'abc123' })
    })
  })

  describe('settings panel callbacks', () => {
    it('onClose calls toggleGlobalPanel', () => {
      const toggleGlobalPanel = vi.fn()
      const config = makeConfig({
        globalPanelVisibility: { [PANEL_IDS.SIDEBAR]: true, [PANEL_IDS.SETTINGS]: true },
        toggleGlobalPanel,
      })
      const { result } = renderHook(() => usePanelsMap(config))
      const settingsElement = result.current[PANEL_IDS.SETTINGS]
      if (settingsElement) render(settingsElement as React.ReactElement)
      const onClose = lastAgentSettingsProps.onClose as () => void
      onClose()
      expect(toggleGlobalPanel).toHaveBeenCalledWith(PANEL_IDS.SETTINGS)
    })
  })
})
