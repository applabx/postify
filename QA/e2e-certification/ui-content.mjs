import { chromium } from 'playwright'
const BASE = 'http://localhost:3002'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[type=email]', 'cert@test.local')
await page.fill('input[type=password]', 'CertPassw0rd!')
await page.click('button[type=submit]')
await page.waitForTimeout(2500)
await page.goto(`${BASE}/compose`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const composeHas = await page.evaluate(() => ({
  textarea: !!document.querySelector('textarea'),
  platformsHeading: document.body.innerText.includes('Platforms'),
  connectAccounts: document.body.innerText.includes('Connect'),
  publishButton: document.body.innerText.includes('Publish'),
  scheduleButton: document.body.innerText.includes('Schedule'),
  mediaLabel: document.body.innerText.includes('Media'),
  charCounter: document.body.innerText.includes('chars'),
}))
console.log('Compose page elements:', JSON.stringify(composeHas))
await page.screenshot({ path: 'QA/e2e-certification/desktop-compose.png' })

// Accounts page
await page.goto(`${BASE}/accounts`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const accountsHas = await page.evaluate(() => ({
  connectedAccounts: document.body.innerText.includes('Connected Accounts'),
  linkedin: document.body.innerText.includes('LinkedIn'),
  facebook: document.body.innerText.includes('Facebook'),
  connectButtons: document.body.innerText.includes('Connect'),
}))
console.log('Accounts page elements:', JSON.stringify(accountsHas))
await page.screenshot({ path: 'QA/e2e-certification/desktop-accounts.png' })

// History empty state
await page.goto(`${BASE}/history`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
const historyHas = await page.evaluate(() => ({
  heading: document.body.innerText.includes('Post History'),
  emptyState: document.body.innerText.includes('No posts yet'),
}))
console.log('History page:', JSON.stringify(historyHas))

await browser.close()
console.log('CONTENT CHECK COMPLETE')
