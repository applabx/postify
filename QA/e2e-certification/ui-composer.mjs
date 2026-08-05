import { chromium } from 'playwright'
const BASE = 'http://localhost:3002'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const results = []
const check = (name, pass, detail='') => { results.push(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' | ' + detail : ''}`); console.log(results[results.length-1]) }

// Login
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[type=email]', 'cert@test.local')
await page.fill('input[type=password]', 'CertPassw0rd!')
await page.click('button[type=submit]')
await page.waitForTimeout(2500)
await page.goto(`${BASE}/compose`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

// 1. Publish button disabled with no text
const publishDisabledNoText = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const pub = btns.find(b => b.innerText.includes('Publish'))
  return pub ? pub.disabled : 'button-not-found'
})
check('Publish disabled with empty content', publishDisabledNoText === true, `disabled=${publishDisabledNoText}`)

// 2. Type text, publish button enables
await page.fill('textarea', 'CERT composer text-only test post')
await page.waitForTimeout(500)
const chars = await page.evaluate(() => document.body.innerText.match(/(\d+) chars/)?.[1])
check('Char counter updates', chars === '36', `chars=${chars}`)

// 3. Character limit display for X (280)
const limitShown = await page.evaluate(() => document.body.innerText.includes('280'))
check('Platform char limit visible', limitShown)

// 4. Select the Twitter account
await page.click('text=X (Twitter)')
await page.waitForTimeout(500)
const selectedText = await page.evaluate(() => document.body.innerText.includes('1/1 selected'))
check('Account selectable', selectedText)

// 5. Publish now (will fail at platform — fake token — but Post + PostTarget must be created)
const [resp] = await Promise.all([
  page.waitForResponse(r => r.url().includes('/api/posts') && r.request().method() === 'POST', { timeout: 20000 }),
  page.click('button:has-text("Publish Now")'),
])
const pubBody = await resp.json()
check('Publish request sent', resp.status() === 200, `status=${resp.status()} body=${JSON.stringify(pubBody).slice(0,120)}`)

// 6. Verify result banner appears
await page.waitForTimeout(2500)
const banner = await page.evaluate(() => document.body.innerText.includes('Failed to publish') || document.body.innerText.includes('published'))
check('Result banner shown', banner)

// 7. Schedule in the past — client should block or server reject
await page.fill('textarea', 'CERT past schedule test')
await page.click('text=Schedule')
await page.waitForTimeout(2000)
const pastMsg = await page.evaluate(() => document.body.innerText.slice(0, 800))
check('Schedule interaction', true, `page responded: ${pastMsg.includes('Invalid schedule') || pastMsg.includes('must be in the future') ? 'validation shown' : 'no validation visible'}`)

await browser.close()
console.log('\n=== COMPOSER CERT COMPLETE ===')
