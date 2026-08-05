import { chromium } from 'playwright'
const BASE = 'http://localhost:3002'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[type=email]', 'cert@test.local')
await page.fill('input[type=password]', 'CertPassw0rd!')
await page.click('button[type=submit]')
await page.waitForTimeout(2500)
await page.goto(`${BASE}/compose`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

// Select account
await page.click('text=X (Twitter)')
await page.waitForTimeout(500)
// Type 300 chars (over X's 280 limit)
const longText = 'a'.repeat(300)
await page.fill('textarea', longText)
await page.waitForTimeout(1000)

const state = await page.evaluate(() => {
  const t = document.body.innerText
  return {
    hasCharLimits: t.includes('Character limits'),
    has280: t.includes('280'),
    has300: t.includes('300'),
    hasFixWarning: t.includes('Fix before publishing'),
    exceeds: t.includes('exceeds character limit'),
    publishLabel: [...document.querySelectorAll('button')].find(b => b.innerText.includes('Publish'))?.innerText || '',
    publishDisabled: [...document.querySelectorAll('button')].find(b => b.innerText.includes('Publish'))?.disabled,
  }
})
console.log(JSON.stringify(state, null, 2))
await browser.close()
