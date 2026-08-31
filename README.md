# TEKZARO — Independent Technology News

Pakistan-first technology journalism with global coverage, built on Next.js (App
Router) + TypeScript + Prisma/PostgreSQL + Tailwind CSS v4.

## What's built

**Phase 1 + 2 — public site**, real-data-backed, not hardcoded:

- Homepage: breaking-news ticker, editorial hero, a prominent **Pakistan Tech**
  section, Latest, Trending (with a "Trending in Pakistan" module), and a section
  per category.
- All 11 categories (AI, Smartphones, Computing, Gadgets, Cybersecurity, Software,
  Gaming, Startups, Space, Enterprise, **Pakistan Tech**), each with a real
  category page, pagination, in-category trending, and its own `/rss.xml`.
- Article pages with full metadata (published/updated distinction, reading time,
  tags, sources, related articles, prev/next, share links), a real Postgres
  full-text search page, author profiles, and an honest view-count-driven
  trending signal (no fabricated numbers anywhere).
- SEO: per-page metadata, Open Graph, Twitter cards, JSON-LD (NewsArticle,
  Organization, WebSite, BreadcrumbList), `/sitemap.xml`, `/robots.txt`,
  site-wide and per-category RSS.
- An original, license-clean generated-SVG placeholder-art system standing in
  for licensed photography until a real image library is connected.
- ~39 demo articles across every category, all flagged `isDemo` and shown with
  a visible "Demo" badge — illustrative only, never presented as real news.

**Phase 3 — authenticated newsroom CMS** at `/admin`:

- Custom session-cookie authentication (bcrypt + HMAC-hashed DB-backed
  sessions), brute-force lockout, role-based access control (ADMIN / EDITOR /
  REPORTER / RESEARCHER) enforced server-side in every Server Action, not just
  hidden in the UI.
- A database-backed block editor (title/slug/dek/body/category/author/tags/
  location/Pakistan-impact/image/SEO fields), slug auto-generation with
  guaranteed uniqueness, and a 7-point publication checklist enforced
  identically client-side (live) and server-side (authoritative).
- A full editorial workflow: `DRAFT → IN_REVIEW → CHANGES_REQUESTED/APPROVED →
  SCHEDULED/PUBLISHED → ARCHIVED`, with every transition audit-logged and
  version-snapshotted. REPORTER/RESEARCHER may edit only their own article,
  and only while it's `DRAFT`/`CHANGES_REQUESTED` — enforced server-side.
- Article version history with restore. Forced password change on first
  login for any bootstrapped/admin-reset account (never a durable shared
  credential).

**Phase 4 — News Discovery, source ingestion & editorial verification**:

- SSRF-hardened RSS/Atom ingestion (`lib/security/safe-fetch.ts`, `ip-guard.ts`)
  with an inherently XXE-immune parser (`fast-xml-parser`), robots.txt
  respect, and per-source error isolation.
- Deterministic (non-AI), transparent scoring: duplicate detection, priority
  ranking, and Pakistan-relevance classification — every score comes with
  human-readable reasons, never a bare number.
- Story clusters with a claim/contradiction verification model: an
  unresolved contradiction (a claim with both a supporting and a
  contradicting source) blocks "Create Draft" until an editor explicitly
  resolves it.
- Optional AI assistance (headline suggestions, Pakistan-impact narrative,
  claim summarization) via `AI_API_KEY` — every AI output is logged
  (`AIGeneration`) and visibly labeled, never auto-published, never silently
  resolves a contradiction.

**Phase 5 — production operations**:

- Scheduled publishing: an idempotent cron route (`/api/cron/publish-scheduled`,
  bearer-token protected) atomically claims and publishes due articles —
  safe under concurrent/duplicate invocation.
- Media library with a provider-switched storage abstraction
  (`lib/media/storage.ts`): local disk for development, **Vercel Blob** for
  production — uploads are actively refused on Vercel until a durable
  provider is actually configured, never silently written to a filesystem
  that won't survive the next request.
- User administration: invite-by-email or admin-triggered password reset,
  both via single-use, hash-stored tokens; a locked-down `SYSTEM` role used
  only as the audit-log actor for automated actions (cron, etc.) — never
  authenticable, never assignable, never shown in the user list.
- In-app + email notifications on article-lifecycle events.
- Newsletter with double opt-in (`PENDING → CONFIRMED → UNSUBSCRIBED`) —
  campaigns only ever reach `CONFIRMED` subscribers; every send carries a
  working one-click unsubscribe link.
- Self-hosted analytics (`PageView` table, `/admin/analytics`) — labeled
  precisely as raw page views, never "readers"/"users"/"unique visitors."
- Operational monitoring (`/admin/monitoring`, `/api/health`), a Postgres-
  backed rate limiter (login, signup, confirm, upload, cron), and a live-
  tested Content-Security-Policy.
- An Editorial Data Export (`/admin/backups`) — explicitly *not* a backup;
  see **Recovery** below.

## Run (local development)

