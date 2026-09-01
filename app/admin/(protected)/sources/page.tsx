import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_SOURCES } from "@/lib/permissions";
import { setSourceActiveAction } from "@/lib/source-actions";
import { FetchNowButton } from "@/components/admin/FetchNowButton";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const user = await requireUser();
  if (!CAN_MANAGE_SOURCES.includes(user.role)) redirect("/admin");

  const sources = await prisma.source.findMany({
    orderBy: { name: "asc" },
    include: { category: true, _count: { select: { items: true } } },
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="eyebrow">Newsroom</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">Sources</h1>
        </div>
        <Link href="/admin/sources/new" className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark">
          + Add source
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-paper-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="p-3">Name</th>
              <th className="p-3">Tier</th>
              <th className="p-3">Category</th>
              <th className="p-3">Items</th>
              <th className="p-3">Last success</th>
              <th className="p-3">Last error</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-b border-border align-top last:border-b-0">
                <td className="p-3">
                  <Link href={`/admin/sources/${s.id}`} className="font-semibold text-accent hover:underline">
                    {s.name}
                  </Link>
                  <p className="text-xs text-ink-muted">{s.feedUrl ?? s.url}</p>
                </td>
                <td className="p-3">{s.tier.replace("_", " ")}</td>
                <td className="p-3 text-ink-soft">{s.category?.name ?? "—"}</td>
                <td className="p-3">{s._count.items}</td>
                <td className="p-3 text-ink-muted">{s.lastSuccess ? s.lastSuccess.toLocaleString() : "Never"}</td>
                <td className="max-w-[200px] truncate p-3 text-red-600 dark:text-red-400">{s.lastError ?? ""}</td>
                <td className="p-3">
                  <form action={setSourceActiveAction.bind(null, s.id, !s.active)}>
                    <button type="submit" className={`rounded px-2 py-0.5 text-xs font-semibold ${s.active ? "bg-pakistan-soft text-pakistan" : "bg-paper text-ink-muted"}`}>
                      {s.active ? "Active" : "Disabled"}
                    </button>
                  </form>
                </td>
                <td className="p-3 text-right">{s.feedUrl && <FetchNowButton sourceId={s.id} />}</td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-ink-muted">
                  No sources configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
