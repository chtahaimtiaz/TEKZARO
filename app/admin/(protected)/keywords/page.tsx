import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_KEYWORDS } from "@/lib/permissions";
import { createKeywordAction, setKeywordActiveAction, deleteKeywordAction } from "@/lib/keyword-actions";

export const dynamic = "force-dynamic";

const KEYWORD_TYPES = ["PAKISTAN", "COMPANY", "TOPIC"] as const;

export default async function KeywordsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_MANAGE_KEYWORDS.includes(user.role)) redirect("/admin");
  const { error } = await searchParams;

  const keywords = await prisma.keyword.findMany({ orderBy: [{ type: "asc" }, { term: "asc" }] });

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Keywords</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Drives Pakistan-relevance detection and priority-ranking signals during ingestion. A small
        built-in list of Pakistani place names is always active — this table only adds to it.
      </p>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <form action={createKeywordAction} className="mt-6 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-paper-raised p-4">
        <label className="flex flex-col gap-1 text-sm">
          Term
          <input name="term" required className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Type
          <select name="type" className="rounded-md border border-border-strong p-2 bg-paper-raised text-ink">
            {KEYWORD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="priority" />
          Priority
        </label>
        <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark">
          Add
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-paper-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="p-3">Term</th>
              <th className="p-3">Type</th>
              <th className="p-3">Priority</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {keywords.map((k) => (
              <tr key={k.id} className="border-b border-border last:border-b-0">
                <td className="p-3 font-medium">{k.term}</td>
                <td className="p-3 text-ink-soft">{k.type}</td>
                <td className="p-3">{k.priority ? "Yes" : ""}</td>
                <td className="p-3">
                  <form action={setKeywordActiveAction.bind(null, k.id, !k.active)}>
                    <button type="submit" className={`rounded px-2 py-0.5 text-xs font-semibold ${k.active ? "bg-pakistan-soft text-pakistan" : "bg-paper text-ink-muted"}`}>
                      {k.active ? "Active" : "Disabled"}
                    </button>
                  </form>
                </td>
                <td className="p-3 text-right">
                  <form action={deleteKeywordAction.bind(null, k.id)}>
                    <button type="submit" className="text-xs font-semibold text-ink-muted hover:text-red-600 dark:hover:text-red-400">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {keywords.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-muted">
                  No configured keywords yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
