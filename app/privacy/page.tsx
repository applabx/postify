import type { Metadata } from 'next'

const LAST_UPDATED = '2026-08-05'

export const metadata: Metadata = {
  title: 'Privacy Policy | Postify',
  description:
    'How Postify collects, uses, and protects your data — including OAuth 2.0 authentication, encrypted token storage, platform connections (LinkedIn, Facebook, Instagram, Threads, X, Bluesky, Pinterest, Tumblr), and your deletion rights.',
  alternates: {
    canonical: '/privacy',
  },
  openGraph: {
    title: 'Privacy Policy | Postify',
    description:
      'How Postify collects, uses, and protects your data — OAuth 2.0, encrypted tokens, platform connections, and your deletion rights.',
    url: '/privacy',
    type: 'website',
    siteName: 'Postify',
  },
  twitter: {
    card: 'summary',
    title: 'Privacy Policy | Postify',
    description:
      'How Postify collects, uses, and protects your data — OAuth 2.0, encrypted tokens, platform connections, and your deletion rights.',
  },
}

const SECTIONS: Array<{ id: string; title: string }> = [
  { id: 'introduction', title: 'Introduction' },
  { id: 'information-we-collect', title: 'Information We Collect' },
  { id: 'oauth-authentication', title: 'OAuth Authentication' },
  { id: 'linkedin', title: 'LinkedIn' },
  { id: 'facebook', title: 'Facebook' },
  { id: 'instagram', title: 'Instagram' },
  { id: 'threads', title: 'Threads' },
  { id: 'twitter', title: 'X (Twitter)' },
  { id: 'bluesky', title: 'Bluesky' },
  { id: 'google', title: 'Google' },
  { id: 'content-you-create', title: 'Content You Create' },
  { id: 'scheduled-posts', title: 'Scheduled Posts' },
  { id: 'media-uploads', title: 'Media Uploads' },
  { id: 'cookies', title: 'Cookies' },
  { id: 'analytics', title: 'Analytics' },
  { id: 'security', title: 'Security' },
  { id: 'encryption', title: 'Encryption' },
  { id: 'token-storage', title: 'Token Storage' },
  { id: 'data-retention', title: 'Data Retention' },
  { id: 'deleting-your-data', title: 'Deleting Your Data' },
  { id: 'user-rights', title: 'User Rights' },
  { id: 'gdpr', title: 'GDPR' },
  { id: 'ccpa', title: 'CCPA' },
  { id: 'third-party-services', title: 'Third Party Services' },
  { id: 'childrens-privacy', title: "Children's Privacy" },
  { id: 'international-transfers', title: 'International Transfers' },
  { id: 'changes', title: 'Changes to This Policy' },
  { id: 'contact', title: 'Contact' },
]

