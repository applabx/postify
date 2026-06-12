# Postify — Self-Hosted Social Media Publisher

Publish to **8 platforms simultaneously** from one composer.  
LinkedIn Pages · Facebook Pages & Groups · Instagram · X (Twitter) · Threads · Bluesky · Pinterest · Tumblr

---

## Architecture

| Layer | Tech | Notes |
|---|---|---|
| Frontend + API | Next.js 14 (App Router) | Server components + API routes |
| Database | PostgreSQL | Supabase free tier works great |
| ORM | Prisma 5 | Schema at `prisma/schema.prisma` |
| Job Queue | BullMQ + Redis | Scheduled post delivery |
| Auth | NextAuth.js v4 | Google OAuth + credential login |
| Media | Cloudinary | Free tier: 25GB storage |
| Hosting | DigitalOcean | Any $6/mo droplet works |

---

## Quick Start (Local Dev)

### 1. Clone and install

```bash
git clone <your-repo> postify
cd postify
npm install
```

### 2. Start Postgres + Redis

```bash
# Uses docker-compose.yml included in project
docker compose up -d db redis
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — at minimum fill in:
```
DATABASE_URL=postgresql://postify:postify_dev@localhost:5432/postify
REDIS_URL=redis://localhost:6379
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
```

### 4. Set up database

```bash
npx prisma generate    # generate client
npx prisma db push     # create tables
npm run db:seed        # create dev user (optional)
```

### 5. Run

```bash
npm run dev
# → http://localhost:3000
```

---

## Platform Setup (Required Before Connecting Accounts)

### LinkedIn

1. Go to [developer.linkedin.com/apps](https://developer.linkedin.com/apps) → **Create app**
2. Associate with your LinkedIn company page
3. Add products: **Share on LinkedIn** + **Sign In with LinkedIn using OpenID Connect**
4. Under **Auth**, add redirect URL: `https://yourdomain.com/api/oauth/linkedin/callback`
5. Copy **Client ID** and **Client Secret** → `.env`

Required scopes: `openid profile email r_organization_social w_organization_social rw_organization_admin`

**How LinkedIn page selection works:**  
After you OAuth, the app calls `/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR` which returns every page you admin — not hardcoded, fully dynamic. You pick which ones to connect via a checkbox UI.

---

### Facebook / Instagram / Threads  
*(One Meta app covers all three)*

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create app** → **Business**
2. Add these products: **Facebook Login**, **Instagram Graph API**, **Threads API**
3. Under Facebook Login → Settings, add Valid OAuth Redirect URI:  
   `https://yourdomain.com/api/oauth/meta/callback`
4. Copy **App ID** and **App Secret** → `.env` as `META_CLIENT_ID` / `META_CLIENT_SECRET`
5. Submit for **App Review** with these permissions:
   - `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`
   - `groups_access_member_info`, `publish_to_groups`
   - `instagram_basic`, `instagram_content_publish`
   - `threads_basic`, `threads_content_publish`

> ⚠️ **App Review takes 1–5 business days.** While waiting, add yourself as a test user under **Roles → Test Users** — this lets you connect your own accounts immediately without waiting for review.

