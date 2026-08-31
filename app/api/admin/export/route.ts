import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { CAN_MANAGE_BACKUPS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Editorial Data Export — NOT a backup system. Neon PITR is the primary
 * database recovery mechanism; this is a manual, on-demand portability
 * snapshot of the core editorial tables. Capped audit-log window so this
 * stays a reasonable one-off download rather than growing unbounded.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || !CAN_MANAGE_BACKUPS.includes(user.role)) {
    return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
  }

  const [articles, articleVersions, authors, categories, tags, users, auditLogs] = await Promise.all([
    prisma.article.findMany(),
    prisma.articleVersion.findMany(),
    prisma.author.findMany(),
    prisma.category.findMany(),
    prisma.tag.findMany(),
    prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true, authorId: true, createdAt: true, updatedAt: true },
      where: { role: { not: "SYSTEM" } },
    }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 5000 }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    note:
      "Neon PITR is the primary database recovery mechanism. This export provides portability and manual recovery assistance; it is not an independent backup.",
    articles,
    articleVersions,
    authors,
    categories,
    tags,
    users,
    auditLogs,
  };

  await logAction({ userId: user.id, action: "editorial_data_exported", entityType: "System" });

  const filename = `tekzaro-editorial-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
