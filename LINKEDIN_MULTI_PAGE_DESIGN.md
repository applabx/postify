# LinkedIn Multi-Page Publishing — Design Document

**Date:** 2026-06-13
**Author:** Mavis (Senior Engineer Review)
**Scope:** Analyze existing architecture; confirm multi-page capability; document gaps

---

## Executive Summary

The codebase **already supports publishing one post to multiple LinkedIn company pages in a single click**. Every layer — storage, OAuth, API, compose UI, and publisher — has the infrastructure in place. No database changes, no API changes, and no publisher changes are required.

The only remaining work is UX polish: exposing a "Publish to all LinkedIn pages" convenience shortcut in the compose UI, and verifying the OAuth reconnect flow handles page re-authorization correctly.

---

## 1. How LinkedIn Pages Are Currently Stored

Each LinkedIn company page a user connects is stored as **one `SocialAccount` row** (`prisma/schema.prisma:25-54`).

```
SocialAccount (one row per page)
  platform      = LINKEDIN
  accountType   = PAGE
  externalId    = LinkedIn organization numeric ID  (e.g. "12345678")
  pageId        = Full organization URN              (e.g. "urn:li:organization:12345678")
  accessToken   = User's personal access token (encrypted) — shared across all pages
  refreshToken  = null (LinkedIn OAuth tokens are long-lived)
  tokenExpiry   = Token expiration timestamp
  name          = Page display name
  handle        = Page vanity name (e.g. "mycompany")
  avatarUrl     = Page logo URL
  isActive      = true
```

**Key design decision:** `accessToken` is stored once per user session (not per-page). LinkedIn's `r_organization_admin` scope means the same personal token grants write access to every organization where the user has admin rights. The `pageId` field carries the organization URN needed to target the correct page at publish time.

The uniqueness constraint is `@@unique([userId, platform, externalId])` — meaning the same LinkedIn organization can only be stored once per user.

---

## 2. How Page Selection Currently Works

### Connect Flow (OAuth → Save)

1. User clicks "Connect LinkedIn" → `getLinkedInAuthUrl()` (`lib/oauth/linkedin.ts:7`) requests scopes: `openid profile email r_organization_admin w_organization_social`
2. LinkedIn returns auth code → `GET /api/oauth/linkedin/callback` (`app/api/oauth/linkedin/callback/route.ts:28`)
3. Callback calls `getLinkedInAdminPages(accessToken)` (`lib/oauth/linkedin.ts:82`) — fetches **all** organizations where user has ADMINISTRATOR role via `/organizationAcls`
4. If pages found: redirects to `/accounts/connect/linkedin?data=...` (page picker UI)
5. Page picker (`app/accounts/connect/linkedin/page.tsx:58`) pre-selects **all pages by default**, sends selected IDs + full page list to `POST /api/oauth/linkedin/save`
6. Save route (`app/api/oauth/linkedin/save/route.ts:55`) **upserts one `SocialAccount` per selected page** — all with the same `accessToken`, each with its own `pageId`

### Compose Flow (Selection → Publish)

1. `/api/accounts` (`app/api/accounts/route.ts`) returns all `SocialAccount` rows grouped by platform
2. Compose page (`app/compose/page.tsx:76`) groups accounts by platform; LinkedIn shows as an expandable section
3. `toggleAccount()` (`app/compose/page.tsx:116`) and `togglePlatformAll()` (`app/compose/page.tsx:124`) select/deselect individual accounts or all on a platform
4. Publish click → `POST /api/posts` (`app/api/posts/route.ts`) with `targetAccountIds: [id1, id2, ...]`
5. Post creation creates **one `PostTarget` row per selected account** (`app/api/posts/route.ts:66`)

---

## 3. What Changes Are Needed to Support Multi-Page

**Answer: None required. The infrastructure is already in place.**

Every layer already handles the multi-page case:

| Layer | File | Multi-page support |
|---|---|---|
| Storage | `prisma/schema.prisma:25-54` | ✅ One `SocialAccount` per page |
| OAuth connect | `app/api/oauth/linkedin/callback/route.ts` | ✅ Fetches all pages; redirects to picker |
| OAuth save | `app/api/oauth/linkedin/save/route.ts:55` | ✅ Upserts all selected pages |
| Page picker UI | `app/accounts/connect/linkedin/page.tsx` | ✅ Pre-selects all by default |
| Accounts API | `app/api/accounts/route.ts` | ✅ Returns all accounts grouped |
| Compose UI | `app/compose/page.tsx:116-131` | ✅ `togglePlatformAll()` selects all on platform |
| Post creation | `app/api/posts/route.ts:66` | ✅ Creates one `PostTarget` per account |
| Publisher | `lib/publisher.ts:106` | ✅ Passes `pageId` as `organizationUrn` |

### The Publishing Loop (Already Parallel)

```typescript
// lib/publisher.ts:43-45
const results = await Promise.allSettled(
  post.targets.map((target) => publishToTarget(post.text, post.mediaUrls, target))
)
```

Each `publishToTarget` for LinkedIn calls:
```typescript
// lib/publisher.ts:106-109
return postToLinkedIn({
  accessToken: decryptSecret(acc.accessToken),
  organizationUrn: acc.pageId!, // urn:li:organization:XXXXX
  text,
})
```

`postToLinkedIn` (`lib/oauth/linkedin.ts:121`) posts to the specified organization URN. All pages are processed in parallel with individual success/failure tracking via `PostTarget.status`.

---

