# Claude Code Cloud Overview

## Goal

Run Claude Code sessions on Ubicloud burstable VMs instead of local compute, so heavy tasks (builds, tests, Docker containers) do not consume local machine resources.

V1 scope is **terminal-only remote execution**: the terminal runs remotely over SSH, while local file explorer/source-control parity is out of scope.

## Product Definition

Each session can be configured as either:

- **Local**: current behavior, PTY + filesystem + git all local
- **Cloud (Ubicloud SSH)**: PTY runs on a Ubicloud VM; session terminal streams through SSH

## Lifecycle Requirements (Authoritative)

These rules are mandatory and define the feature:

1. **Session create**
   - If session is cloud-backed and eligible, VM must be provisioned automatically.
2. **App relaunch / profile load**
   - Restored sessions start in `idle` state.
   - Only sessions that are both non-archived and non-idle are VM-eligible.
3. **Session close/delete**
   - Backing VM must be decommissioned.
4. **App close / window-all-closed / quit**
   - All active cloud VMs must be decommissioned before process exit (bounded timeout, best effort).
5. **Idle timeout policy**
   - If a cloud session remains idle for more than 5 minutes, decommission VM and persist session state.

## VM Eligibility Rule

A cloud session should have a running VM **iff**:

```
execution.mode == "remote-ssh" && !session.isArchived && session.status != "idle"
```

This makes VM runtime state derived from session runtime state.

## UX Expectations (V1)

- New Session flow includes a cloud option for Ubicloud SSH.
- Cloud sessions display a "Cloud"/"Remote" indicator in session UI.
- Explorer/source-control behaviors that require local filesystem/git can be disabled or hidden for cloud sessions in V1.
- If VM provisioning fails, session shows an actionable error and remains available for retry.

## Out of Scope (V1)

- Full remote filesystem browsing/editing
- Full remote git operations in explorer/source-control panels
- Multi-cloud abstraction beyond Ubicloud
- Cost analytics dashboard

## Success Criteria

- Cloud session can be created, provision VM, start remote terminal, and run Claude/build workloads.
- Idle > 5 minutes reliably decommissions VM.
- Deleting session or quitting app reliably decommissions VM (idempotent if already gone).
- Relaunching app does not re-provision idle cloud sessions.
