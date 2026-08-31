import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/lib/auth-actions";
import {
  CAN_MANAGE_USERS,
  CAN_VIEW_AUDIT_LOG,
  CAN_VIEW_DISCOVERY,
  CAN_MANAGE_SOURCES,
  CAN_MANAGE_KEYWORDS,
  CAN_BUILD_DIGEST,
} from "@/lib/permissions";

const CORE_NAV = [
  { label: "Overview", href: "/admin" },
  { label: "Articles", href: "/admin/articles" },
];

const COMING_SOON_NAV = ["Categories", "Tags", "Authors", "Media", "Newsletter", "SEO", "Settings"];

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  // Defense in depth — proxy.ts already redirects anonymous requests, but
  // every protected surface re-checks independently rather than trusting it.
  const user = await requireUser();

  // A one-time bootstrap (or freshly-reset) password must be changed before
  // anything else in the CMS is usable.
  if (user.mustChangePassword) redirect("/admin/change-password");

  return (
    <div className="grid min-h-screen grid-cols-1 bg-paper text-ink lg:grid-cols-[240px_1fr]">
      <aside className="flex flex-col border-b border-black/10 bg-ink p-6 text-white lg:border-b-0 lg:border-r">
        <p className="font-serif text-xl font-black">TEKZARO</p>
        <nav className="mt-6 flex flex-col gap-1 text-sm">
          {CORE_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-md px-2 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">
              {item.label}
            </Link>
          ))}
          {CAN_VIEW_DISCOVERY.includes(user.role) && (
            <Link href="/admin/discovery" className="rounded-md px-2 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">
              News Discovery
            </Link>
          )}
          {CAN_MANAGE_SOURCES.includes(user.role) && (
            <Link href="/admin/sources" className="rounded-md px-2 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">
              Sources
            </Link>
          )}
          {CAN_MANAGE_KEYWORDS.includes(user.role) && (
            <Link href="/admin/keywords" className="rounded-md px-2 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">
              Keywords
            </Link>
          )}
          {CAN_BUILD_DIGEST.includes(user.role) && (
            <Link href="/admin/digest" className="rounded-md px-2 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">
              Pakistan Tech Daily
            </Link>
          )}
          {CAN_VIEW_AUDIT_LOG.includes(user.role) && (
            <Link href="/admin/audit-log" className="rounded-md px-2 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">
              Audit Log
            </Link>
          )}
          {CAN_MANAGE_USERS.includes(user.role) && (
            <Link href="/admin/users" className="rounded-md px-2 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">
              Users
            </Link>
          )}
          <div className="mt-3 border-t border-white/10 pt-3">
            {COMING_SOON_NAV.map((label) => (
              <span key={label} className="flex items-center justify-between rounded-md px-2 py-1.5 text-white/35">
                {label}
                <span className="text-[10px] uppercase tracking-wide">Soon</span>
              </span>
            ))}
          </div>
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-white/10 pt-4 text-xs text-white/70">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-white">{user.name}</p>
              <p>{user.role}</p>
            </div>
            <form action={logoutAction}>
              <button type="submit" className="rounded-md border border-white/20 px-2 py-1 hover:border-accent hover:text-accent">
                Sign out
              </button>
            </form>
          </div>
          <Link href="/admin/change-password" className="text-white/60 hover:text-accent">
            Change password
          </Link>
        </div>
      </aside>

      <main className="p-6 sm:p-10">{children}</main>
    </div>
  );
}
