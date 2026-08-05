import type { Session } from 'next-auth'

export type UserRole = 'USER' | 'REVIEWER' | 'ADMIN'

export const REVIEWER_ROLE: UserRole = 'REVIEWER'

export function roleOf(session: Session | null): UserRole | null {
  const role = session?.user?.role
  return role === 'USER' || role === 'REVIEWER' || role === 'ADMIN' ? role : null
}

export function isReviewer(session: Session | null): boolean {
  return roleOf(session) === REVIEWER_ROLE
}

export function isAdmin(session: Session | null): boolean {
  return roleOf(session) === 'ADMIN'
}

// Reviewer accounts may never use the password-reset flow: their password is
// managed exclusively by `npm run seed:reviewer` (regenerated on demand).
export function isReviewerEmail(email: string): boolean {
  return email.toLowerCase() === 'linkedin-review@postify.applabx.com'
}

// Pure decision helper used by the forgot-password and reset-password routes
// (and unit-tested directly so the guard cannot regress).
export function reviewerResetBlocked(user: { role?: string | null; email: string } | null): boolean {
  if (!user) return false
  return user.role === 'REVIEWER' || isReviewerEmail(user.email)
}