1. `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to a real PostgreSQL
   connection string (local or hosted — e.g. Neon/Supabase/Railway), plus a
   real `AUTH_SECRET` and `CRON_SECRET` (long random strings) and
   `ADMIN_NAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` for bootstrapping. Leave
   `STORAGE_PROVIDER="local"` and every `SMTP_*` var empty for local dev —
   both degrade honestly (uploads write to `public/uploads`; every email
   path shows "not configured" and logs to `EmailLog` instead of failing).
3. `npx prisma generate`
4. `npx prisma migrate deploy` (applies every migration in
   `prisma/migrations` in order — the reliable non-interactive path in this
   repo; `prisma migrate dev` has been observed to hang non-interactively in
   some sandboxes, see the full-text-search note below if you're authoring a
   *new* migration by hand instead of applying the existing ones)
5. `npx tsx prisma/seed.ts` (or `npm run prisma:seed`)
6. `npm run create-admin` — creates the first ADMIN user from the `ADMIN_*`
   env vars, flagged to force a password change at first login. Rotate/
   remove `ADMIN_PASSWORD` from `.env` afterward.
7. `npm run dev`, then sign in at `/admin/login`.
8. `npm test` — runs the Vitest suite (hits the real database in
   `DATABASE_URL`; uses disposable, clearly-labeled test rows and cleans them
   up afterward).

### Full-text search migration (schema-authoring note, not needed to just run the app)

`Article.searchVector` is declared as `Unsupported("tsvector")` in the schema
so Prisma never tries to manage its DDL. If you ever hand-author a *new*
migration that touches `Article`, `prisma migrate diff` will emit a spurious
`DROP INDEX "Article_searchVector_idx"` / `ALTER COLUMN "searchVector" DROP
DEFAULT` pair — strip those lines before applying. The column itself is a
generated column:

```sql
ALTER TABLE "Article" ALTER COLUMN "searchVector" TYPE tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("subheadline", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("excerpt", '')), 'B')
  ) STORED;

CREATE INDEX "Article_searchVector_idx" ON "Article" USING GIN ("searchVector");
```

## Production deployment

In order — each step depends on the one before it:

1. **GitHub**: push this repository to a remote (`git remote add origin
   <url>`, `git push -u origin main`).
2. **Vercel**: import the GitHub repo as a new Vercel project.
3. **Neon**: already the database this project develops against — connect
   the same (or a separate production) Neon database's connection string as
   `DATABASE_URL` in the Vercel project's environment variables.
4. **Vercel Blob**: in the Vercel project, **Storage → Create Database →
   Blob**, access **Public**. This adds `BLOB_READ_WRITE_TOKEN` to the
   project automatically. Set `STORAGE_PROVIDER="vercel-blob"` for
   Production (and Preview, if desired) — leave it `"local"` only for
   environments with a persistent filesystem (i.e. not Vercel).
5. **SMTP**: pick a transactional email provider (Resend, Postmark, SES,
   Mailgun, etc.), create sending credentials, set `SMTP_HOST`/`SMTP_PORT`/
   `SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` in Vercel's environment variables.
   Every email path (invites, password resets, notifications, newsletter
   confirmation/welcome/campaigns) stays honestly "not configured" until
   these are set — nothing fails loudly, nothing fakes a send.
6. **Domain**: attach a custom domain in Vercel, set `NEXT_PUBLIC_SITE_URL`
   to it (used to build absolute links in emails and SEO metadata).
7. **Cron**: `vercel.json` already declares the scheduled-publish cron
   (`/api/cron/publish-scheduled`, every 5 minutes — actual frequency is
   also gated by your Vercel plan tier). Set `CRON_SECRET` in the project's
   environment variables; Vercel calls the route with it automatically.
8. **Migrations**: run `npx prisma migrate deploy` against the production
   `DATABASE_URL` (from CI or locally with the production connection
   string) before or as part of the first deploy. Then `npx prisma migrate
   status` should report a clean state.
9. **Verify**: `/api/health` returns `{"status":"ok","db":"ok"}`; log in as
   the bootstrapped admin and change the password immediately; run through
   the acceptance flow (schedule an article, wait for cron, confirm it
   publishes; upload a real image and confirm it renders; invite a user and
   confirm the email arrives).

Optional: `NEXT_PUBLIC_ANALYTICS_ID` for a third-party analytics tag (see
`app/(site)/layout.tsx`) — the self-hosted `PageView` table under
`/admin/analytics` needs no configuration at all and is the primary
analytics surface.

## Recovery

**Neon's point-in-time recovery (PITR) is the actual database recovery
mechanism** for this project — configured and managed entirely within Neon,
not by this application.

The **Editorial Data Export** at `/admin/backups` is a manual, on-demand
JSON snapshot of the core editorial tables (articles, versions, authors,
categories, tags, users, audit log) for portability. It is explicitly
**not** a backup system: there's no scheduled export, and it isn't a
substitute for Neon's own recovery mechanism.

**Media** stored via Vercel Blob is retained according to whatever
retention/versioning is configured on that Blob store in the Vercel
dashboard — this project doesn't configure or assume any specific policy
there. Media stored via the local-disk adapter has no recovery mechanism
beyond the filesystem it lives on (relevant for self-hosted deployments
only — Vercel's ephemeral filesystem refuses local-disk uploads outright,
see `lib/media/storage.ts`).

## Real vs. not-yet-configured

External services are intentionally not faked. AI, search/news, durable
object storage, SMTP, and analytics credentials must be configured before
those integrations actually operate — the admin dashboard and public UI say
so explicitly (e.g. "Not configured", a disabled "Send now" button) rather
than showing fabricated numbers or claiming a send that didn't happen.
Contact emails on the About/Contact/Advertise pages use the reserved
`tekzaro.example` domain as placeholders — replace them with real addresses
once a domain and mailbox are set up.
