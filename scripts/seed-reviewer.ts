#!/usr/bin/env tsx
import { seedReviewerAccount, REVIEWER_EMAIL, REVIEWER_WORKSPACE } from '../lib/reviewer-seed'
import { prisma } from '../lib/prisma'

async function main() {
  console.log('Seeding LinkedIn API Review account...')
  const result = await seedReviewerAccount()
  console.log('')
  console.log('==============================================')
  console.log('  LinkedIn API Review Account')
  console.log('==============================================')
  console.log(`  Email:    ${result.email}`)
  console.log(`  Password: ${result.password}`)
  console.log('  Role:     REVIEWER')
  console.log(`  Workspace: ${REVIEWER_WORKSPACE}`)
  console.log('==============================================')
  console.log(`  Demo posts created:      ${result.demoPosts}`)
  console.log(`  Demo accounts created:   ${result.demoAccounts}`)
  console.log('')
  console.log('  NOTE: this password is shown only once. Re-run this')
  console.log('  command to generate a new password at any time.')
  console.log('==============================================')
  console.log(`Email used: ${REVIEWER_EMAIL}`)
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
