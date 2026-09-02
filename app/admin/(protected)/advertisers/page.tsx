import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_ADS } from "@/lib/permissions";
import { createAdvertiserAction } from "@/lib/ad-actions";

export const dynamic = "force-dynamic";

export default async function AdvertisersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_MANAGE_ADS.includes(user.role)) redirect("/admin");
  const { error } = await searchParams;

  const advertisers = await prisma.advertiser.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { campaigns: true } } },
  });

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Advertising</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">Advertisers</h1>
        </div>
        <Link href="/admin/ad-campaigns" className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-semibold hover:border-accent">
          Ad campaigns →
        </Link>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Deals arranged directly (see the public Advertise page) — enter each advertiser once, then create
        campaigns against them.
      </p>

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <form action={createAdvertiserAction} className="mt-6 grid gap-3 rounded-xl border border-border bg-paper-raised p-4 text-sm sm:grid-cols-2">
        <input name="name" placeholder="Advertiser name" required className="rounded-md border border-border-strong p-2" />
        <input name="contactName" placeholder="Contact name" className="rounded-md border border-border-strong p-2" />
        <input name="contactEmail" type="email" placeholder="Contact email" className="rounded-md border border-border-strong p-2" />
        <input name="notes" placeholder="Notes (optional)" className="rounded-md border border-border-strong p-2" />
        <button type="submit" className="w-fit rounded-md bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-dark dark:text-paper sm:col-span-2">
          Add advertiser
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-paper-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="p-3">Name</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Campaigns</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {advertisers.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-b-0">
                <td className="p-3 font-medium">
                  <Link href={`/admin/advertisers/${a.id}`} className="hover:underline">
                    {a.name}
                  </Link>
                </td>
                <td className="p-3 text-ink-soft">{a.contactEmail || a.contactName || "—"}</td>
                <td className="p-3">{a._count.campaigns}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      a.status === "ACTIVE" ? "bg-pakistan-soft text-pakistan" : "bg-paper text-ink-muted"
                    }`}
                  >
                    {a.status}
                  </span>
                </td>
              </tr>
            ))}
            {advertisers.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-ink-muted">
                  No advertisers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
