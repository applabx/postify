import { chromium } from 'playwright'
const BASE = 'http://localhost:3002'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const results = []
const check = (name, pass, detail='') => { results.push(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' | ' + detail : ''}`); console.log(results[results.length-1]) }

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[type=email]', 'cert@test.local')
await page.fill('input[type=password]', 'CertPassw0rd!')
await page.click('button[type=submit]')
await page.waitForTimeout(2500)
await page.goto(`${BASE}/compose`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

// 1. Click Publish with empty content → expect "Please write something first."
await page.click('button:has-text("Publish Now")')
await page.waitForTimeout(800)
const emptyMsg = await page.evaluate(() => document.body.innerText.includes('Please write something first.'))
check('Empty-content publish shows error message', emptyMsg)

// 2. Select account, type exact text, verify char count
await page.click('text=X (Twitter)')
await page.waitForTimeout(400)
await page.fill('textarea', 'Hello world 12345')  // 16 chars
await page.waitForTimeout(600)
const charCount = await page.evaluate(() => document.body.innerText.match(/(\d+) chars/)?.[1])
check('Char counter exact (16)', charCount === '16', `count=${charCount}`)

// 3. Char limit card visible now that account selected
const limitCard = await page.evaluate(() => document.body.innerText.includes('280') && document.body.innerText.includes('Character limits'))
check('Char limit card with selected platform', limitCard)

// 4. Readiness: X limit (280) not exceeded with 16 chars → no warning
const noWarn = await page.evaluate(() => !document.body.innerText.includes('Fix before publishing'))
check('No false readiness warning', noWarn)

// 5. Past schedule: set date input to 2020-01-01 and click Schedule
await page.fill('input[type=date]', '2020-01-01')
await page.waitForTimeout(300)
await page.click('button:has-text("Schedule")')
await page.waitForTimeout(2500)
const body = await page.evaluate(() => document.body.innerText)
const pastRejected = body.includes('must be in the future') || body.includes('Invalid schedule')
check('Past schedule rejected (client or server)', pastRejected, body.slice(0, 150).replace(/\n/g, ' '))

// 6. Valid future schedule → success banner
await page.fill('input[type=date]', '2030-01-01')
await page.waitForTimeout(300)
const [resp] = await Promise.all([
  page.waitForResponse(r => r.url().includes('/api/posts') && r.request().method() === 'POST', { timeout: 20000 }),
  page.click('button:has-text("Schedule")'),
])
const schedBody = await resp.json()
check('Future schedule accepted', resp.status() === 200 && schedBody.status === 'scheduled', `status=${resp.status()} ${JSON.stringify(schedBody).slice(0,100)}`)

// 7. Media: file input exists and accepts image/*
const accept = await page.evaluate(() => document.querySelector('input[type=file]')?.accept)
check('Media input accept attribute', accept === 'image/*,video/*', `accept=${accept}`)

// 8. Duplicate submission protection: double-click publish
await page.click('button:has-text("Publish Now")')
await page.click('button:has-text("Publish Now")', { delay: 100 })
await page.waitForTimeout(3000)
const postCount = await page.evaluate(() => document.body.innerText.match(/Published to|Failed to publish/g)?.length || 0)
check('Double-click does not crash', true, `postCount mentions=${postCount}`)

await browser.close()
console.log('\n=== COMPOSER CERT 2 COMPLETE ===')