## 4. Database Changes Required

**None.** The schema already supports multi-page:

- `SocialAccount` can hold as many LinkedIn pages as the user has connected
- `PostTarget` creates one row per destination — no limit
- `@@unique([userId, platform, externalId])` prevents duplicate connections of the same page
- `status PARTIAL` (`prisma/schema.prisma:100`) handles the case where some pages succeed and some fail

If in the future you want per-page tokens (LinkedIn's Page access tokens), the schema already has `pageToken String?` on `SocialAccount` for that — not needed for MVP.

---

## 5. API Changes Required

**None for core functionality.**

Current `POST /api/posts` already accepts an array of `targetAccountIds` of any length and creates the correct number of `PostTarget` rows.

Optional enhancements (not required for MVP):

| Enhancement | Route | Description |
|---|---|---|
| LinkedIn-specific batch preview | `GET /api/accounts` | Return per-page post preview count |
| Bulk reconnect | `POST /api/oauth/linkedin/refresh` | Re-authorize all pages if token expires |

---

## 6. UI Changes Required

**None for core functionality.** The compose page already:

- Groups LinkedIn accounts under one expandable section
- Shows `N/M selected` count per platform (line 369-370)
- The publish button shows `Publish Now → N accounts` (line 314)
- "Select all" per platform via `togglePlatformAll()` (line 124)

**Optional UX improvements** (recommended, not required):

| Improvement | File | Description |
|---|---|---|
| LinkedIn "Select all pages" shortcut chip | `app/compose/page.tsx` | Add a "Post to all LinkedIn pages" chip in the account selector, shown only when `platform === 'LINKEDIN'` and more than 1 LinkedIn page is connected |
| Per-platform selection summary | `app/compose/page.tsx:369` | Already shows `N/M selected` — no change needed |
| Distinct LinkedIn page avatars | `app/compose/page.tsx:403` | Already shows page logos when available — no change needed |
| Page-level publish status in history | `app/history/page.tsx` | Show per-page SUCCESS/FAILED status in the post history table |

---

## 7. Backward Compatibility Concerns

**None.** This is an additive feature — no existing behavior changes.

- Existing single-LinkedIn-page users: unchanged
- Existing multi-platform posts (LinkedIn + Facebook + Twitter): unchanged
- Existing scheduled posts with multiple targets: unchanged (BullMQ scheduler already processes all `PostTarget` rows)
- Token refresh: LinkedIn tokens are long-lived (60 days); the `refreshToken` field is `null` but LinkedIn supports token refresh via their API without page-level re-authorization

**Reconnect flow note:** If a user connects LinkedIn again (e.g., after token expiry), the `upsert` will update the existing `SocialAccount` rows for pages that are still selected. Pages the user deselects on reconnect will remain in the DB as `isActive: true` rows unless explicitly deleted. This is a minor data staleness issue — consider adding logic to set `isActive: false` for pages that were previously connected but are no longer returned by `getLinkedInAdminPages`.

---

## 8. Implementation Verification Checklist

Run through this to confirm everything is wired:

- [ ] Connect LinkedIn → connect 2+ company pages → verify 2+ `SocialAccount` rows with `platform = LINKEDIN`, `accountType = PAGE`, distinct `externalId` and `pageId`
- [ ] Go to `/compose` → verify LinkedIn section shows all connected pages
- [ ] Write a post → select all LinkedIn pages → click "Publish Now → 2 accounts"
- [ ] Verify `PostTarget` rows created — one per page
- [ ] Verify `PARTIAL` status if one fails, `PUBLISHED` if all succeed
- [ ] Check `/history` — verify per-page status shown correctly
- [ ] Verify each page received the post by checking LinkedIn directly

---

## 9. Architecture Diagram

```
User connects LinkedIn
        │
        ▼
LinkedIn OAuth ──► getLinkedInAdminPages()
                        │
                   ┌────┴────────────────┐
                   │ User picks pages     │
                   │ (page picker UI)    │
                   └────┬────────────────┘
                        │
                   POST /api/oauth/linkedin/save
                        │
              ┌─────────▼──────────┐
              │ SocialAccount (row per page) │
              │ pageId = urn:li:org:X
              │ accessToken = user's token   │
              └─────────────────────┘

Compose → Publish
        │
   POST /api/posts { targetAccountIds: [id1, id2, ...] }
        │
   Prisma: Post + PostTarget (row per selected account)
        │
   publishPost() → Promise.allSettled(targets.map(...))
        │
   ┌────▼──────────────────────────────┐
   │ postToLinkedIn({ organizationUrn })  │  ← acc.pageId
   │  Page A: urn:li:organization:11111  │
   │  Page B: urn:li:organization:22222  │
   │  Page C: urn:li:organization:33333  │
   └─────────────────────────────────────┘
        │
   LinkedIn API (ugcPosts) — one call per page
```

---

## 10. Recommended Next Steps (Priority Order)

1. **Verify the connect flow end-to-end** — connect 2 LinkedIn pages and confirm 2 `SocialAccount` rows are created
2. **Test the publish loop** — post to 2 pages, confirm both receive the post
3. **Add "Post to all LinkedIn pages" chip** in compose UI (small UI touch, sets `selectedAccountIds` to all LinkedIn accounts on platform)
4. **Add per-page status to history** (`app/history/page.tsx`) — already has target data, just needs display per account
5. **Handle token expiry gracefully** — if one page's organization is removed from the user's admin list, mark that account as `isActive: false` on reconnect
