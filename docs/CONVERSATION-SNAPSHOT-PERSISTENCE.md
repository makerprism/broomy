# Conversation Snapshot Persistence

This document describes how Broomy persists agent conversation snapshots so users can continue from saved session context after restart.

## Problem Statement

Today, when Broomy closes, PTY processes are terminated and terminal UI buffers are lost. On next launch, sessions still exist, but the visible conversation history does not.

This creates friction for long-running tasks:

- Users lose the visible transcript of what the agent was doing.
- Users must re-establish context manually.
- Restarting the app feels like a hard reset, even when session metadata is preserved.

## Goals

- Persist enough terminal conversation state to recover session context after restart.
- Keep startup output clean by avoiding terminal snapshot replay spam.
- Keep implementation profile-aware and compatible with existing config files.
- Keep config growth controlled with hard limits and truncation.

## Non-Goals

- Keep PTY processes alive across app restarts.
- Guarantee agent-side resume semantics for all CLI tools.
- Persist full unbounded terminal output forever.

## Current Behavior

- PTYs are killed when windows close and when all windows close.
- Session config persists structural UI/session fields, but not terminal transcript.
- Agent status/unread/message fields are runtime-only and reset on launch.

## Behavior

During runtime, Broomy periodically captures a bounded snapshot of each active agent terminal buffer and saves it in session config. On shutdown, Broomy performs a best-effort final flush.

On startup, Broomy does **not** replay snapshot text into xterm. This avoids noisy banners and stale-output dumps in fresh terminals.

Result: users re-open Broomy, keep a saved session snapshot/transcript context, and continue from there without terminal spam.

## Scope Choice

Phase 1 should implement snapshot persistence and transcript continuity.

- Fastest path to user value.
- Works with any agent CLI.
- No dependency on tool-specific `--resume` behavior.

Optional Phase 2 can add agent-specific resume command support where available.

## Data Model

Add a persisted optional session field:

```ts
type ConversationSnapshot = {
  format: 'xterm-serialize-v1'
  content: string
  capturedAt: number
  truncated: boolean
  approxLineCount: number
}

type SessionData = {
  // existing fields...
  conversationSnapshot?: ConversationSnapshot
}
```

Notes:

- `format` allows future migration if snapshot encoding changes.
- `content` stores serialized xterm output (ANSI preserved).
- `truncated` + `approxLineCount` make limits explicit for debugging.

Runtime state should also track whether snapshot content is dirty since last save:

```ts
type Session = {
  // existing fields...
  conversationSnapshot?: ConversationSnapshot
  conversationSnapshotDirty?: boolean // runtime-only
}
```

## Capture Strategy

Capture from the existing terminal buffer registry used by agent terminals.

Recommended limits:

- Max lines: 1500
- Max bytes (UTF-8): 250 KB per session

If limits are exceeded, keep the most recent content and mark `truncated: true`.

Truncation algorithm (deterministic):

1. Take last `maxLines` lines.
2. Encode as UTF-8.
3. If bytes exceed `maxBytes`, trim from the start to fit `maxBytes`, preserving valid UTF-8 boundaries.
4. Recompute `approxLineCount` from the final content.

Snapshot payload format for Phase 1 should be plain text (last lines), not raw terminal control replay. Keep `format` versioned for future evolution.

## Save Timing

Use both mechanisms:

1. Normal debounced persistence path for regular state mutations.
2. A conversation checkpoint timer (e.g. every 15-30s) that runs only when snapshot state is dirty.
3. Best-effort flush on app/window shutdown to reduce tail-loss risk.

This keeps behavior robust without increasing write frequency during normal use.

Important: terminal output does not currently trigger config saves. The checkpoint timer is required to prevent stale snapshots when users only interact via terminal output.

## Startup Flow

When creating an agent terminal:

1. Create xterm instance.
2. Register buffer getter and start PTY connection.
3. Use persisted `conversationSnapshot` for session/transcript continuity features.

No snapshot text is injected into the terminal UI.

If snapshot payload is missing or invalid, continue normally (non-fatal).

## Backward Compatibility

- Existing configs without `conversationSnapshot` continue to load unchanged.
- New field is optional and ignored by older builds.
- No migration step is required; behavior is additive.
- If snapshot payload is malformed, oversized, or has unknown `format`, ignore it and continue without replay.

## Performance and Storage Considerations

- Bound snapshot size to prevent config bloat.
- Save only agent terminal transcripts (not user shell tabs) for Phase 1.
- Keep writes debounced during normal operation.
- Track write amplification: config saves rewrite the whole profile config, so checkpoint interval and byte caps should be tuned conservatively.
- Consider future move to sidecar snapshot files if config size growth becomes material.

