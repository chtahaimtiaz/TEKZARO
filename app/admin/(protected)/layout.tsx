import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/lib/auth-actions";
import { prisma } from "@/lib/prisma";
import { getThemePreference } from "@/lib/theme";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Logo } from "@/components/ui/Logo";
import {
  CAN_MANAGE_USERS,
  CAN_VIEW_AUDIT_LOG,
  CAN_VIEW_DISCOVERY,
  CAN_MANAGE_SOURCES,
  CAN_MANAGE_KEYWORDS,
  CAN_MANAGE_AUTHORS,
  CAN_BUILD_DIGEST,
  CAN_MANAGE_MEDIA,
  CAN_SEND_NEWSLETTER,
  CAN_VIEW_ANALYTICS,
  CAN_VIEW_MONITORING,
  CAN_MANAGE_BACKUPS,
} from "@/lib/permissions";

const CORE_NAV = [
  { label: "Overview", href: "/admin" },
  { label: "Articles", href: "/admin/articles" },
  { label: "Editorial Checklist", href: "/admin/checklist" },
];

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  // Defense in depth — proxy.ts already redirects anonymous requests, but
  // every protected surface re-checks independently rather than trusting it.
  const user = await requireUser();

  // A one-time bootstrap (or freshly-reset) password must be changed before
  // anything else in the CMS is usable.
  if (user.mustChangePassword) redirect("/admin/change-password");

  const unreadNotifications = await prisma.notification.count({ where: { userId: user.id, read: false } });
  const themePreference = await getThemePreference();

  return (
    <div className="grid min-h-screen grid-cols-1 bg-paper text-ink lg:grid-cols-[240px_1fr]">
      <aside className="flex flex-col border-b border-border bg-paper-raised p-6 text-ink lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2">
          <Logo size={32} priority />
          <p className="font-serif text-xl font-black">TEKZARO</p>
        </div>
        <div className="mt-3">
          <ThemeToggle initialPreference={themePreference} />
        </div>
        <nav className="mt-6 flex flex-col gap-1 text-sm">
          {CORE_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
              {item.label}
            </Link>
          ))}
          <Link href="/admin/notifications" className="flex items-center justify-between rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
            Notifications
            {unreadNotifications > 0 && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white dark:text-paper">{unreadNotifications}</span>
            )}
          </Link>
          {CAN_VIEW_DISCOVERY.includes(user.role) && (
            <Link href="/admin/discovery" className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
              News Discovery
            </Link>
          )}
          {CAN_MANAGE_SOURCES.includes(user.role) && (
            <Link href="/admin/sources" className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
              Sources
            </Link>
          )}
          {CAN_MANAGE_SOURCES.includes(user.role) && (
            <Link href="/admin/categories" className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
              Categories
            </Link>
          )}
          {CAN_MANAGE_AUTHORS.includes(user.role) && (
            <Link href="/admin/authors" className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
              Authors
            </Link>
          )}
          {CAN_MANAGE_KEYWORDS.includes(user.role) && (
            <Link href="/admin/keywords" className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
              Keywords
            </Link>
          )}
          {CAN_BUILD_DIGEST.includes(user.role) && (
            <Link href="/admin/digest" className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
              Pakistan Tech Daily
            </Link>
          )}
          {CAN_MANAGE_MEDIA.includes(user.role) && (
            <Link href="/admin/media" className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
              Media
            </Link>
          )}
          {CAN_SEND_NEWSLETTER.includes(user.role) && (
            <Link href="/admin/newsletter" className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
              Newsletter
            </Link>
          )}
          {CAN_VIEW_ANALYTICS.includes(user.role) && (
            <Link href="/admin/analytics" className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
              Analytics
            </Link>
          )}
          {CAN_VIEW_AUDIT_LOG.includes(user.role) && (
            <Link href="/admin/audit-log" className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
              Audit Log
            </Link>
          )}
          {CAN_VIEW_MONITORING.includes(user.role) && (
            <Link href="/admin/monitoring" className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
              Monitoring
            </Link>
          )}
          {CAN_MANAGE_BACKUPS.includes(user.role) && (
            <Link href="/admin/backups" className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
              Editorial Data Export
            </Link>
          )}
          {CAN_MANAGE_USERS.includes(user.role) && (
            <Link href="/admin/users" className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-paper-sunk hover:text-ink">
              Users
            </Link>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4 text-xs text-ink-soft">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-ink">{user.name}</p>
              <p>{user.role}</p>
            </div>
            <form action={logoutAction}>
              <button type="submit" className="rounded-md border border-border-strong px-2 py-1 hover:border-accent hover:text-accent">
                Sign out
              </button>
            </form>
          </div>
          <Link href="/admin/change-password" className="text-ink-muted hover:text-accent">
            Change password
          </Link>
        </div>
      </aside>

      <main className="p-6 sm:p-10">{children}</main>
    </div>
  );
}
