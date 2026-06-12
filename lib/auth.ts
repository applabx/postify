import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from './prisma'

const authBaseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ''
const authHost = (() => {
  try {
    return authBaseUrl ? new URL(authBaseUrl).hostname : ''
  } catch {
    return ''
  }
})()
const localRuntime =
  authBaseUrl.includes('localhost') ||
  authBaseUrl.includes('127.0.0.1') ||
  authBaseUrl.includes('0.0.0.0') ||
  authHost === 'localhost' ||
  authHost === '127.0.0.1' ||
  authHost === '0.0.0.0'
const devAuthEnabled =
  process.env.NODE_ENV !== 'production' ||
  localRuntime ||
  process.env.ENABLE_DEV_AUTH === 'true'
const usePrismaAdapter =
  !localRuntime &&
  (process.env.NODE_ENV === 'production' || process.env.AUTH_USE_PRISMA_ADAPTER === 'true')

if (process.env.NODE_ENV !== 'production' && !devAuthEnabled) {
  console.warn('[Auth] Credentials provider disabled. Set ENABLE_DEV_AUTH=true for local sign-in.')
}

export const authOptions: NextAuthOptions = {
  adapter: usePrismaAdapter ? (PrismaAdapter(prisma) as any) : undefined,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },
  providers: devAuthEnabled
    ? [
        CredentialsProvider({
          name: 'credentials',
          credentials: {
            email: { label: 'Email', type: 'email' },
            password: { label: 'Password', type: 'password' },
          },
          async authorize(credentials) {
            if (!devAuthEnabled || !credentials?.email) return null
            const fallbackUser = {
              id: `dev_${Buffer.from(credentials.email).toString('base64url').slice(0, 24)}`,
              email: credentials.email,
              name: credentials.email.split('@')[0],
            }

            // In local runtime, keep login independent of DB/Prisma health.
            if (!usePrismaAdapter) {
              return fallbackUser
            }

            try {
              const user = await prisma.user.upsert({
                where: { email: credentials.email },
                update: {},
                create: { email: credentials.email, name: credentials.email.split('@')[0] },
              })
              return { id: user.id, email: user.email, name: user.name }
            } catch (err: any) {
              if (process.env.NODE_ENV !== 'production' || localRuntime) {
                console.warn('[Auth] Dev credentials fallback (DB unavailable):', err?.message || err)
                return fallbackUser
              }
              return null
            }
          },
        }),
      ]
    : [],
  callbacks: {
    async jwt({ token, user }: { token: any; user?: any }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }: { session: any; token: any }) {
      if (token && session.user) session.user.id = token.id as string
      return session
    },
  },
}
