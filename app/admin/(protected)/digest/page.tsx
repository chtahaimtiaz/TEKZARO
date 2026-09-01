import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_BUILD_DIGEST } from "@/lib/permissions";
import { getOrCreateTodaysDigest, addDigestItemAction, removeDigestItemAction, setDigestStatusReadyAction } from "@/lib/digest-actions";
import type { DigestSection } from "@prisma/client";

export const dynamic = "force-dynamic";

const SECTIONS: DigestSection[] = ["PAKISTAN", "REGIONAL", "GLOBAL"];
const SECTION_LABELS: Record<DigestSection, string> = {
  PAKISTAN: "1. Pakistan",
  REGIONAL: "2. Regional",
  GLOBAL: "3. Global",
};

function suggestedSection(pakistanImpactLevel: string | null, sourceCountry: string | null): DigestSection {
  if (pakistanImpactLevel && ["DIRECT", "HIGH", "MODERATE"].includes(pakistanImpactLevel)) return "PAKISTAN";
  const regional = ["india", "bangladesh", "sri lanka", "nepal", "uae", "united arab emirates", "saudi arabia"];
  if (sourceCountry && regional.includes(sourceCountry.toLowerCase())) return "REGIONAL";
  return "GLOBAL";
}

export default async function DigestPage() {
  const user = await requireUser();
  if (!CAN_BUILD_DIGEST.includes(user.role)) redirect("/admin");

  const digest = await getOrCreateTodaysDigest(user.id);

  const [items, candidates] = await Promise.all([
    prisma.digestItem.findMany({
      where: { digestId: digest.id },
      include: { sourceItem: { include: { source: true } }, article: true },
      orderBy: [{ section: "asc" }, { order: "asc" }],
    }),
    prisma.sourceItem.findMany({
      where: {
        status: { in: ["VERIFIED", "NEW", "REVIEWING"] },
        createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      },
      include: { source: true },
      orderBy: { priorityScore: "desc" },
      take: 40,
    }),
  ]);

  const includedIds = new Set(items.map((i) => i.sourceItemId).filter(Boolean));

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow eyebrow-pakistan">Pakistan Tech Daily</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">{digest.digestDate.toDateString()}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Status: {digest.status} — this is a review queue. It is never published automatically.
          </p>
        </div>
        {digest.status === "DRAFT" && (
          <form action={setDigestStatusReadyAction.bind(null, digest.id)}>
            <button type="submit" className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark">
              Mark Ready
            </button>
          </form>
        )}
      </div>

      {SECTIONS.map((section) => (
        <section key={section} className="mt-6 rounded-xl border border-border bg-paper-raised p-4">
          <p className="mb-3 text-sm font-bold">{SECTION_LABELS[section]}</p>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {items
              .filter((i) => i.section === section)
              .map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div>
                    <p className="font-medium">{i.sourceItem?.headline ?? i.article?.title}</p>
                    <p className="text-xs text-ink-muted">
                      {i.sourceItem?.source.name ?? "Article"}
                      {i.sourceItem ? ` · PK relevance ${i.sourceItem.pakistanRelevance}` : ""}
                    </p>
                  </div>
                  <form action={removeDigestItemAction.bind(null, i.id)}>
                    <button type="submit" className="text-xs font-semibold text-ink-muted hover:text-red-600 dark:hover:text-red-400">
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            {items.filter((i) => i.section === section).length === 0 && (
              <li className="py-2 text-ink-muted">No candidates selected yet.</li>
            )}
          </ul>
        </section>
      ))}

      <section className="mt-6 rounded-xl border border-border bg-paper-raised p-4">
        <p className="mb-3 text-sm font-bold">Candidates (last 48 hours)</p>
        <ul className="flex flex-col divide-y divide-border text-sm">
          {candidates
            .filter((c) => !includedIds.has(c.id))
            .map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium">{c.headline}</p>
                  <p className="text-xs text-ink-muted">
                    {c.source.name} · {c.status} · PK relevance {c.pakistanRelevance} · dup {c.duplicateScore.toFixed(2)}
                  </p>
                </div>
                <form action={addDigestItemAction.bind(null, digest.id)} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="sourceItemId" value={c.id} />
                  <select name="section" defaultValue={suggestedSection(c.pakistanImpactLevel, c.source.country)} className="rounded-md border border-border-strong p-1.5 text-xs bg-paper-raised text-ink">
                    {SECTIONS.map((s) => (
                      <option key={s} value={s}>
                        {SECTION_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="rounded-md border border-border-strong px-2 py-1 text-xs font-semibold hover:border-accent">
                    Add
                  </button>
                </form>
              </li>
            ))}
          {candidates.length === 0 && <li className="py-2 text-ink-muted">No recent candidates — fetch some sources first.</li>}
        </ul>
      </section>
    </div>
  );
}
