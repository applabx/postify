import { chromium } from 'playwright'
const browser = await chromium.launch()
const errors = []
for (const vp of [{ name: 'desktop', w: 1440, h: 900 }, { name: 'tablet', w: 768, h: 1024 }, { name: 'mobile', w: 390, h: 844 }]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } })
  page.on('console', m => { if (m.type() === 'error') errors.push(`${vp.name}: ${m.text().slice(0, 120)}`) })
  page.on('pageerror', e => errors.push(`${vp.name}: PAGEERROR ${e.message.slice(0, 120)}`))
  const resp = await page.goto('http://localhost:3011/privacy', { waitUntil: 'networkidle' })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  const h1 = await page.evaluate(() => document.querySelector('h1')?.innerText)
  const tocLinks = await page.evaluate(() => document.querySelectorAll('nav[aria-label="Table of contents"] a').length)
  const anchors = await page.evaluate(() => document.querySelectorAll('a[href^="#"]').length)
  console.log(`${vp.name}: HTTP ${resp.status()} | h1="${h1}" | TOC links=${tocLinks} | anchors=${anchors} | overflow=${overflow}`)
  // verify anchor navigation works (first TOC link jumps to section)
  await page.click('nav[aria-label="Table of contents"] a')
  await page.waitForTimeout(300)
  const hash = await page.evaluate(() => location.hash)
  console.log(`  anchor nav -> ${hash}`)
  await page.close()
}
console.log(`console/page errors: ${errors.length}`)
errors.slice(0, 5).forEach(e => console.log('  ' + e))
await browser.close()