export default function PrivacyPage() {
  return (
    <div style={s.page}>
      <article style={s.article}>
        <header style={s.header}>
          <div style={s.badge}>Privacy Policy</div>
          <h1 style={s.h1}>Postify Privacy Policy</h1>
          <p style={s.lastUpdated}>
            Last Updated: <strong>{LAST_UPDATED}</strong>
          </p>
          <p style={s.sub}>
            This policy explains how Postify (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;the
            service&rdquo;) collects, uses, and protects your information when you use our
            self-hosted social media publishing platform.
          </p>
        </header>

        <nav style={s.toc} aria-label="Table of contents">
          <h2 style={s.tocTitle}>Table of Contents</h2>
          <ol style={s.tocList}>
            {SECTIONS.map((sect) => (
              <li key={sect.id} style={s.tocItem}>
                <a href={`#${sect.id}`} style={s.tocLink}>{sect.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div style={s.body}>
          <Section id="introduction" title="Introduction">
            <p>
              Postify is a publishing tool that lets you compose content once and publish it
              across multiple social platforms. This Privacy Policy describes what data we
              handle, why we handle it, and the controls you have over it. We designed the
              service around a simple principle: <strong>we only process data that is necessary
              to perform the publishing actions you explicitly request</strong>.
            </p>
            <p>
              Postify is self-hosted software. Depending on who operates your instance, the
              operator of the instance controls how your data is stored. This policy describes
              the data handling of the software itself.
            </p>
          </Section>

          <Section id="information-we-collect" title="Information We Collect">
            <h3>Account information</h3>
            <p>
              When you create an account we collect your email address and a name you provide.
              Your password is stored only as a salted, one-way cryptographic hash — we never
              store your plain-text password.
            </p>
            <h3>Connection information</h3>
            <p>
              When you connect a social account, we store the platform&rsquo;s identifiers for
              that account (for example, your LinkedIn profile ID or your Facebook Page ID),
              the account name and avatar you have publicly configured, and an OAuth access
              token issued by that platform (see OAuth Authentication and Token Storage).
            </p>
            <h3>Content you create</h3>
            <p>
              The text, media, and scheduling information you enter into the composer is stored
              on our servers so the service can publish or schedule your posts as you
              instructed.
            </p>
            <h3>Usage data</h3>
            <p>
              We store records of publish attempts and their results (for example, which
              platform accepted or rejected a post and any error returned) so the history
              page can show you the outcome of your actions.
            </p>
          </Section>

          <Section id="oauth-authentication" title="OAuth Authentication">
            <p>
              Postify authenticates you to social platforms exclusively with the OAuth 2.0
              authorization-code flow (and AT Protocol sessions for Bluesky). This means:
            </p>
            <ul>
              <li><strong>We never ask for or receive your social media passwords.</strong> You
              authenticate directly with the platform.</li>
              <li>We only request the minimal permission scopes needed to publish the content
              you create (see the platform sections below for the exact scopes).</li>
              <li>Platforms issue Postify a time-limited access token instead of your
              credentials.</li>
              <li>You can revoke access at any time by disconnecting the account in Postify or
              by revoking the app on the platform&rsquo;s own settings page.</li>
            </ul>
          </Section>

          <Section id="linkedin" title="LinkedIn">
            <p>
              When you connect LinkedIn, Postify requests the following OAuth 2.0 scopes:
            </p>
            <ul>
              <li><strong>openid</strong> — used to authenticate you and obtain a stable
              identifier for your LinkedIn account.</li>
              <li><strong>profile</strong> — used to display your name and profile picture so
              you can identify the connected account.</li>
              <li><strong>email</strong> — used to associate the connected LinkedIn profile
              with your Postify account.</li>
              <li><strong>w_member_social</strong> — used to publish posts you create on
              LinkedIn on your behalf.</li>
            </ul>
            <p>
              LinkedIn Company Page access is handled through LinkedIn&rsquo;s Page management
              APIs. When available, Postify lists the Pages you administer so you can choose
              which Pages to connect. Publishing to a Page requires LinkedIn app review
              approval for organization scopes; until that approval is granted, only your
              personal LinkedIn profile can be connected. We never post to a Page you did not
              explicitly select, and we never publish content you did not create or schedule
              in Postify.
            </p>
          </Section>

          <Section id="facebook" title="Facebook">
            <p>
              Facebook connections use the Facebook Login and Graph API. Postify requests
              permissions to manage and publish posts to the Facebook Pages and Groups you
              administer, and to read the list of Pages and Groups available to you so you can
              choose destinations. We never post to a Page or Group you did not select, and we
              do not read your personal feed or private messages.
            </p>
          </Section>

          <Section id="instagram" title="Instagram">
            <p>
              Instagram connections are made through your linked Instagram business or creator
              account. Postify requests permission to create and publish media posts on your
              behalf. We only publish content you explicitly created in Postify, and we never
              read your private messages or direct-message history.
            </p>
          </Section>

          <Section id="threads" title="Threads">
            <p>
              Threads connections use the Threads API. Postify requests permission to publish
              text and media posts on your Threads account on your behalf. We do not read your
              feed beyond what is needed to confirm the account you connected.
            </p>
          </Section>

          <Section id="twitter" title="X (Twitter)">
            <p>
              X connections use OAuth 2.0 with PKCE. Postify requests the scopes needed to read
              your account identifier and publish tweets you create (tweet.read,
              tweet.write, users.read). We never retweet, like, follow, or interact on your
              behalf. No automated or unauthorized posting ever occurs — every tweet is
              created only from content you entered or scheduled in Postify.
            </p>
          </Section>

          <Section id="bluesky" title="Bluesky">
            <p>
              Bluesky does not use OAuth. Instead you provide your handle and an
              app-specific password that you generate inside Bluesky&rsquo;s own settings.
              Postify uses it once to create a session and stores the session tokens issued
              by the AT Protocol. Your app password itself is never stored. You can revoke
              the app password at any time from Bluesky&rsquo;s settings, which immediately
              invalidates Postify&rsquo;s access.
            </p>
          </Section>

          <Section id="google" title="Google">
            <p>
              If Google sign-in is enabled on your instance, Postify uses Google&rsquo;s OAuth
              2.0 flow to verify your identity. We receive only the profile information Google
              returns (your name and email address) and never your Google password.
            </p>
          </Section>

          <Section id="content-you-create" title="Content You Create">
            <p>
              The text, captions, links, and media you enter into Postify are stored so the
              service can deliver them to the destinations you selected. Your content is only
              sent to platforms you chose, at the time you chose (immediately or on a schedule
              you set). We never share your content with third parties, we never use it for
              advertising profiling, and we never scrape or republish it elsewhere.
            </p>
          </Section>

          <Section id="scheduled-posts" title="Scheduled Posts">
            <p>
              When you schedule a post, we store the scheduled date and time along with the
              content. A background job service holds the post and publishes it at your
              scheduled time. You can cancel a scheduled post at any time from the Queue page
              before it publishes.
            </p>
          </Section>

          <Section id="media-uploads" title="Media Uploads">
            <p>
              Images and videos you attach to posts are uploaded to the configured media
              storage service (for example, Cloudinary on the official deployment) and the
              resulting URLs are stored with your post. Media is used only to deliver your
              content to the destinations you selected.
            </p>
          </Section>

          <Section id="cookies" title="Cookies">
            <p>
              Postify uses essential cookies for authentication and security:
            </p>
            <ul>
              <li>A session cookie that keeps you signed in.</li>
              <li>A CSRF protection cookie that prevents cross-site request forgery.</li>
              <li>Short-lived cookies that protect OAuth login flows against request
              forgery.</li>
            </ul>
            <p>
              These cookies are strictly necessary for the service to function. We do not use
              advertising or tracking cookies, and we do not sell any data obtained through
              cookies.
            </p>
          </Section>

          <Section id="analytics" title="Analytics">
            <p>
              Postify provides analytics about your own publishing activity (posts sent,
              destinations reached, success rates). These analytics are computed from your own
              data and are visible only to you. We do not perform advertising profiling, we
              do not build behavioral profiles, and we do not share analytics with third
              parties.
            </p>
          </Section>

          <Section id="security" title="Security">
            <p>
              We apply security best practices throughout the service:
            </p>
            <ul>
              <li>All traffic is served over HTTPS (encrypted in transit).</li>
              <li>Passwords are hashed with a strong, salted one-way algorithm (bcrypt).</li>
              <li>Authentication sessions are protected with HttpOnly, SameSite cookies.</li>
              <li>Account lockout and rate limiting protect against brute-force attacks.</li>
              <li>CSRF protection is enforced on state-changing requests.</li>
              <li>OAuth state parameters are validated on every callback to prevent request
              forgery.</li>
            </ul>
          </Section>

          <Section id="encryption" title="Encryption">
            <p>
              All data is encrypted in transit using TLS/HTTPS. Sensitive credentials — the
              OAuth access tokens described in Token Storage — are additionally encrypted at
              rest using AES-256-GCM with a server-side key. Encryption keys are managed by
              the operator of your Postify instance and are never exposed to your browser.
            </p>
          </Section>

          <Section id="token-storage" title="Token Storage">
            <p>
              OAuth access tokens and refresh tokens issued by social platforms are encrypted
              at rest before being stored in the database. They are decrypted only in server
              memory, at the moment a publishing or account-listing request needs them, and
              are never sent to your browser. Tokens expire according to each platform&rsquo;s
              rules; expired tokens are surfaced to you as &ldquo;reconnect&rdquo; prompts so
              you remain in control of your connections.
            </p>
          </Section>

          <Section id="data-retention" title="Data Retention">
            <p>
              We retain your account, connections, posts, and publish history for as long as
              your account is active, because this data is required for the service to
              function and for you to review your publishing history. Scheduled jobs and
              temporary OAuth state are retained only as long as needed (scheduled posts are
              removed after they run; OAuth state expires within minutes). See Deleting Your
              Data for how to remove everything.
            </p>
          </Section>

          <Section id="deleting-your-data" title="Deleting Your Data">
            <h3>Disconnect a platform</h3>
            <p>
              Go to the Accounts page and click the disconnect icon next to any connected
              account. Postify immediately removes the connection — including the stored
              tokens — so the platform can no longer be targeted. You can also revoke the
              app from the platform&rsquo;s own settings, which invalidates the tokens on the
              platform side.
            </p>
            <h3>Request full account deletion</h3>
            <p>
              To delete your account and all associated data — connections, tokens, posts,
              scheduled jobs, and publish history — contact the operator of your Postify
              instance (see Contact). On request, the operator removes your account and all
              related records from the database. Platform tokens are invalidated
              immediately on removal.
            </p>
          </Section>

          <Section id="user-rights" title="User Rights">
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul>
              <li>Access the personal data we hold about you.</li>
              <li>Correct inaccurate data.</li>
              <li>Delete your data (see Deleting Your Data).</li>
              <li>Restrict or object to processing.</li>
              <li>Data portability.</li>
              <li>Withdraw consent at any time — for example by disconnecting a platform.</li>
            </ul>
            <p>
              To exercise any of these rights, contact the operator of your instance. We
              respond to verified requests without undue delay and within the timeframes
              required by applicable law.
            </p>
          </Section>

          <Section id="gdpr" title="GDPR">
            <p>
              If you are located in the European Economic Area, the United Kingdom, or
              Switzerland, the General Data Protection Regulation (GDPR) applies to our
              processing of your personal data.
            </p>
            <ul>
              <li><strong>Legal basis:</strong> we process your data to perform the service
              you asked us to provide (Article 6(1)(b)) and, where applicable, on the basis
              of your consent (Article 6(1)(a)) — for example, when you connect a social
              account.</li>
              <li><strong>Your rights</strong> under the GDPR are listed in User Rights,
              including erasure (&ldquo;right to be forgotten&rdquo;) and data portability.</li>
              <li><strong>Data transfers:</strong> see International Transfers.</li>
              <li><strong>Supervisory authority:</strong> you have the right to lodge a
              complaint with your local data protection authority.</li>
            </ul>
          </Section>

          <Section id="ccpa" title="CCPA">
            <p>
              If you are a California resident, the California Consumer Privacy Act (CCPA /
              CPRA) applies to our processing of your personal information.
            </p>
            <ul>
              <li><strong>No sale:</strong> we do not sell your personal information, and we
              have not sold personal information in the preceding 12 months.</li>
              <li><strong>No sharing for cross-context advertising:</strong> we do not share
              personal information for advertising profiling.</li>
              <li><strong>Your rights</strong> include the right to know what personal
              information we collect, the right to delete it, the right to correct it, and
              the right to non-discrimination for exercising these rights.</li>
              <li>To exercise these rights, contact the operator of your instance (see
              Contact).</li>
            </ul>
          </Section>

          <Section id="third-party-services" title="Third Party Services">
            <p>
              Postify communicates with the social platforms you connect (LinkedIn, Facebook,
              Instagram, Threads, X, Bluesky, Pinterest, Tumblr) and, on the official
              deployment, with the configured media storage provider. Each platform&rsquo;s
              privacy policy governs their handling of data they receive from you. Postify
              has no advertising partners and does not share your data with any third party
              for advertising purposes.
            </p>
          </Section>

          <Section id="childrens-privacy" title="Children's Privacy">
            <p>
              Postify is not directed to children under 13 years of age, and we do not
              knowingly collect personal information from children. If you believe a child
              has provided us personal information, contact the operator of your instance so
              we can delete it.
            </p>
          </Section>

          <Section id="international-transfers" title="International Transfers">
            <p>
              Postify is self-hosted; data is stored on the servers operated by your instance
              operator. If you connect a social account, the platforms you use may transfer
              data across borders in accordance with their own policies. By using the
              service you understand that your data may be processed in the locations where
              your instance operator and the connected platforms operate.
            </p>
          </Section>

          <Section id="changes" title="Changes to This Policy">
            <p>
              We may update this policy from time to time. When we do, the
              &ldquo;Last Updated&rdquo; date at the top of this page will be revised, and
              the updated policy applies from that date. If changes are material, the
              operator of your instance will make the updated policy available on this page.
            </p>
          </Section>

          <Section id="contact" title="Contact">
            <p>
              If you have questions about this policy, want to exercise your rights, or want
              to request deletion of your data, contact the operator of your Postify
              instance. For the official deployment, contact the application owner through
              the account management interface. Include your account email address so we can
              verify your request.
            </p>
          </Section>
        </div>
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'Postify Privacy Policy',
            description: metadata.description,
            url: 'https://postify.applabx.com/privacy',
            dateModified: LAST_UPDATED,
            about: {
              '@type': 'Organization',
              name: 'Postify',
            },
          }),
        }}
      />
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={s.section}>
      <h2 style={s.sectionTitle}>{title}</h2>
      <div style={s.sectionBody}>{children}</div>
    </section>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '32px 20px', minHeight: '100vh', background: '#f5f5f8' },
  article: { maxWidth: 760, margin: '0 auto', background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '36px 40px' },
  header: { borderBottom: '1px solid rgba(0,0,0,0.08)', paddingBottom: 24, marginBottom: 24 },
  badge: { display: 'inline-block', fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#7c6eff', background: 'rgba(124,110,255,0.08)', padding: '4px 10px', borderRadius: 6, marginBottom: 12 },
  h1: { fontSize: 28, fontWeight: 700, color: '#1a1a2e', margin: '0 0 10px', letterSpacing: '-0.5px' },
  lastUpdated: { fontSize: 13, color: '#555570', margin: '0 0 12px' },
  sub: { fontSize: 14, color: '#555570', lineHeight: 1.7, margin: 0 },
  toc: { background: '#f7f7fa', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 10, padding: '18px 22px', marginBottom: 28 },
  tocTitle: { fontSize: 13, fontWeight: 600, color: '#1a1a2e', margin: '0 0 10px' },
  tocList: { margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 },
  tocItem: { fontSize: 13 },
  tocLink: { color: '#7c6eff', textDecoration: 'none' },
  body: { display: 'flex', flexDirection: 'column', gap: 26 },
  section: { scrollMarginTop: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 600, color: '#1a1a2e', margin: '0 0 10px' },
  sectionBody: { fontSize: 14, color: '#44445a', lineHeight: 1.75 },
}
