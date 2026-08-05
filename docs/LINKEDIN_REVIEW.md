# LinkedIn API Review — Reviewer Account Guide

This document explains how to use the Postify **reviewer account** for external
API reviews (LinkedIn Community Management API review, Meta, Google, X, etc.).

## What the reviewer account is

The reviewer account is a dedicated, pre-seeded account that lets an external
reviewer explore Postify safely without touching production data. It is:

- A normal, fully functional user account (login, connect, compose, schedule,
  publish test posts, analytics, history).
- Clearly marked as a **REVIEWER** role in the UI with a persistent banner:
  **"LinkedIn API Review Account — This workspace contains demonstration data only."**
- Pre-populated with a demo workspace containing sample posts, schedules,
  publish history, analytics data, and media.
- Locked out of anything destructive or administrative: the reviewer account
  can never use the password-reset flow, cannot manage other users, and has no
  access to admin surfaces (none exist in the product).

## Creating the account

```bash
npm run seed:reviewer
```

The command:

1. Creates (or updates) the account
   `linkedin-review@postify.applabx.com` with role `REVIEWER`.
2. Generates a **strong random password** automatically (24 chars, URL-safe).
3. Prints the password to the console **once** — copy it immediately.
4. Is **idempotent**: re-running it never creates duplicates; it only rotates
   the password and refreshes the demo data.

> Re-run `npm run seed:reviewer` any time a new password is needed. The old
> password stops working immediately because the hash is replaced.

## Reviewer login

1. Open the Postify login page.
2. Email: `linkedin-review@postify.applabx.com`
3. Password: the one printed by the seed command.
4. You land on the composer. The purple banner confirms the reviewer account.

## The demo workspace — "LinkedIn API Review"

The seed populates the workspace with realistic data:

| Area | Content |
|---|---|
| Publishing history | Marketing announcement, product launch, hiring post, blog article — with SUCCESS, PARTIAL, and FAILED per-destination outcomes |
| Scheduled queue | Two illustrative scheduled posts (never fire — schedules are in the past; cancel them freely) |
| Media | Sample images attached to several posts |
| Connected accounts | Two clearly-marked demo accounts (LinkedIn Demo Profile, Demo Company (X)) with non-functional demo tokens — disconnect them at any time |

Analytics on the Analytics page are computed from this history, so charts and
platform breakdowns are populated out of the box.

## Features available to the reviewer

- Login / logout
- Connect social accounts (OAuth 2.0)
- Create drafts and posts
- Schedule posts
- Publish test posts
- View analytics
- View publishing history
- Disconnect accounts
- Cancel scheduled posts

## How reviewers test LinkedIn

1. **OAuth login**: connect the real LinkedIn account under review
   (Accounts → LinkedIn → Connect). Reviewers must approve the LinkedIn
   authorization screen.
2. **Posting**: compose a post, select the LinkedIn destination, publish.
3. **Scheduling**: create a post, choose a future time, publish as scheduled.
4. **Review outcomes**: open History to see per-destination results, and
   Analytics for aggregate stats.
5. **Disconnect**: Accounts → disconnect the LinkedIn account to confirm
   tokens are removed.

### LinkedIn scope note (important for reviewers)

The production LinkedIn app is authorized **only** for the OIDC scopes
(`openid profile email`) plus `w_member_social` (Share on LinkedIn).
Organization scopes (`r_organization_admin`, `w_organization_social`) are
**not** authorized on the app — requesting them makes LinkedIn reject the
authorization request. Until those scopes are approved, reviewers can connect
their **personal** LinkedIn profile and publish to it. Company Page publishing
becomes available only after LinkedIn grants the org scopes.

## Security properties

- The reviewer account can never reset its own password (server-enforced;
  both forgot-password and reset-password routes block reviewer accounts).
- Demo accounts carry inert tokens that cannot publish real content.
- The reviewer role has no access to secrets, admin APIs, or other users'
  data — every API request is scoped to the authenticated user.
- `REVIEWER_MODE` is not required for these protections; the role is enforced
  independently of the environment flag (the flag documents the intended
  usage for deployments that provision reviewer accounts).

## Environment

The reviewer feature is controlled by `REVIEWER_MODE=true` in the deployment
environment. When enabled, the seed command and reviewer provisioning are the
intended workflow. The runtime protections (role checks, reset blocking) apply
regardless, so a reviewer account is always safe.

## Troubleshooting

| Symptom | Action |
|---|---|
| Login rejected | Re-run `npm run seed:reviewer`; the previous password was rotated. |
| "Too many login attempts" | Wait 15 minutes (or restart the app) — cold-start rate limiting. |
| LinkedIn says "Bummer" on connect | Scope configuration mismatch. Only `openid profile email w_member_social` may be requested; verify with the checklist doc. |
| Demo data missing | Re-run the seed; it is idempotent and restores missing fixtures. |
