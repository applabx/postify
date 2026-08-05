import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = '/tmp/li-oauth-trace.log'
const log = (m) => { const line = `[${new Date().toISOString()}] ${m}`; console.log(line); fs.appendFileSync(OUT, line + '\n') }

fs.writeFileSync(OUT, `=== LinkedIn OAuth live trace ${new Date().toISOString()} ===\n`)

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext()
const page = await context.newPage()

// Capture EVERY request + response, esp. linkedin + postify
page.on('request', req => {
  const u = req.url()
  if (u.includes('linkedin') || u.includes('postify.applabx.com')) {
    log(`REQ  ${req.method()} ${u}`)
    if (u.includes('oauth/v2/authorization')) {
      try {
        const p = new URL(u)
        log(`  AUTH URL PARAMS: response_type=${p.searchParams.get('response_type')}`)
        log(`  client_id=${p.searchParams.get('client_id')}`)
        log(`  redirect_uri=${p.searchParams.get('redirect_uri')}`)
        log(`  scope=${p.searchParams.get('scope')}`)
        log(`  state=${p.searchParams.get('state')}`)
        log(`  code_challenge=${p.searchParams.get('code_challenge') || '(none)'}`)
      } catch (e) { log(`  PARSE ERROR ${e.message}`) }
    }
  }
})
page.on('response', async resp => {
  const u = resp.url()
  if (u.includes('linkedin') || u.includes('postify.applabx.com')) {
    log(`RESP ${resp.status()} ${u}`)
    if (u.includes('linkedin.com/oauth/v2/authorization') && resp.status() >= 300) {
      log(`  LOCATION=${resp.headers()['location'] || '(none)'}`)
    }
    if (u.includes('postify.applabx.com/api/oauth/linkedin')) {
      log(`  LOCATION=${resp.headers()['location'] || '(none)'}`)
    }
  }
})

try {
  // Step 1: production login page — PAUSE for manual login
  log('STEP 1: navigating to https://postify.applabx.com/login — log in manually now')
  await page.goto('https://postify.applabx.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)
  log('STEP 2: WAITING up to 5 min for manual login...')
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(5000)
    const url = page.url()
    if (url.includes('/compose') || url.includes('/accounts')) break
    if (i % 6 === 5) log(`  still on ${url} (${(i+1)*5}s elapsed)`)
  }
  log(`POST-LOGIN URL: ${page.url()}`)

  // Step 3: go to accounts, click Connect LinkedIn
  await page.goto('https://postify.applabx.com/accounts', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3000)
  log('STEP 3: accounts page loaded; looking for LinkedIn connect button')
  // The LinkedIn card's connect button links to /api/oauth/linkedin/start
  // The accounts page uses <button onClick="window.location.href='/api/oauth/linkedin/start'">
  // inside each platform card. Robust approach: DOM-walk from each "Connect"
  // button up to the enclosing card and click the one whose card mentions LinkedIn.
  const clickResult = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')]
    for (const b of buttons) {
      if (!b.innerText.includes('Connect')) continue
      let el = b
      for (let depth = 0; el && depth < 12; depth++, el = el.parentElement) {
        const t = el.innerText || ''
        if (t.includes('LinkedIn') && t.includes('Connect') && el.children.length < 40) {
          b.click()
          return 'clicked button inside LinkedIn card'
        }
      }
    }
    return 'NOT FOUND'
  })
  log(`  click: ${clickResult}`)
  await page.waitForTimeout(8000)

  log(`AFTER CLICK URL: ${page.url()}`)

  // Step 4: if on linkedin auth page — PAUSE for manual authorization (5 min)
  if (page.url().includes('linkedin.com')) {
    log('STEP 4: ON LINKEDIN AUTHORIZATION PAGE — please approve or deny manually (up to 5 min)')
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(5000)
      const u = page.url()
      if (u.includes('postify.applabx.com')) break
      if (i % 6 === 5) log(`  still on ${u.slice(0, 100)} (${(i+1)*5}s elapsed)`)
    }
  }

  log(`FINAL URL: ${page.url()}`)
  await page.waitForTimeout(5000)
  const body = await page.evaluate(() => document.body.innerText.slice(0, 500))
  log(`FINAL PAGE TEXT: ${body.replace(/\n/g, ' | ')}`)
} catch (err) {
  log(`ERROR: ${err.message}`)
}

log('=== TRACE COMPLETE ===')
await browser.close()