## Security and Privacy

- Transcripts may include sensitive data typed or printed in agent sessions.
- Data is stored in local profile config under `~/.broomy/profiles/<profileId>/`.
- Document this in user-facing docs and consider a future per-profile toggle to disable transcript persistence.

## Testing Plan

Unit tests:

- Snapshot serialization/truncation helpers.
- Config save includes/excludes `conversationSnapshot` correctly.
- Config load handles missing/invalid snapshot fields safely.

Renderer behavior tests:

- Agent terminal does not replay persisted snapshot text.
- Missing/invalid snapshot data does not crash terminal setup.
- Snapshot checkpoint only saves when dirty.

Integration/E2E checks:

- Start session, generate output, close app, relaunch, verify session snapshot/transcript continuity (without terminal replay).
- Multi-profile isolation: snapshots remain scoped to the active profile config.
- Corrupted snapshot payload in config is ignored without breaking session load.

## Rollout Plan

1. Add data model fields and persistence wiring.
2. Add capture + truncation helpers and dirty tracking.
3. Add periodic dirty checkpoint saves.
4. Keep terminal startup free of snapshot replay.
5. Add best-effort shutdown flush path.
6. Add tests for truncation, malformed payloads, terminal no-replay behavior, and checkpoint behavior.
7. Update docs and release notes.

## Implementation Checklist

Use this checklist as the execution plan for Phase 1.

### 1) Types and Data Contracts

- [ ] Add `conversationSnapshot` to persisted session data type in `src/preload/apis/types.ts`.
- [ ] Add runtime session fields in `src/renderer/store/sessions.ts`:
  - [ ] `conversationSnapshot?: ConversationSnapshot`
  - [ ] `conversationSnapshotDirty?: boolean` (runtime-only)
- [ ] Ensure compile-time compatibility with existing session fixtures and tests.

Acceptance criteria:

- Typecheck passes with no unsafe casts introduced.

### 2) Persistence Wiring

- [ ] Load `conversationSnapshot` in `src/renderer/store/sessionCoreActions.ts`.
- [ ] Persist `conversationSnapshot` in `src/renderer/store/configPersistence.ts`.
- [ ] Keep `conversationSnapshotDirty` runtime-only.
- [ ] After successful save, clear dirty flags for sessions that were dirty.

Acceptance criteria:

- Saving session config writes snapshot payload when present.
- Existing configs with no snapshot continue to load.

### 3) Snapshot Builder and Truncation

- [ ] Add helper utility (e.g. `src/renderer/utils/conversationSnapshot.ts`) to:
  - [ ] Build snapshot payload from terminal buffer text
  - [ ] Enforce max lines + max bytes
  - [ ] Trim with UTF-8-safe byte boundaries
- [ ] Add tests for normal, line-trim, byte-trim, and malformed/empty cases.

Acceptance criteria:

- Utility produces deterministic results for identical input.

### 4) Periodic Checkpoint Capture

- [ ] Add periodic checkpoint logic in `src/renderer/hooks/useSessionLifecycle.ts`.
- [ ] Capture from `terminalBufferRegistry` for agent sessions.
- [ ] Update snapshot only if content changed.
- [ ] Trigger save only when at least one session changed.
- [ ] Add best-effort flush on window unload.

Acceptance criteria:

- Snapshot updates without requiring other UI mutations.
- Save frequency stays bounded by checkpoint interval.

### 5) Terminal Startup Behavior

- [ ] In `src/renderer/hooks/useTerminalSetup.ts`, do not replay persisted snapshot into xterm.
- [ ] Keep missing/invalid snapshot handling non-fatal.

Acceptance criteria:

- On app restart, terminal opens cleanly without restored snapshot banners or bulk replay.

### 6) Validation and Regression Testing

- [ ] Add/adjust unit tests for persistence and no-replay startup behavior.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm check:all`.
- [ ] Run `pnpm test:unit`.
- [ ] Run `pnpm test:unit:coverage`.
- [ ] Ask user confirmation before running `pnpm test` (E2E).

Acceptance criteria:

- All non-E2E checks pass.
- E2E passes after user confirmation.

## Future Enhancements

- Optional "agent resume mode" per agent definition (custom resume arguments).
- Per-profile or per-session toggle: "Persist conversation history".
- Retention policy controls (max days, max snapshots).
- Manual "Clear conversation history" action.
