import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Create a dev user (only runs in development)
  if (process.env.NODE_ENV !== 'development') {
    console.log('Skipping seed — only runs in development')
    return
  }

  const user = await prisma.user.upsert({
    where: { email: 'dev@postify.local' },
    update: {},
    create: {
      email: 'dev@postify.local',
      name: 'Dev User',
    },
  })

  console.log(`Dev user ready: ${user.email} (id: ${user.id})`)
  console.log('\nNext steps:')
  console.log('  1. Copy .env.example to .env and fill in your credentials')
  console.log('  2. Run: npx prisma db push')
  console.log('  3. Run: npm run dev')
  console.log('  4. Go to /accounts and connect your social platforms')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
