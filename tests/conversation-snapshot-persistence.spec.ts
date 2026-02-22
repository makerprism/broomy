import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SNAPSHOT_SEED_MARKER = 'E2E_SNAPSHOT_SEED_MARKER: snapshot seed is available'

let electronApp: ElectronApplication
let page: Page

async function getTerminalText(currentPage: Page): Promise<string> {
  return currentPage.evaluate(() => {
    const rows = document.querySelectorAll('.xterm-rows')
    return Array.from(rows).map((row) => row.textContent || '').join('\n')
  })
}

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_CONVERSATION_SNAPSHOT_SEED: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
    },
  })

  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 10000 })
})

test.afterAll(async () => {
  if (electronApp) await electronApp.close()
})

test('seeded snapshot is not replayed into terminal output', async () => {
  const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
  await broomySession.click()

  await page.waitForTimeout(2000)

  const terminalText = await getTerminalText(page)
  expect(terminalText).not.toContain(SNAPSHOT_SEED_MARKER)
})
