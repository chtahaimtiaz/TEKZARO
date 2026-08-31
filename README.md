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
  version-snapshotted.
- Article version history with restore.
- A real admin overview (live counts, recent activity) — anything not yet
  computable (page-view analytics) shows "Not configured", never a fabricated
  number.
- Article management (search/filter/sort), authenticated preview (not
  publicly indexable), user management, and a full audit log.

## What's intentionally not built yet (Phase 4–5)

News Discovery (source monitoring, duplicate detection, story clustering), AI
drafting/verification, scheduled-publish automation (cron), notifications,
social-post generation, and real analytics wiring. The Prisma schema already
includes the models these need (`Source`, `SourceItem`, `StoryCluster`,
`ResearchNote`, `Media`) so this phase builds on top of the schema rather than
migrating it again.

## Run

1. `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to a real PostgreSQL
   connection string (local or hosted — e.g. Neon/Supabase/Railway), plus a
   real `AUTH_SECRET` (long random string) and `ADMIN_NAME`/`ADMIN_EMAIL`/
   `ADMIN_PASSWORD` for bootstrapping.
3. `npx prisma generate`
4. `npx prisma migrate dev --name init`
5. Apply the full-text-search follow-up migration (see below) — required for
   `/search` to rank results; without it, search still works but only via the
   category/author/tag-name fallback, not ranked body/title matching.
6. `npx tsx prisma/seed.ts` (or `npm run prisma:seed`)
7. `npm run create-admin` — creates the first ADMIN user from the `ADMIN_*`
   env vars. Rotate/remove `ADMIN_PASSWORD` from `.env` afterward.
8. `npm run dev`, then sign in at `/admin/login`.
9. `npm test` — runs the Vitest suite (hits the real database in
   `DATABASE_URL`; uses disposable, clearly-labeled test rows and cleans them
   up afterward).

### Full-text search migration

`Article.searchVector` is declared as `Unsupported("tsvector")` in the schema
so Prisma never tries to manage its DDL. After the initial `migrate dev`, open
the generated migration SQL and replace the plain `"searchVector" tsvector`
column definition with a generated column, then add a GIN index:

```sql
ALTER TABLE "Article" ALTER COLUMN "searchVector" TYPE tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("subheadline", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("excerpt", '')), 'B')
  ) STORED;

CREATE INDEX "Article_searchVector_idx" ON "Article" USING GIN ("searchVector");
```

(If the column was already created as a plain nullable column by a prior
`migrate dev` run, `DROP COLUMN` + re-`ADD COLUMN ... GENERATED ALWAYS AS (...)
STORED` instead of `ALTER COLUMN ... TYPE`.)

If `prisma migrate dev` hangs non-interactively (seen in some sandboxes — it
appears to stall on its own post-migration prompt/seed step), use
`prisma migrate dev --create-only` to generate the SQL, hand-edit it, then
`prisma migrate deploy` to apply non-interactively.

## Real vs. not-yet-configured

External services are intentionally not faked. AI, search/news, email,
analytics, storage and social credentials must be configured in `.env` before
those integrations can operate — the admin dashboard says so explicitly rather
than showing fabricated numbers. Contact emails on the About/Contact/Advertise
pages use the reserved `tekzaro.example` domain as placeholders — replace them
with real addresses once a domain and mailbox are set up.
