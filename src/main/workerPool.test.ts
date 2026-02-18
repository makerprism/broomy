import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'path'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { runInWorker } from './workerPool'

const TEST_DIR = join(tmpdir(), 'broomy-worker-test')

function createTestWorker(filename: string, code: string): string {
  mkdirSync(TEST_DIR, { recursive: true })
  const workerPath = join(TEST_DIR, filename)
  writeFileSync(workerPath, code)
  return workerPath
}

function cleanup(): void {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

describe('runInWorker', () => {
  afterEach(cleanup)

  it('resolves with result from worker', async () => {
    const workerPath = createTestWorker('result.js', `
      const { parentPort, workerData } = require('worker_threads');
      parentPort.postMessage({ type: 'result', data: workerData.x + workerData.y });
    `)

    const result = await runInWorker<number>(workerPath, { x: 2, y: 3 })
    expect(result).toBe(5)
  })

  it('rejects on worker error message', async () => {
    const workerPath = createTestWorker('error-msg.js', `
      const { parentPort } = require('worker_threads');
      parentPort.postMessage({ type: 'error', error: 'something went wrong' });
    `)

    await expect(runInWorker(workerPath, {})).rejects.toThrow('something went wrong')
  })

  it('rejects on worker runtime error', async () => {
    const workerPath = createTestWorker('runtime-error.js', `
      throw new Error('boom');
    `)

    await expect(runInWorker(workerPath, {})).rejects.toThrow()
  })

  it('calls onProgress callback for progress messages', async () => {
    const workerPath = createTestWorker('progress.js', `
      const { parentPort } = require('worker_threads');
      parentPort.postMessage({ type: 'progress', data: { message: 'step 1', percent: 50 } });
      parentPort.postMessage({ type: 'result', data: 'done' });
    `)

    const progressCalls: { message: string; percent?: number }[] = []
    const result = await runInWorker<string>(workerPath, {}, (p) => progressCalls.push(p))

    expect(result).toBe('done')
    expect(progressCalls).toEqual([{ message: 'step 1', percent: 50 }])
  })

  it('rejects on non-zero exit code without result', async () => {
    const workerPath = createTestWorker('bad-exit.js', `
      process.exit(1);
    `)

    await expect(runInWorker(workerPath, {})).rejects.toThrow('Worker exited with code 1')
  })
})
