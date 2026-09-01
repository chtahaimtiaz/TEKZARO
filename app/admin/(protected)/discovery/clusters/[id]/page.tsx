import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_VIEW_DISCOVERY, CAN_RESEARCH, CAN_CREATE_DRAFT_FROM_DISCOVERY } from "@/lib/permissions";
import {
  addResearchNoteAction,
  createClaimAction,
  addClaimSourceAction,
  resolveClaimAction,
  removeItemFromClusterAction,
  createDraftFromClusterAction,
} from "@/lib/cluster-actions";
import { mergeIntoClusterAction } from "@/lib/discovery-actions";
import { summarizeClusterAction, extractClaimsAction } from "@/lib/ai-actions";
import { CreateDraftButton } from "@/components/admin/CreateDraftButton";
import { AIAssistPanel } from "@/components/admin/AIAssistPanel";

export const dynamic = "force-dynamic";

const CLAIM_TYPES = ["FACT", "CLAIM", "SPECULATION", "UNVERIFIED"] as const;

export default async function StoryClusterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!CAN_VIEW_DISCOVERY.includes(user.role)) redirect("/admin");
  const { id } = await params;

  const cluster = await prisma.storyCluster.findUnique({
    where: { id },
    include: {
      items: { include: { source: true }, orderBy: { priorityScore: "desc" } },
      claims: { include: { sources: { include: { sourceItem: { include: { source: true } } } }, createdBy: true }, orderBy: { createdAt: "asc" } },
      notes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!cluster) notFound();

  const canResearch = CAN_RESEARCH.includes(user.role);
  const canDraft = CAN_CREATE_DRAFT_FROM_DISCOVERY.includes(user.role);
  const hasUnresolved = cluster.claims.some((c) => !c.resolved);

  const otherItems = await prisma.sourceItem.findMany({
    where: { clusterId: { not: id } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, headline: true, source: { select: { name: true } } },
  });

  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Story Cluster</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">{cluster.title}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {cluster.items.length} source{cluster.items.length === 1 ? "" : "s"} reporting this event · Pakistan relevance{" "}
        {cluster.pakistanRelevance}/100 ({cluster.pakistanImpactLevel ?? "NONE"})
      </p>

      {hasUnresolved && (
        <div className="mt-4 rounded-xl border-2 border-red-400 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <strong>Potential conflict detected.</strong> One or more claims below have both supporting and
          contradicting sources and haven&apos;t been resolved. Drafting is blocked until an editor resolves them.
        </div>
      )}

      <section className="mt-6 rounded-xl border border-border bg-paper-raised p-4">
        <p className="mb-3 text-sm font-bold">Sources ({cluster.items.length})</p>
        <ul className="divide-y divide-border text-sm">
          {cluster.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <Link href={`/admin/discovery/${item.id}`} className="font-medium text-accent hover:underline">
                  {item.headline}
                </Link>
                <p className="text-xs text-ink-muted">
                  {item.source.name} ({item.source.tier.replace("_", " ")}) · {item.publishedAt?.toLocaleDateString() ?? "unknown date"}
                </p>
              </div>
              {canResearch && cluster.items.length > 1 && (
                <form action={removeItemFromClusterAction.bind(null, id, item.id)}>
                  <button type="submit" className="text-xs font-semibold text-ink-muted hover:text-red-600 dark:hover:text-red-400">
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>

        {canResearch && otherItems.length > 0 && (
          <form action={async (formData: FormData) => {
            "use server";
            const itemId = String(formData.get("itemId") ?? "");
            if (itemId) await mergeIntoClusterAction(itemId, id);
          }} className="mt-3 flex gap-2">
            <select name="itemId" className="flex-1 rounded-md border border-border-strong p-2 text-sm">
              <option value="">Add a source to this cluster…</option>
              {otherItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.headline} — {i.source.name}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-md border border-border-strong px-3 py-2 text-sm font-semibold hover:border-accent">
              Merge in
            </button>
          </form>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-border bg-paper-raised p-4">
        <p className="mb-3 text-sm font-bold">Claims</p>
        <div className="flex flex-col gap-4">
          {cluster.claims.map((claim) => (
            <div key={claim.id} className={`rounded-lg border p-3 ${!claim.resolved ? "border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950" : "border-border"}`}>
              <div className="flex items-center gap-2">
                <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold uppercase text-white dark:text-paper">{claim.type}</span>
                <p className="text-sm font-medium">{claim.text}</p>
              </div>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <p className="font-semibold text-ink-muted">Supporting</p>
                  <ul className="list-disc pl-4">
                    {claim.sources.filter((s) => s.stance === "SUPPORTING").map((s) => (
                      <li key={s.sourceItemId}>{s.sourceItem.source.name}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-ink-muted">Contradicting</p>
                  <ul className="list-disc pl-4">
                    {claim.sources.filter((s) => s.stance === "CONTRADICTING").map((s) => (
                      <li key={s.sourceItemId}>{s.sourceItem.source.name}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {canResearch && (
                <form action={addClaimSourceAction.bind(null, id, claim.id)} className="mt-2 flex flex-wrap items-center gap-2">
                  <select name="sourceItemId" className="rounded-md border border-border-strong p-1.5 text-xs">
                    {cluster.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.source.name}
                      </option>
                    ))}
                  </select>
                  <select name="stance" className="rounded-md border border-border-strong p-1.5 text-xs">
                    <option value="SUPPORTING">Supporting</option>
                    <option value="CONTRADICTING">Contradicting</option>
                  </select>
                  <button type="submit" className="rounded-md border border-border-strong px-2 py-1 text-xs font-semibold hover:border-accent">
                    Attach
                  </button>
                </form>
              )}

              {!claim.resolved && canResearch && (
                <form action={resolveClaimAction.bind(null, id, claim.id)} className="mt-2 flex flex-wrap items-center gap-2">
                  <input name="resolutionNote" placeholder="How was this resolved?" className="flex-1 rounded-md border border-border-strong p-1.5 text-xs" />
                  <button type="submit" className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-soft dark:text-paper">
                    Resolve contradiction
                  </button>
                </form>
              )}
              {claim.resolved && claim.resolutionNote && (
                <p className="mt-2 text-xs text-ink-muted">Resolved: {claim.resolutionNote}</p>
              )}
            </div>
          ))}
          {cluster.claims.length === 0 && <p className="text-sm text-ink-muted">No claims recorded yet.</p>}
        </div>

        {canResearch && (
          <form action={createClaimAction.bind(null, id)} className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <input name="text" placeholder="New claim text" required className="flex-1 rounded-md border border-border-strong p-2 text-sm" />
            <select name="type" className="rounded-md border border-border-strong p-2 text-sm">
              {CLAIM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-md border border-border-strong px-3 py-2 text-sm font-semibold hover:border-accent">
              Add claim
            </button>
          </form>
        )}
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <AIAssistPanel title="Summarize what's being reported" buttonLabel="Summarize with AI" action={summarizeClusterAction.bind(null, id)} />
        <AIAssistPanel title="Extract claims from source text" buttonLabel="Extract claims with AI" action={extractClaimsAction.bind(null, id)} />
      </div>

      <section className="mt-6 rounded-xl border border-border bg-paper-raised p-4">
        <p className="mb-3 text-sm font-bold">Research notes</p>
        <ul className="mb-3 flex flex-col gap-2 text-sm">
          {cluster.notes.map((note) => (
            <li key={note.id} className="rounded-md bg-paper p-2">
              {note.note}
              <span className="ml-2 text-xs text-ink-muted">{note.createdAt.toLocaleString()}</span>
            </li>
          ))}
          {cluster.notes.length === 0 && <p className="text-ink-muted">No notes yet.</p>}
        </ul>
        {canResearch && (
          <form action={addResearchNoteAction.bind(null, id)} className="flex gap-2">
            <input name="note" placeholder="Add a research note" className="flex-1 rounded-md border border-border-strong p-2 text-sm" />
            <button type="submit" className="rounded-md border border-border-strong px-3 py-2 text-sm font-semibold hover:border-accent">
              Add
            </button>
          </form>
        )}
      </section>

      {canDraft && (
        <div className="mt-6">
          <CreateDraftButton action={createDraftFromClusterAction.bind(null, id)} label="Create Draft from Cluster" />
        </div>
      )}
    </div>
  );
}
