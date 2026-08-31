import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CAN_MANAGE_BACKUPS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditorialDataExportPage() {
  const user = await requireUser();
  if (!CAN_MANAGE_BACKUPS.includes(user.role)) redirect("/admin");

  const lastExport = await prisma.auditLog.findFirst({
    where: { action: "editorial_data_exported" },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
  });

  return (
    <div>
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-3xl font-bold">Editorial Data Export</h1>

      <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Neon PITR is the primary database recovery mechanism. This export provides portability and
        manual recovery assistance; it is <strong>not an independent backup</strong>.
      </div>

      <section className="mt-6 rounded-xl border border-border bg-paper-raised p-5">
        <h2 className="text-lg font-bold">Export now</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Downloads a JSON snapshot of articles, versions, authors, categories, tags, users
          (excluding password hashes), and the audit log (last 5,000 entries).
        </p>
        <a
          href="/api/admin/export"
          className="mt-3 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
        >
          Download export
        </a>
        {lastExport && (
          <p className="mt-3 text-xs text-ink-muted">
            Last exported {lastExport.createdAt.toLocaleString()} by {lastExport.user.name}.
          </p>
        )}
      </section>
    </div>
  );
}
