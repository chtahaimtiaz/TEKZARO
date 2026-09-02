import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_ADS } from "@/lib/permissions";
import { updateAdvertiserAction, setAdvertiserStatusAction, deleteAdvertiserAction } from "@/lib/ad-actions";

export const dynamic = "force-dynamic";

export default async function EditAdvertiserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_MANAGE_ADS.includes(user.role)) redirect("/admin");
  const { id } = await params;
  const { error } = await searchParams;

  const advertiser = await prisma.advertiser.findUnique({
    where: { id },
    include: { campaigns: { orderBy: { createdAt: "desc" } } },
  });
  if (!advertiser) notFound();

  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Advertising</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">{advertiser.name}</h1>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <form action={updateAdvertiserAction.bind(null, advertiser.id)} className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-paper-raised p-4 text-sm">
        <label className="flex flex-col gap-1">
          Name
          <input name="name" defaultValue={advertiser.name} required className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1">
          Contact name
          <input name="contactName" defaultValue={advertiser.contactName ?? ""} className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1">
          Contact email
          <input name="contactEmail" type="email" defaultValue={advertiser.contactEmail ?? ""} className="rounded-md border border-border-strong p-2" />
        </label>
        <label className="flex flex-col gap-1">
          Notes
          <textarea name="notes" defaultValue={advertiser.notes ?? ""} rows={3} className="rounded-md border border-border-strong p-2" />
        </label>
        <button type="submit" className="w-fit rounded-md bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-dark dark:text-paper">
          Save
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form action={setAdvertiserStatusAction.bind(null, advertiser.id, advertiser.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>
          <button type="submit" className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-semibold hover:border-accent">
            {advertiser.status === "ACTIVE" ? "Mark inactive" : "Mark active"}
          </button>
        </form>
        {advertiser.campaigns.length === 0 && (
          <form action={deleteAdvertiserAction.bind(null, advertiser.id)}>
            <button type="submit" className="text-sm font-semibold text-red-600 hover:underline dark:text-red-400">
              Delete advertiser
            </button>
          </form>
        )}
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Campaigns</h2>
          <Link
            href={`/admin/ad-campaigns/new?advertiserId=${advertiser.id}`}
            className="text-sm font-semibold text-accent hover:underline"
          >
            + New campaign
          </Link>
        </div>
        <ul className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border bg-paper-raised text-sm">
          {advertiser.campaigns.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <Link href={`/admin/ad-campaigns/${c.id}`} className="font-medium hover:underline">
                {c.name}
              </Link>
              <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold uppercase text-ink-muted">{c.status}</span>
            </li>
          ))}
          {advertiser.campaigns.length === 0 && <li className="p-3 text-ink-muted">No campaigns yet.</li>}
        </ul>
      </section>
    </div>
  );
}
