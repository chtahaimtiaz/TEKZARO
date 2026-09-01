import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_VIEW_DISCOVERY, CAN_RESEARCH, CAN_CREATE_DRAFT_FROM_DISCOVERY } from "@/lib/permissions";
import { researchItemAction, saveReviewNoteAction, setDiscoveryStatusAction, createDraftFromItemAction } from "@/lib/discovery-actions";
import { suggestPakistanImpactAction } from "@/lib/ai-actions";
import { CreateDraftButton } from "@/components/admin/CreateDraftButton";
import { AIAssistPanel } from "@/components/admin/AIAssistPanel";

export const dynamic = "force-dynamic";

export default async function DiscoveryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!CAN_VIEW_DISCOVERY.includes(user.role)) redirect("/admin");
  const { id } = await params;

  const item = await prisma.sourceItem.findUnique({
    where: { id },
    include: { source: true, category: true, cluster: { include: { _count: { select: { items: true } } } } },
  });
  if (!item) notFound();

  const canResearch = CAN_RESEARCH.includes(user.role);
  const canDraft = CAN_CREATE_DRAFT_FROM_DISCOVERY.includes(user.role);
  const priorityReasons = (item.priorityReasons as unknown as string[] | null) ?? [];
  const pakistanReasons = (item.pakistanImpactReasons as unknown as string[] | null) ?? [];

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Discovery</p>
      <div className="flex items-center gap-2">
        <h1 className="mt-1 font-serif text-3xl font-bold">{item.headline}</h1>
        <span className="rounded bg-paper px-2 py-0.5 text-xs font-semibold">{item.status.replace(/_/g, " ")}</span>
      </div>
      <p className="mt-2 text-sm text-ink-soft">{item.excerpt}</p>

      <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink-muted">
        <span>
          Source: <strong className="text-ink">{item.source.name}</strong> ({item.source.tier.replace("_", " ")})
        </span>
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Original link →
        </a>
        <span>Published: {item.publishedAt ? item.publishedAt.toLocaleString() : "Unknown"}</span>
        <span>Discovered: {item.createdAt.toLocaleString()}</span>
        <span>Category: {item.category?.name ?? "Unassigned"}</span>
      </div>

      {item.cluster && item.cluster._count.items > 1 && (
        <p className="mt-3 rounded-md bg-pakistan-soft p-3 text-sm text-pakistan">
          Part of a cluster with {item.cluster._count.items} sources.{" "}
          <Link href={`/admin/discovery/clusters/${item.clusterId}`} className="font-semibold hover:underline">
            Open story cluster / verification →
          </Link>
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-paper-raised p-4">
          <p className="mb-2 text-sm font-bold">Priority: {item.priorityScore.toFixed(0)}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {priorityReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
            {priorityReasons.length === 0 && <li className="list-none text-ink-muted">No signals matched.</li>}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-paper-raised p-4">
          <p className="mb-2 text-sm font-bold">
            Pakistan relevance: {item.pakistanRelevance}/100 ({item.pakistanImpactLevel ?? "NONE"})
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {pakistanReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
            {pakistanReasons.length === 0 && <li className="list-none text-ink-muted">No Pakistan signals detected.</li>}
          </ul>
        </div>
      </div>

      {item.duplicateScore > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Duplicate score {item.duplicateScore.toFixed(2)} against a similar item{item.duplicateOfId ? "" : " in this cluster"}.
          {item.status === "POSSIBLE_DUPLICATE" && " Flagged as a possible duplicate — review before converting to a draft."}
        </div>
      )}

      {item.pakistanImpactLevel && item.pakistanImpactLevel !== "NONE" && (
        <div className="mt-6">
          <AIAssistPanel
            title="Draft a &ldquo;What This Means for Pakistan&rdquo; starting point"
            buttonLabel="Suggest narrative"
            action={suggestPakistanImpactAction.bind(null, item.id)}
          />
        </div>
      )}

      {canResearch && (
        <form action={saveReviewNoteAction.bind(null, item.id)} className="mt-6 rounded-xl border border-border bg-paper-raised p-4">
          <label className="mb-1 block text-sm font-bold" htmlFor="reviewNote">
            Review note
          </label>
          <textarea
            id="reviewNote"
            name="reviewNote"
            defaultValue={item.reviewNote ?? ""}
            rows={3}
            className="w-full rounded-md border border-border-strong p-2 text-sm"
          />
          <button type="submit" className="mt-2 rounded-md border border-border-strong px-4 py-2 text-sm font-semibold hover:border-accent">
            Save
          </button>
        </form>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {canResearch && item.status === "NEW" && (
          <form action={researchItemAction.bind(null, item.id)}>
            <button type="submit" className="rounded-md border border-border-strong px-4 py-2.5 text-sm font-semibold hover:border-accent">
              Research
            </button>
          </form>
        )}
        {canResearch && item.status !== "VERIFIED" && (
          <form action={setDiscoveryStatusAction.bind(null, item.id, "VERIFIED")}>
            <button type="submit" className="rounded-md border border-border-strong px-4 py-2.5 text-sm font-semibold hover:border-accent">
              Mark Verified
            </button>
          </form>
        )}
        {canResearch && item.status !== "REJECTED" && (
          <form action={setDiscoveryStatusAction.bind(null, item.id, "REJECTED")}>
            <button type="submit" className="rounded-md border border-border-strong px-4 py-2.5 text-sm font-semibold text-red-700 hover:border-red-400 dark:text-red-400 dark:hover:border-red-700">
              Ignore
            </button>
          </form>
        )}
        {canDraft && item.status !== "CONVERTED_TO_DRAFT" && (
          <CreateDraftButton action={createDraftFromItemAction.bind(null, item.id)} />
        )}
        {item.status === "CONVERTED_TO_DRAFT" && item.convertedArticleId && (
          <Link href={`/admin/articles/${item.convertedArticleId}`} className="rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-soft dark:text-paper">
            Open draft →
          </Link>
        )}
      </div>
    </div>
  );
}
