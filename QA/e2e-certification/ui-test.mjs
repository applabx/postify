import { chromium } from 'playwright'

const BASE = 'http://localhost:3002'
const results = []
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]

function log(msg) { console.log(msg); results.push(msg) }

for (const vp of viewports) {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
  const consoleErrors = []
  const pageErrors = []
  const failedRequests = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', e => pageErrors.push(e.message))
  page.on('requestfailed', r => failedRequests.push(`${r.url()} (${r.failure()?.errorText})`))

  log(`\n=== VIEWPORT: ${vp.name} (${vp.width}x${vp.height}) ===`)

  // Login first
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type=email]', 'cert@test.local')
  await page.fill('input[type=password]', 'CertPassw0rd!')
  await page.click('button[type=submit]')
  await page.waitForURL('**/compose', { timeout: 15000 }).catch(() => {})
  log(`Login redirect: ${page.url()}`)

  // Navigate every route
  const routes = ['/compose', '/accounts', '/history', '/queue', '/analytics']
  for (const route of routes) {
    const resp = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch(e => null)
    const status = resp ? resp.status() : 'ERR'
    const hasContent = await page.evaluate(() => document.body.innerText.length)
    log(`GET ${route}: HTTP ${status} | body chars: ${hasContent}`)
  }

  // Verify no horizontal overflow on each page
  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    if (overflow) log(`FAIL horizontal overflow on ${route} (${vp.name})`)
  }

  log(`Console errors: ${consoleErrors.length} | Page errors: ${pageErrors.length} | Failed requests: ${failedRequests.length}`)
  if (consoleErrors.length) consoleErrors.slice(0, 5).forEach(e => log(`  console: ${e.slice(0, 120)}`))
  if (pageErrors.length) pageErrors.slice(0, 5).forEach(e => log(`  pageerror: ${e.slice(0, 120)}`))
  if (failedRequests.length) failedRequests.slice(0, 5).forEach(e => log(`  failed-req: ${e.slice(0, 120)}`))

  // Logout to leave clean state
  await page.goto(`${BASE}/compose`, { waitUntil: 'networkidle' })
  await browser.close()
}

console.log('\n=== UI SMOKE COMPLETE ===')
