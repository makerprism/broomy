/**
 * Console guard for tests.
 *
 * Replaces console.error and console.warn with tracking wrappers at module load
 * time. After each test, `checkAndReset()` throws if either was called unless
 * the test opted out via `allowConsoleError()` / `allowConsoleWarn()`.
 *
 * Tests that use `vi.spyOn(console, 'error').mockImplementation(...)` naturally
 * bypass our wrapper for the duration of the spy — no special handling needed.
 */

const errors: unknown[][] = []
const warns: unknown[][] = []
let errorsAllowed = false
let warnsAllowed = false

const _origError = console.error.bind(console)

console.error = (...args: unknown[]) => {
  errors.push(args)
}
console.warn = (...args: unknown[]) => {
  warns.push(args)
}

/** Call in a test (or beforeEach) to suppress the console.error check for that test. */
export function allowConsoleError() {
  errorsAllowed = true
}

/** Call in a test (or beforeEach) to suppress the console.warn check for that test. */
export function allowConsoleWarn() {
  warnsAllowed = true
}

/** Called in the global afterEach to assert no unexpected console output. */
export function checkAndReset(): void {
  const e = errors.splice(0)
  const w = warns.splice(0)
  const eAllowed = errorsAllowed
  const wAllowed = warnsAllowed
  errorsAllowed = false
  warnsAllowed = false

  const violations: string[] = []
  if (!eAllowed && e.length > 0) {
    violations.push(...e.map((a) => `console.error(${a.map(String).join(', ')})`))
  }
  if (!wAllowed && w.length > 0) {
    violations.push(...w.map((a) => `console.warn(${a.map(String).join(', ')})`))
  }
  if (violations.length > 0) {
    _origError(`Unexpected console output in test:\n  ${  violations.join('\n  ')}`)
    throw new Error(`Unexpected console output:\n  ${violations.join('\n  ')}`)
  }
}