**How Facebook page/group selection works:**  
After OAuth, the app fetches `/me/accounts` (all pages you admin) and `/me/groups?admin_only=true` (all groups where you're admin). You see a tabbed picker — Pages / Groups / Instagram — and select which to connect.

---

### X (Twitter)

> ⚠️ **X requires the Basic plan ($100/month)** to write tweets via API. Free tier is read-only.

1. Go to [developer.twitter.com](https://developer.twitter.com/apps) → **Create Project + App**
2. Enable **OAuth 2.0** (not 1.0a)
3. App type: **Web App**
4. Callback URI: `https://yourdomain.com/api/oauth/twitter/callback`
5. Scopes: `tweet.read tweet.write users.read offline.access`
6. Copy **Client ID** and **Client Secret** → `.env`

---

### Bluesky

No developer app needed.

Users connect via their **handle** + an **App Password**:
1. User goes to [bsky.app/settings/app-passwords](https://bsky.app/settings/app-passwords)
2. Creates an app password (looks like `xxxx-xxxx-xxxx-xxxx`)
3. Enters it in Postify's connect form at `/accounts/connect/bluesky`

The app verifies credentials against the AT Protocol API and stores the app password. Revocable any time from Bluesky settings.

---

### Pinterest

1. Go to [developers.pinterest.com/apps](https://developers.pinterest.com/apps) → **Create app**
2. Redirect URI: `https://yourdomain.com/api/oauth/pinterest/callback`
3. Scopes: `pins:read pins:write boards:read boards:write user_accounts:read`
4. Copy **App ID** and **App Secret** → `.env`

After OAuth, the app fetches all boards under the account. User picks which board to post to.

---

### Tumblr

1. Go to [tumblr.com/oauth/apps](https://www.tumblr.com/oauth/apps) → **Register application**
2. Default callback URL: `https://yourdomain.com/api/oauth/tumblr/callback`
3. Copy **Consumer Key** and **Consumer Secret** → `.env`

Tumblr uses OAuth 1.0a. After OAuth, all blogs under the account are shown and user picks which to post to.

---

## Production Deployment on DigitalOcean

### Option A: Direct (no Docker)

```bash
# On your droplet
sudo apt update && sudo apt install -y nodejs npm redis-server nginx certbot python3-certbot-nginx

# Install PM2
npm install -g pm2

# Clone project
git clone <your-repo> /var/www/postify
cd /var/www/postify

# Set up env
cp .env.example .env
nano .env  # fill in all production values

# Install, build, run
npm ci
npx prisma generate
npx prisma db push
npm run build
pm2 start ecosystem.config.js
pm2 save && pm2 startup

# Set up Nginx
sudo cp nginx.conf.example /etc/nginx/sites-available/postify
sudo nano /etc/nginx/sites-available/postify  # replace yourdomain.com
sudo ln -s /etc/nginx/sites-available/postify /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL
sudo certbot --nginx -d yourdomain.com
```

### Option B: Docker Compose

```bash
# Copy to server
scp -r . root@your-droplet:/var/www/postify

# SSH in
ssh root@your-droplet
cd /var/www/postify
cp .env.example .env && nano .env

# Build + run
docker compose --profile app up -d
```

### Deploying Updates

```bash
chmod +x deploy.sh
./deploy.sh  # pulls, builds, restarts with zero downtime
```

---

## Environment Variables Reference

| Variable | Required | Where to get it |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase → Settings → Database → Connection string |
| `NEXTAUTH_URL` | ✅ | Your production URL e.g. `https://postify.yourdomain.com` |
| `NEXTAUTH_SECRET` | ✅ | Run: `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | For Google login | console.cloud.google.com → OAuth 2.0 credentials |
| `GOOGLE_CLIENT_SECRET` | For Google login | Same as above |
| `LINKEDIN_CLIENT_ID` | For LinkedIn | developer.linkedin.com/apps |
| `LINKEDIN_CLIENT_SECRET` | For LinkedIn | Same |
| `META_CLIENT_ID` | For FB/IG/Threads | developers.facebook.com/apps |
| `META_CLIENT_SECRET` | For FB/IG/Threads | Same |
| `TWITTER_CLIENT_ID` | For X/Twitter | developer.twitter.com (Basic plan required) |
| `TWITTER_CLIENT_SECRET` | For X/Twitter | Same |
| `PINTEREST_CLIENT_ID` | For Pinterest | developers.pinterest.com/apps |
| `PINTEREST_CLIENT_SECRET` | For Pinterest | Same |
| `TUMBLR_CONSUMER_KEY` | For Tumblr | tumblr.com/oauth/apps |
| `TUMBLR_CONSUMER_SECRET` | For Tumblr | Same |
| `REDIS_URL` | For scheduling | `redis://localhost:6379` (local) |
| `CLOUDINARY_CLOUD_NAME` | For media upload | cloudinary.com → Dashboard |
| `CLOUDINARY_API_KEY` | For media upload | Same |
| `CLOUDINARY_API_SECRET` | For media upload | Same |
| `CRON_SECRET` | For token refresh | Run: `openssl rand -hex 20` |

---

## File Structure

```
postify/
├── app/
│   ├── accounts/
│   │   ├── connect/
│   │   │   ├── linkedin/page.tsx    ← Page picker (checkboxes for all admin pages)
│   │   │   ├── meta/page.tsx        ← Tabbed: FB Pages / Groups / Instagram
│   │   │   ├── bluesky/page.tsx     ← Handle + app password form
│   │   │   ├── pinterest/page.tsx   ← Board picker
│   │   │   ├── tumblr/page.tsx      ← Blog picker
│   │   │   └── twitter/page.tsx     ← Confirmation page
│   │   └── page.tsx                 ← Manage all connected accounts
│   ├── analytics/page.tsx           ← Stats + charts + platform breakdown
│   ├── compose/page.tsx             ← Main composer (wired to real API)
│   ├── history/page.tsx             ← All posts with filter + per-target status
│   ├── queue/page.tsx               ← Scheduled posts grouped by day
│   ├── login/page.tsx               ← Google sign-in
│   └── api/
│       ├── accounts/                ← GET (list), DELETE (disconnect)
│       ├── analytics/               ← GET (stats, charts, breakdown)
│       ├── cron/refresh-tokens/     ← GET (daily token refresh)
│       ├── oauth/
│       │   ├── [platform]/start/    ← Dynamic: triggers any platform's OAuth
│       │   ├── linkedin/callback/   ← Receives code, fetches pages, redirects to picker
│       │   ├── linkedin/save/       ← Saves selected LinkedIn pages
│       │   ├── meta/callback/       ← Receives code, fetches pages+groups
│       │   ├── meta/save/           ← Saves selected FB/IG/Threads accounts
│       │   ├── twitter/callback/    ← Exchanges PKCE code, saves account
│       │   ├── pinterest/callback/  ← Exchanges code, fetches boards
│       │   ├── pinterest/save/      ← Saves selected board
│       │   ├── tumblr/callback/     ← OAuth 1.0a token exchange, fetches blogs
│       │   ├── tumblr/save/         ← Saves selected blogs
│       │   └── bluesky/connect/     ← Verifies app password, saves account
│       ├── posts/                   ← POST (publish/schedule), GET (list)
│       ├── posts/[id]/              ← GET (detail), DELETE (cancel scheduled)
│       └── upload/                  ← Server-signed Cloudinary upload
├── lib/
│   ├── oauth/
│   │   ├── linkedin.ts              ← LinkedIn API: auth, fetch pages, post
│   │   ├── meta.ts                  ← Meta API: FB pages/groups, IG, Threads
│   │   └── platforms.ts             ← Twitter, Bluesky, Pinterest, Tumblr
│   ├── publisher.ts                 ← Unified publish engine (routes to correct API)
│   ├── scheduler.ts                 ← BullMQ: schedule, cancel jobs
│   ├── token-refresh.ts             ← Auto-refresh expiring tokens (LinkedIn 60d, Meta 60d, etc.)
│   ├── rate-limit.ts                ← In-memory rate limiter
│   ├── platforms.ts                 ← Platform constants (limits, icons, colors)
│   ├── auth.ts                      ← NextAuth config
│   ├── prisma.ts                    ← DB client singleton
│   └── env.ts                       ← Startup env validation
├── prisma/
│   ├── schema.prisma                ← All models: User, SocialAccount, Post, PostTarget, ScheduledJob
│   └── seed.ts                      ← Dev user seed
├── middleware.ts                    ← Route protection (redirects to /login)
├── ecosystem.config.js              ← PM2 config for production
├── deploy.sh                        ← Zero-downtime deploy script
├── Dockerfile                       ← Container build
├── docker-compose.yml               ← Local dev: Postgres + Redis
└── nginx.conf.example               ← Nginx reverse proxy + SSL config
```

---

## How Publishing Works

```
User clicks "Publish Now"
  → POST /api/posts { text, mediaUrls, targetAccountIds }
  → Validates all targetAccountIds belong to this user
  → Creates Post record + one PostTarget per account (status: PENDING)
  → Calls publishPost(postId)
    → Loads post + all targets from DB
    → Sets post status → PUBLISHING
    → Runs Promise.allSettled() — publishes to all platforms IN PARALLEL
      → Each target routed to platform-specific function:
          LINKEDIN   → postToLinkedIn()      (UGC Posts API)
          FACEBOOK   → postToFacebookPage()  (Graph API /feed)
                     → postToFacebookGroup() (Graph API /feed)
          INSTAGRAM  → postToInstagram()     (2-step: container → publish)
          THREADS    → postToThreads()       (2-step: container → publish)
          TWITTER    → postTweet()           (v2 /tweets)
          BLUESKY    → postToBluesky()       (AT Protocol createRecord)
          PINTEREST  → postToPinterest()     (Pins API)
          TUMBLR     → postToTumblr()        (NPF posts API)
      → Each result written back to PostTarget (SUCCESS/FAILED + externalPostId or errorMessage)
    → Final post status: PUBLISHED (all ok) | PARTIAL (some failed) | FAILED (all failed)
  → Returns { status, successCount, failCount, totalTargets }
```

---

## Token Expiry Reference

| Platform | Token lifetime | Refresh strategy |
|---|---|---|
| LinkedIn | 60 days | Refresh token (90 days) |
| Facebook | 60 days (long-lived) | Re-exchange for another 60 days |
| Instagram | Same as Facebook | Same |
| Threads | Same as Facebook | Same |
| Twitter | ~2 hours (access) | Refresh token (offline.access scope) |
| Bluesky | Session-based | Re-auth with app password |
| Pinterest | 1 year | Refresh token |
| Tumblr | Never expires | OAuth 1.0a tokens are permanent |

The daily cron at `/api/cron/refresh-tokens` handles LinkedIn, Meta, Twitter, and Pinterest automatically. Set it up with:

```bash
# Add to crontab (runs at 3am Ho Chi Minh time = 8pm UTC)
0 20 * * * curl -s "https://yourdomain.com/api/cron/refresh-tokens?secret=YOUR_CRON_SECRET" >> /var/log/postify/cron.log 2>&1
```

---

## Known Limitations

| Platform | Limitation |
|---|---|
| X/Twitter | $100/mo Basic plan required for write access |
| Instagram | Business/Creator account only; at least one image required (no text-only) |
| Facebook Groups | Your Meta app must be installed in the group; requires admin approval |
| Meta App Review | Required for production use; use test accounts while pending |
| Bluesky | 300 char limit; no native video support yet |
| Pinterest | At least one image required; one board per connected account |
| Tumblr | No video upload (API limitation) |
