import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const RESTORE_MARKER = 'E2E_RESTORE_MARKER: conversation should stay visible'

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
      E2E_CONVERSATION_RESTORE_SNAPSHOT: 'true',
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

test('restored conversation remains visible after Claude startup output', async () => {
  const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
  await broomySession.click()

  await expect.poll(async () => {
    const text = await getTerminalText(page)
    return text.includes(RESTORE_MARKER)
  }, { timeout: 8000 }).toBe(true)

  await page.waitForTimeout(1500)

  const textAfterStartup = await getTerminalText(page)
  expect(textAfterStartup).toContain(RESTORE_MARKER)
})
