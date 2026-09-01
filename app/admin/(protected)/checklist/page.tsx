import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDailyChecklist, dayStatusLabel, todayInTimeZone } from "@/lib/editorial-checklist";
import { getEditorialSettings } from "@/lib/editorial-settings";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  TARGET_MET: "bg-pakistan-soft text-pakistan",
  IN_PROGRESS: "bg-accent-soft text-accent",
  TARGET_NOT_MET: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export default async function EditorialChecklistPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireUser();
  const { date } = await searchParams;
  const settings = await getEditorialSettings();
  const today = todayInTimeZone(settings.timezone);
  const summary = await getDailyChecklist(date);

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Today&apos;s Editorial Checklist</h1>
      <p className="mt-1 text-sm text-ink-muted">
        A category counts an article only once it&apos;s actually published — nothing here can be marked
        complete by hand. Timezone: {summary.timezone}.
      </p>

      <form method="get" className="mt-4 flex items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          Date
          <input type="date" name="date" defaultValue={summary.date} max={today} className="rounded-md border border-border-strong p-2" />
        </label>
        <button type="submit" className="rounded-md bg-ink px-4 py-2 font-semibold text-white hover:bg-ink-soft dark:text-paper">
          View
        </button>
        {summary.date !== today && (
          <Link href="/admin/checklist" className="rounded-md border border-border-strong px-4 py-2 font-semibold hover:border-accent">
            Back to today
          </Link>
        )}
      </form>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Articles published</p>
          <p className="mt-1 font-serif text-2xl font-bold">
            {summary.totalCompleted} / {summary.totalRequired}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Categories completed</p>
          <p className="mt-1 font-serif text-2xl font-bold">
            {summary.completedCategories} / {summary.totalCategories}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Completion</p>
          <p className="mt-1 font-serif text-2xl font-bold">{summary.percentComplete}%</p>
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-5">
          <p className="text-sm text-ink-muted">Status</p>
          <p className={`mt-1 inline-block rounded-md px-2 py-1 font-serif text-sm font-bold ${STATUS_STYLES[summary.status]}`}>
            {dayStatusLabel(summary.status)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {summary.categories.map((c) => (
          <div key={c.categoryId} className="rounded-xl border border-border bg-paper-raised p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-serif text-lg font-bold">{c.categoryName}</h2>
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-bold ${c.complete ? "bg-pakistan-soft text-pakistan" : "bg-paper text-ink-muted"}`}
              >
                {c.complete ? "COMPLETE" : "INCOMPLETE"}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-sm">
              {Array.from({ length: c.target }).map((_, i) => (
                <label key={i} className="flex items-center gap-2 text-ink-soft">
                  <input type="checkbox" checked={i < c.count} disabled readOnly />
                  Article {i + 1}
                </label>
              ))}
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Progress: {c.count} / {c.target}
              {c.count > c.target && ` (+${c.count - c.target} extra)`}
            </p>
            {c.minQualityNote && <p className="mt-1 text-xs italic text-ink-muted">{c.minQualityNote}</p>}

            {c.articles.length > 0 && (
              <details className="mt-3 text-xs text-ink-muted">
                <summary className="cursor-pointer font-semibold text-ink-soft">
                  {c.articles.length} article{c.articles.length === 1 ? "" : "s"} counted
                </summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {c.articles.map((a) => (
                    <li key={a.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                      <p className="font-semibold text-ink-soft">{a.title}</p>
                      <p>
                        By {a.authorName} · {a.publishedAt.toLocaleString()} · {a.verificationStatus.replace(/_/g, " ").toLowerCase()}
                      </p>
                      <div className="mt-1 flex gap-3">
                        <a href={`/article/${a.slug}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">
                          View live →
                        </a>
                        <Link href={`/admin/articles/${a.id}`} className="font-semibold text-accent hover:underline">
                          Edit →
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {!c.complete && summary.isToday && (
              <div className="mt-3 flex gap-3 text-xs font-semibold">
                <Link href={`/admin/articles?category=${c.categoryId}`} className="text-accent hover:underline">
                  Find articles →
                </Link>
                <Link href={`/admin/articles/new?category=${c.categoryId}`} className="text-accent hover:underline">
                  Create article →
                </Link>
              </div>
            )}
          </div>
        ))}
        {summary.categories.length === 0 && (
          <p className="text-sm text-ink-muted">
            No categories currently participate in the daily quota — configure this on the Categories page.
          </p>
        )}
      </div>
    </div>
  );
}
