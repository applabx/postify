const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const baselinePath = path.join(process.cwd(), '.eslint-baseline.json')
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))

const result = spawnSync(
  process.execPath,
  ['./node_modules/eslint/bin/eslint.js', '--format', 'json', '.'],
  { encoding: 'utf8' }
)

const report = JSON.parse(result.stdout || '[]')
let warnings = 0
for (const file of report) warnings += file.warningCount || 0

if (warnings > baseline.warningCount) {
  console.error(
    `ESLint warning gate failed: ${warnings} warnings > baseline ${baseline.warningCount}.`
  )
  process.exit(1)
}

if (result.status && result.status !== 0 && result.status !== 1) {
  console.error(result.stderr || 'ESLint execution failed.')
  process.exit(result.status)
}

console.log(`ESLint warning gate passed: ${warnings}/${baseline.warningCount}`)
