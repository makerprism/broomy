import { useMemo, useState } from 'react'
import { useAgentStore } from '../../store/agents'

export function CloudSessionView({
  onBack,
  onComplete,
}: {
  onBack: () => void
  onComplete: (
    directory: string,
    agentId: string | null,
    extra?: {
      name?: string
      execution?: {
        mode: 'remote-ssh'
        provider: 'ubicloud'
        location: string
        size: string
        remoteDir: string
        unixUser: string
        vmName?: string
        publicKey?: string
      }
    },
  ) => void
}) {
  const { agents } = useAgentStore()
  const [name, setName] = useState('')
  const [location, setLocation] = useState('eu-central-h1')
  const [size, setSize] = useState('burstable-2')
  const [unixUser, setUnixUser] = useState('ubuntu')
  const [remoteDir, setRemoteDir] = useState('~/workspace')
  const [vmName, setVmName] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    return location.trim() && size.trim() && unixUser.trim() && remoteDir.trim()
  }, [location, size, unixUser, remoteDir])

  const handleSubmit = () => {
    if (!canSubmit) {
      setError('Please fill location, size, unix user, and remote directory.')
      return
    }
    setError(null)

    onComplete(remoteDir.trim(), selectedAgentId || null, {
      name: name.trim() || undefined,
      execution: {
        mode: 'remote-ssh',
        provider: 'ubicloud',
        location: location.trim(),
        size: size.trim(),
        remoteDir: remoteDir.trim(),
        unixUser: unixUser.trim(),
        vmName: vmName.trim() || undefined,
        publicKey: publicKey.trim() || undefined,
      },
    })
  }

  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-lg font-medium text-text-primary">Cloud Session</h2>
          <p className="text-xs text-text-secondary">Ubicloud SSH-backed terminal session</p>
        </div>
      </div>

      <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
        <label className="block space-y-1">
          <span className="text-xs text-text-secondary">Session Name (optional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 text-sm rounded bg-bg-primary border border-border text-text-primary" placeholder="my-cloud-session" />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-text-secondary">Agent</span>
          <select value={selectedAgentId} onChange={(e) => setSelectedAgentId(e.target.value)} className="w-full px-3 py-2 text-sm rounded bg-bg-primary border border-border text-text-primary">
            <option value="">Shell Only</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs text-text-secondary">Ubicloud Location</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full px-3 py-2 text-sm rounded bg-bg-primary border border-border text-text-primary" placeholder="eu-central-h1" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-text-secondary">VM Size</span>
            <input value={size} onChange={(e) => setSize(e.target.value)} className="w-full px-3 py-2 text-sm rounded bg-bg-primary border border-border text-text-primary" placeholder="burstable-2" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs text-text-secondary">Unix User</span>
            <input value={unixUser} onChange={(e) => setUnixUser(e.target.value)} className="w-full px-3 py-2 text-sm rounded bg-bg-primary border border-border text-text-primary" placeholder="ubuntu" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-text-secondary">Remote Directory</span>
            <input value={remoteDir} onChange={(e) => setRemoteDir(e.target.value)} className="w-full px-3 py-2 text-sm rounded bg-bg-primary border border-border text-text-primary" placeholder="~/workspace" />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-text-secondary">VM Name (optional)</span>
          <input value={vmName} onChange={(e) => setVmName(e.target.value)} className="w-full px-3 py-2 text-sm rounded bg-bg-primary border border-border text-text-primary" placeholder="broomy-my-session" />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-text-secondary">SSH Public Key (optional)</span>
          <textarea value={publicKey} onChange={(e) => setPublicKey(e.target.value)} className="w-full px-3 py-2 text-sm rounded bg-bg-primary border border-border text-text-primary font-mono" rows={3} placeholder="ssh-ed25519 AAAA..." />
          <p className="text-[11px] text-text-secondary">Leave empty to use BROOMY_UBI_PUBLIC_KEY or UBI_PUBLIC_KEY from environment.</p>
        </label>

        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>

      <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
        <button onClick={onBack} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={!canSubmit} className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50">Create Cloud Session</button>
      </div>
    </>
  )
}
