import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:3002/login', { waitUntil: 'domcontentloaded' })
await page.fill('input[type=email]', 'cert@test.local')
await page.fill('input[type=password]', 'CertPassw0rd!')
await page.click('button[type=submit]')
await page.waitForTimeout(2500)
const routes = ['/compose', '/accounts', '/history', '/queue', '/analytics']
for (let round = 0; round < 3; round++) {
  for (const r of routes) {
    await page.goto(`http://localhost:3002${r}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
  }
}
const heap = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 'n/a')
console.log(`After 15 navigations, JS heap: ${heap} MB`)
await browser.close()
