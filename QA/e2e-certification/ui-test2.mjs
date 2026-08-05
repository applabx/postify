import { chromium } from 'playwright'

const BASE = 'http://localhost:3002'

async function loginAndCheck(page, label) {
  const consoleErrors = []
  const pageErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 150)) })
  page.on('pageerror', e => pageErrors.push(e.message.slice(0, 150)))

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type=email]')
  await page.fill('input[type=email]', 'cert@test.local')
  await page.fill('input[type=password]', 'CertPassw0rd!')
  await page.click('button[type=submit]')
  // Wait for either /compose or an error message
  await page.waitForTimeout(2500)
  const url = page.url()
  const errorText = await page.evaluate(() => document.body.innerText.includes('Incorrect email') || document.body.innerText.includes('attempts') ? document.body.innerText.slice(0, 200) : '')

  console.log(`[${label}] login result: ${url.includes('/compose') ? 'SUCCESS' : 'FAILED'} (${url})`)
  if (errorText) console.log(`[${label}] login error text: ${errorText.slice(0, 120)}`)

  if (!url.includes('/compose')) {
    // try once more (cold-start rate limit retry)
    await page.waitForTimeout(2000)
    await page.fill('input[type=email]', 'cert@test.local')
    await page.fill('input[type=password]', 'CertPassw0rd!')
    await page.click('button[type=submit]')
    await page.waitForTimeout(2500)
    const url2 = page.url()
    console.log(`[${label}] retry login: ${url2.includes('/compose') ? 'SUCCESS' : 'FAILED'} (${url2})`)
  }

  // Visit pages one at a time with generous waits
  for (const route of ['/compose', '/accounts', '/history', '/queue', '/analytics']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const bodyChars = await page.evaluate(() => document.body.innerText.length)
    const hasLoading = await page.evaluate(() => document.body.innerText.includes('Loading'))
    console.log(`[${label}] ${route}: ${bodyChars} chars${hasLoading ? ' [still loading]' : ''}`)
  }

  await page.waitForTimeout(1000)
  console.log(`[${label}] console errors: ${consoleErrors.length} | page errors: ${pageErrors.length}`)
  consoleErrors.slice(0, 4).forEach(e => console.log(`  [${label}] console: ${e}`))
  pageErrors.slice(0, 4).forEach(e => console.log(`  [${label}] pageerror: ${e}`))
  return { consoleErrors, pageErrors }
}

const browser = await chromium.launch()

// Desktop
const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const p1 = await ctx1.newPage()
await loginAndCheck(p1, 'desktop')
await ctx1.close()

// Tablet
const ctx2 = await browser.newContext({ viewport: { width: 768, height: 1024 } })
const p2 = await ctx2.newPage()
await loginAndCheck(p2, 'tablet')
await ctx2.close()

// Mobile + overflow check
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } })
const p3 = await ctx3.newPage()
await loginAndCheck(p3, 'mobile')
for (const route of ['/compose', '/accounts', '/history', '/queue', '/analytics']) {
  await p3.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
  await p3.waitForTimeout(1500)
  const overflow = await p3.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  console.log(`[mobile-overflow] ${route}: ${overflow ? 'OVERFLOW' : 'ok'}`)
}
// Screenshot
await p3.goto(`${BASE}/compose`, { waitUntil: 'domcontentloaded' })
await p3.waitForTimeout(2000)
await p3.screenshot({ path: 'QA/e2e-certification/mobile-compose.png' })
await ctx3.close()

await browser.close()
console.log('\nUI RE-RUN COMPLETE')
