import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/lib/notification-actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Newsroom</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">Notifications</h1>
        </div>
        {unreadCount > 0 && (
          <form action={markAllNotificationsReadAction}>
            <button type="submit" className="text-sm font-semibold text-accent hover:underline">
              Mark all as read
            </button>
          </form>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`rounded-xl border p-4 ${n.read ? "border-border bg-paper-raised" : "border-accent/40 bg-accent/5"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold">{n.title}</p>
                <p className="mt-1 text-sm text-ink-soft">{n.body}</p>
                <p className="mt-2 text-xs text-ink-muted">{n.createdAt.toLocaleString()}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {n.link && (
                  <Link href={n.link} className="text-xs font-semibold text-accent hover:underline">
                    View
                  </Link>
                )}
                {!n.read && (
                  <form action={markNotificationReadAction.bind(null, n.id)}>
                    <button type="submit" className="text-xs font-semibold text-ink-muted hover:underline">
                      Mark read
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        ))}
        {notifications.length === 0 && <p className="text-sm text-ink-muted">No notifications yet.</p>}
      </div>
    </div>
  );
}
