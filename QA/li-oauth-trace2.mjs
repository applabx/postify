import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = '/tmp/li-oauth-trace2.log'
const log = (m) => { const line = `[${new Date().toISOString()}] ${m}`; console.log(line); fs.appendFileSync(OUT, line + '\n') }
fs.writeFileSync(OUT, `=== LinkedIn OAuth live trace (round 2) ${new Date().toISOString()} ===\n`)

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext()
const page = await context.newPage()

page.on('request', req => {
  const u = req.url()
  if (u.includes('linkedin.com/oauth')) {
    log(`REQ ${req.method()} ${u}`)
    try {
      const p = new URL(u)
      if (u.includes('/authorization')) {
        log(`  >>> AUTH REQUEST PARAMS:`)
        for (const k of ['response_type','client_id','redirect_uri','scope','state','code_challenge','code_challenge_method']) {
          log(`  ${k}=${p.searchParams.get(k) ?? '(absent)'}`)
        }
      }
    } catch {}
  }
  if (u.includes('postify.applabx.com/api/oauth/linkedin')) {
    log(`REQ ${req.method()} ${u}`)
    try {
      const p = new URL(u)
      const err = p.searchParams.get('error')
      const desc = p.searchParams.get('error_description')
      log(`  >>> CALLBACK PARAMS: code=${p.searchParams.get('code') ? 'PRESENT' : 'ABSENT'} error=${err ?? '(none)'} error_description=${desc ?? '(none)'} state=${p.searchParams.get('state') ?? '(none)'}`)
    } catch {}
  }
})
page.on('response', async resp => {
  const u = resp.url()
  if (u.includes('linkedin.com/oauth')) {
    log(`RESP ${resp.status()} ${resp.url().slice(0,120)}`)
    if (resp.status() >= 300) log(`  LOCATION=${resp.headers()['location'] ?? '(none)'}`)
    // If LinkedIn returns an error page (200 but error content), capture the page URL after load
  }
  if (u.includes('postify.applabx.com/api/oauth/linkedin')) {
    log(`RESP ${resp.status()} ${u.slice(0,120)}`)
    log(`  LOCATION=${resp.headers()['location'] ?? '(none)'}`)
  }
})

try {
  log('STEP 1: navigate to production login — log in manually (5 min)')
  await page.goto('https://postify.applabx.com/login', { waitUntil: 'domcontentloaded', timeout: 40000 })
  await page.waitForTimeout(2000)
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(5000)
    const url = page.url()
    if (url.includes('/compose') || url.includes('/accounts')) break
    if (i % 12 === 11) log(`  still on ${url.slice(0,100)} (${(i+1)*5}s elapsed) — waiting for manual login`)
  }
  log(`POST-LOGIN URL: ${page.url()}`)

  await page.goto('https://postify.applabx.com/accounts', { waitUntil: 'domcontentloaded', timeout: 40000 })
  await page.waitForTimeout(3000)
  const clickResult = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')]
    for (const b of buttons) {
      if (!b.innerText.includes('Connect')) continue
      let el = b
      for (let d = 0; el && d < 12; d++, el = el.parentElement) {
        const t = el.innerText || ''
        if (t.includes('LinkedIn') && t.includes('Connect') && el.children.length < 40) { b.click(); return 'clicked' }
      }
    }
    return 'NOT FOUND'
  })
  log(`STEP 2: connect click -> ${clickResult}`)
  await page.waitForTimeout(8000)
  log(`AFTER CLICK URL: ${page.url().slice(0,160)}`)

  if (page.url().includes('linkedin.com')) {
    log('STEP 3: ON LINKEDIN — waiting for you to complete the LinkedIn flow (5 min)')
    // Capture the LinkedIn page identity (consent form vs error page)
    const title = await page.title().catch(() => 'n/a')
    const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 300).replace(/\n/g, ' | ')).catch(() => 'n/a')
    log(`  LINKEDIN PAGE TITLE: ${title}`)
    log(`  LINKEDIN PAGE TEXT: ${bodySnippet}`)
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(5000)
      const u = page.url()
      if (u.includes('postify.applabx.com')) break
      if (i % 6 === 5) log(`  still on ${u.slice(0,120)} (${(i+1)*5}s)`)
    }
  }

  log(`FINAL URL: ${page.url().slice(0,200)}`)
  await page.waitForTimeout(4000)
  const body = await page.evaluate(() => document.body.innerText.slice(0, 300).replace(/\n/g, ' | ')).catch(() => 'n/a')
  log(`FINAL PAGE TEXT: ${body}`)
} catch (err) {
  log(`ERROR: ${err.message}`)
}
log('=== TRACE COMPLETE ===')
await browser.close()
