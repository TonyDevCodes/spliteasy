"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { subscribeToTableChanges, uniqueChannelName } from "@/lib/realtime";
import {
  NOTIFICATION_COLUMNS,
  NO_NOTIFICATIONS_TEXT,
  buildNotificationMessage,
  formatRelativeTime,
  type AppNotification,
} from "@/lib/notifications";

const PAGE_SIZE = 100;

export default function NotificationsList({ userId }: { userId: string }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("notifications")
      .select(NOTIFICATION_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)
      .returns<AppNotification[]>();

    if (loadError) {
      console.error("Notifications query error:", loadError);
      setError("Something went wrong loading your notifications.");
    } else {
      setError(null);
      setNotifications(data ?? []);
    }
    setNow(new Date());
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();

    const supabase = createClient();
    const channel = subscribeToTableChanges(
      supabase,
      uniqueChannelName(`notifications-list-${userId}`),
      ["notifications"],
      load,
      `user_id=eq.${userId}`
    );
    // Keep "2 min ago" labels fresh while the page stays open.
    const timer = setInterval(() => setNow(new Date()), 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [userId, load]);

  async function markRead(ids: string[]) {
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: readAt } : n))
    );
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .in("id", ids)
      .is("read_at", null);
    if (updateError) {
      console.error("Mark notifications read error:", updateError);
      setError("Could not mark notifications as read.");
      load();
    }
  }

  async function handleOpen(notification: AppNotification) {
    if (!notification.read_at) {
      await markRead([notification.id]);
    }
    if (notification.group_id) {
      router.push(`/groups/${notification.group_id}`);
    }
  }

  async function handleMarkAll() {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setMarkingAll(true);
    await markRead(unreadIds);
    setMarkingAll(false);
  }

  const hasUnread = notifications.some((n) => !n.read_at);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Notifications</h1>
        <button
          type="button"
          onClick={handleMarkAll}
          disabled={!hasUnread || markingAll}
          className="rounded-md border border-border px-3 py-1 text-sm font-medium text-text hover:bg-surface-hover disabled:border-disabled disabled:bg-disabled disabled:text-on-disabled"
        >
          Mark all as read
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : notifications.length === 0 ? (
        <p className="py-8 text-center text-text-muted">{NO_NOTIFICATIONS_TEXT}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => handleOpen(n)}
                className={`flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left hover:border-text-muted ${
                  n.read_at ? "border-border bg-surface" : "border-link bg-surface-hover"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-link"}`}
                />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className={`text-sm text-text ${n.read_at ? "" : "font-semibold"}`}>
                    {buildNotificationMessage(n)}
                    {!n.read_at && <span className="sr-only"> (unread)</span>}
                  </span>
                  <span className="text-xs text-text-muted">{formatRelativeTime(n.created_at, now)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
