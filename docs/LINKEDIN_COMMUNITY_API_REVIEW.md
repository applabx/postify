# LinkedIn Community Management API — Postify Review Checklist

Use this checklist to certify Postify's LinkedIn integration for the LinkedIn
Community Management API review. Each item must be demonstrated live in the
reviewer account.

**Reviewer credentials:** see `docs/LINKEDIN_REVIEW.md` — create the account
with `npm run seed:reviewer` and use the printed password.

---

## Preconditions

- [ ] Reviewer account created (`npm run seed:reviewer`) and banner visible
- [ ] Production URL serving HTTPS (e.g. `https://postify.applabx.com`)
- [ ] Postify requests only authorized scopes:
      `openid profile email w_member_social`
- [ ] No other scope appears in the authorization URL

---

## Checklist

### 1. OAuth login
- [ ] Reviewer logs in to Postify with email + password
- [ ] Session persists across page reloads
- [ ] Logout works and protected pages redirect to login

### 2. Connect LinkedIn
- [ ] Accounts page shows a "Connect" action for LinkedIn
- [ ] Clicking Connect redirects to
      `https://www.linkedin.com/oauth/v2/authorization?...`
- [ ] Authorization URL contains exactly:
      `scope=openid profile email w_member_social`
- [ ] `redirect_uri=https://postify.applabx.com/api/oauth/linkedin/callback`
- [ ] A `state` parameter is present and unique per attempt
- [ ] Approving shows the Postify success flow; denying shows
      "LinkedIn connection was cancelled" with no error crash
- [ ] The connected account appears in Postify Accounts

### 3. Select Company Page (when org scopes are approved)
- [ ] If the LinkedIn app is approved for org scopes, the Page picker lists
      admin Pages with name and logo
- [ ] Selecting Pages creates one SocialAccount row per Page
- [ ] If org scopes are NOT approved, Postify shows the clear message about
      missing Page permissions (no silent failure)

### 4. Create post
- [ ] Compose a text post and select the LinkedIn destination
- [ ] Character limit for LinkedIn (3000) is displayed and enforced
- [ ] Media can be attached (images supported)

### 5. Schedule
- [ ] Choosing a future date/time schedules the post
- [ ] Post appears in the Queue page with the correct time
- [ ] BullMQ job exists with deterministic id `post:{postId}`
- [ ] Cancelling from the Queue removes the post and its job

### 6. Publish
- [ ] Immediate publish reaches LinkedIn exactly once
- [ ] PostTarget transitions to SUCCESS and stores the LinkedIn post ID
      (e.g. `urn:li:share:...`)
- [ ] Post status becomes PUBLISHED
- [ ] Verify the post exists on LinkedIn (open the external platform)
- [ ] A failed destination does not mark successful destinations as failed

### 7. Analytics
- [ ] Analytics page shows post counts, per-platform breakdown, and history
- [ ] A newly published post appears in recent activity

### 8. Disconnect
- [ ] Disconnect removes the LinkedIn account and its stored tokens
- [ ] The account no longer appears as a destination in Compose
- [ ] Reconnecting performs the full OAuth flow again

---

## Security / compliance observations for reviewers

- [ ] Postify never asks for or stores social media passwords (OAuth 2.0 only)
- [ ] Access tokens are encrypted at rest (AES-256-GCM)
- [ ] All traffic is HTTPS
- [ ] OAuth `state` is validated on callback (mismatch → clear error)
- [ ] No automated or unauthorized posting: posts are published only on
      explicit user action or an explicit user-created schedule
- [ ] Only the minimum scopes are requested
- [ ] Users can delete all connected data at any time
- [ ] No selling, advertising profiling, or scraping of user data
      (see the public Privacy Policy at `/privacy`)

---

## Evidence to attach

- [ ] Screenshot of the LinkedIn authorization URL with scope parameter
- [ ] Screenshot of the connected account in Postify
- [ ] Screenshot of a published post + LinkedIn post ID
- [ ] Screenshot of the Analytics page
- [ ] Screenshot of the Queue page with a scheduled post
- [ ] Server log line `[OAUTH_START] ... scopes=openid profile email w_member_social`
