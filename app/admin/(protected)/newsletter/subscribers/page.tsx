import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAN_SEND_NEWSLETTER } from "@/lib/permissions";
import { NEWSLETTER_SUBSCRIBER_STATUSES, buildSubscriberWhere } from "@/lib/newsletter-subscribers";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SearchParams {
  q?: string;
  status?: string;
  page?: string;
}

function queryString(sp: SearchParams, overrides: Partial<SearchParams>): string {
  const merged = { ...sp, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.status) params.set("status", merged.status);
  if (merged.page && merged.page !== "1") params.set("page", merged.page);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function NewsletterSubscribersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  if (!CAN_SEND_NEWSLETTER.includes(user.role)) redirect("/admin");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = buildSubscriberWhere(sp);

  const [subscribers, total] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.newsletterSubscriber.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="mt-1 font-serif text-3xl font-bold">Subscribers</h1>
        <div className="flex gap-2">
          <Link href="/admin/newsletter" className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-semibold hover:border-accent">
            ← Newsletter
          </Link>
          <a
            href={`/api/admin/newsletter-subscribers-export${queryString(sp, { page: undefined })}`}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-dark dark:text-paper"
          >
            Export CSV
          </a>
        </div>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          Search email
          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="you@example.com"
            className="rounded-md border border-border-strong bg-paper-raised p-2 text-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          Status
          <select name="status" defaultValue={sp.status ?? ""} className="rounded-md border border-border-strong bg-paper-raised p-2 text-ink">
            <option value="">All</option>
            {NEWSLETTER_SUBSCRIBER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md border border-border-strong px-4 py-2 font-semibold hover:border-accent">
          Filter
        </button>
        {(sp.q || sp.status) && (
          <Link href="/admin/newsletter/subscribers" className="text-xs text-ink-muted hover:text-accent">
            Clear filters
          </Link>
        )}
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-paper-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="p-3">Email</th>
              <th className="p-3">Status</th>
              <th className="p-3">Subscribed</th>
            </tr>
          </thead>
          <tbody>
            {subscribers.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-b-0">
                <td className="p-3">{s.email}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      s.status === "CONFIRMED"
                        ? "bg-pakistan-soft text-pakistan"
                        : s.status === "PENDING"
                          ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-paper text-ink-muted"
                    }`}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="p-3 text-ink-muted">{formatDateTime(s.createdAt)}</td>
              </tr>
            ))}
            {subscribers.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-ink-muted">
                  No subscribers match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
        <span>
          {total} subscriber{total === 1 ? "" : "s"} · Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={`/admin/newsletter/subscribers${queryString(sp, { page: String(page - 1) })}`} className="rounded-md border border-border-strong px-3 py-1.5 font-semibold hover:border-accent">
              ← Prev
            </Link>
          )}
          {page < totalPages && (
            <Link href={`/admin/newsletter/subscribers${queryString(sp, { page: String(page + 1) })}`} className="rounded-md border border-border-strong px-3 py-1.5 font-semibold hover:border-accent">
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
