# Claude Code Cloud Technical Plan

## Architecture Summary

Implement cloud sessions as a **main-process orchestrated lifecycle service** plus SSH-backed PTY transport.

- Renderer remains responsible for user intent and session UI state.
- Main process is authoritative for VM provisioning/decommissioning.
- VM runtime is derived from session runtime (`status`, `isArchived`, `execution.mode`).

## Session Data Model Changes

Extend persisted session data with cloud execution metadata.

```ts
type SessionExecution =
  | { mode: 'local' }
  | {
      mode: 'remote-ssh'
      provider: 'ubicloud'
      location: string
      size: string
      remoteDir: string
      unixUser: string
      vmName?: string
      vmId?: string
      host?: string
    }
```

Fields should be added to:

- `src/preload/apis/types.ts` (`SessionData`)
- `src/renderer/store/sessions.ts` (`Session`)
- Config save/load paths in session persistence

## Main Process: Cloud VM Manager

Add a dedicated service under `src/main/` (for example `cloud/vmManager.ts`).

Responsibilities:

1. Track cloud session runtime state
2. Enforce VM eligibility transitions
3. Provision/decommission Ubicloud VMs
4. Maintain per-session locks to prevent create/delete races
5. Manage idle timers (5 minutes)
6. Support app shutdown teardown

### Internal State

```ts
type SessionRuntime = {
  sessionId: string
  eligible: boolean
  vm?: { id?: string; name: string; host?: string; location: string }
  idleTimer?: NodeJS.Timeout
  inFlight?: Promise<void>
}
```

### Required Properties

- **Idempotent ensure:** no duplicate VM creation
- **Idempotent decommission:** deleting missing VM is success
- **Bounded operations:** create/decommission have timeouts
- **Best effort on quit:** attempt all teardowns, then continue shutdown

## Ubicloud Integration

Use `ubi` CLI initially for operational simplicity and parity with user tooling.

Expected command families:

- create VM
- inspect/list VM (resolve host/ip and state)
- destroy VM

Auth model:

- `UBI_TOKEN` sourced from app process environment
- fail fast with clear user-facing error if missing

Naming model:

- Deterministic `vmName` derived from profile + session id
- Persist `vmId` once resolved
- Lifecycle calls prefer `vmId`, fallback to `vmName`

## IPC Contract

Add cloud orchestration APIs exposed through preload.

Suggested IPC handlers:

- `cloud:syncSessions(snapshots)`
  - Renderer sends current cloud-relevant runtime state after loads/changes.
- `cloud:ensureSessionVm(sessionSnapshot)`
  - Immediate ensure for newly active eligible session.
- `cloud:decommissionSessionVm(sessionSnapshot)`
  - Immediate explicit teardown (delete/archive/manual remove).
- `cloud:shutdownAll()`
  - Main-process app shutdown path calls this before final quit.

Session snapshot payload should include:

- `id`
- `isArchived`
- `status`
- `execution` (including Ubicloud config)

## Eligibility and Timer Logic

On every snapshot update:

1. Compute `eligible = mode == remote-ssh && !isArchived && status != idle`
2. If newly eligible: cancel idle timer and ensure VM
3. If transitioned to idle (and otherwise cloud-eligible): start 5-minute timer
4. If timer fires and still idle: decommission VM and persist session state
5. If archived/deleted: immediate decommission

Renderer runtime transitions (`working`/`idle`) already flow through session store; wire those to `cloud:syncSessions`.

## PTY Integration

In PTY create handler:

- Local sessions: unchanged behavior
- Cloud sessions:
  1. ensure VM ready (must exist + reachable host)
  2. spawn SSH command via `node-pty`
  3. run shell/agent command in remote dir

SSH baseline options:

- `-tt`
- `-o ServerAliveInterval=30`
- `-o ServerAliveCountMax=3`
- `-o ConnectTimeout=15`

## Renderer Integration Points

1. On profile/session load completion: send `cloud:syncSessions`
2. On session status changes (`working`/`idle`): send `cloud:syncSessions`
3. On archive/unarchive/delete: invoke explicit cloud teardown/ensure as needed
4. On new cloud session creation: ensure before first terminal usage

## App Quit Semantics

Main process lifecycle hooks should:

1. Trigger `cloud:shutdownAll()`
2. Await completion with timeout budget
3. Proceed with existing PTY/file watcher cleanup

This must run for:

- window close paths that end app lifetime
- `window-all-closed`
- explicit quit flows

## Failure Handling

- Provision failure: session enters error surface with retry action
- Decommission failure: log + retry during next sync/shutdown, never crash UI
- Network/API flake: exponential backoff for ensure/decommission retries (bounded)

## Rollout Plan

### Phase 1

- Data model + IPC skeleton
- VM manager with eligibility engine + idle timer
- Ubicloud CLI create/destroy wiring
- SSH PTY path for cloud sessions

### Phase 2

- Quit-path hardening + retry strategy
- Better cloud status indicators in session list
- telemetry/logging for lifecycle events

### Phase 3

- Optional enhancements (janitor for stale VMs, richer policy controls)

## Test Plan

Unit tests:

- VM manager eligibility transitions
- 5-minute idle timeout decommission behavior
- race-safe ensure/decommission idempotency
- app shutdown teardown behavior

Renderer/store tests:

- load sessions -> sync snapshot emission
- status transitions -> sync emission
- delete/archive -> explicit teardown calls

Main handler tests:

- cloud PTY path builds SSH command and streams data

Validation commands:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm check:all`
- `pnpm test:unit`
- Ask user before `pnpm test` (E2E)
