import { useState, useEffect, useCallback } from 'react'
import type { UpdateCheckResult } from '../../preload/apis/shell'

type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string; releaseNotes?: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready' }

export default function VersionIndicator() {
  const [version, setVersion] = useState<string | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })
  const [showPopover, setShowPopover] = useState(false)

  useEffect(() => {
    void window.app.getVersion().then(setVersion)
  }, [])

  // Check for updates once on mount
  useEffect(() => {
    void window.update.checkForUpdates().then((result: UpdateCheckResult) => {
      if (result.updateAvailable && result.version) {
        setUpdateState({
          status: 'available',
          version: result.version,
          releaseNotes: result.releaseNotes,
        })
      }
    })
  }, [])

  // Listen for download progress and completion
  useEffect(() => {
    const removeProgress = window.update.onDownloadProgress((percent) => {
      setUpdateState({ status: 'downloading', percent })
    })
    const removeDownloaded = window.update.onUpdateDownloaded(() => {
      setUpdateState({ status: 'ready' })
    })
    return () => {
      removeProgress()
      removeDownloaded()
    }
  }, [])

  const handleCheckForUpdates = useCallback(async () => {
    const result = await window.update.checkForUpdates()
    if (result.updateAvailable && result.version) {
      setUpdateState({
        status: 'available',
        version: result.version,
        releaseNotes: result.releaseNotes,
      })
    }
  }, [])

  const handleDownload = useCallback(async () => {
    setUpdateState({ status: 'downloading', percent: 0 })
    await window.update.downloadUpdate()
  }, [])

  const handleInstall = useCallback(() => {
    window.update.installUpdate()
  }, [])

  if (!version) return null

  const hasUpdate = updateState.status !== 'idle'

  return (
    <div className="relative">
      <button
        onClick={() => setShowPopover(!showPopover)}
        className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
          hasUpdate
            ? 'bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30'
            : 'text-text-tertiary hover:text-text-secondary'
        }`}
        title={hasUpdate ? 'Update available' : `Broomy v${version}`}
      >
        v{version}
        {hasUpdate && (
          <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-accent" />
        )}
      </button>

      {showPopover && (
        <>
          {/* Backdrop to close popover */}
          <div className="fixed inset-0 z-40" onClick={() => setShowPopover(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-bg-secondary border border-border rounded-lg shadow-xl p-3">
            <div className="text-xs text-text-secondary mb-1">Current version</div>
            <div className="text-sm font-medium text-text-primary mb-3">v{version}</div>

            {updateState.status === 'idle' && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-tertiary">Up to date</span>
                <button
                  onClick={handleCheckForUpdates}
                  className="text-xs text-accent hover:underline"
                >
                  Check for updates
                </button>
              </div>
            )}

            {updateState.status === 'available' && (
              <>
                <div className="text-xs text-text-secondary mb-1">New version available</div>
                <div className="text-sm font-medium text-accent mb-2">v{updateState.version}</div>
                {updateState.releaseNotes && (
                  <div className="text-xs text-text-secondary mb-2 max-h-24 overflow-y-auto whitespace-pre-wrap">
                    {updateState.releaseNotes}
                  </div>
                )}
                <button
                  onClick={handleDownload}
                  className="w-full px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors"
                >
                  Download Update
                </button>
              </>
            )}

            {updateState.status === 'downloading' && (
              <>
                <div className="text-xs text-text-secondary mb-2">Downloading update...</div>
                <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${Math.round(updateState.percent)}%` }}
                  />
                </div>
                <div className="text-[10px] text-text-tertiary mt-1 text-right">
                  {Math.round(updateState.percent)}%
                </div>
              </>
            )}

            {updateState.status === 'ready' && (
              <>
                <div className="text-xs text-text-secondary mb-2">Update downloaded. Restart to apply.</div>
                <button
                  onClick={handleInstall}
                  className="w-full px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors"
                >
                  Restart to Update
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
