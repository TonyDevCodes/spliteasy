"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { subscribeToTableChanges, uniqueChannelName } from "@/lib/realtime";
import { formatBadgeCount } from "@/lib/notifications";

export function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

/** Bell with a live unread count, linking to /notifications. */
export function NotificationBell({ userId }: { userId: string }) {
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(async () => {
    const supabase = createClient();
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      console.error("Unread notifications query error:", error);
      return;
    }
    setUnread(count ?? 0);
  }, [userId]);

  useEffect(() => {
    loadUnread();

    const supabase = createClient();
    const channel = subscribeToTableChanges(
      supabase,
      uniqueChannelName(`notifications-${userId}`),
      ["notifications"],
      loadUnread,
      `user_id=eq.${userId}`
    );

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadUnread]);

  const badge = formatBadgeCount(unread);

  return (
    <Link
      href="/notifications"
      aria-label={badge ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-text hover:bg-surface-hover"
    >
      <BellIcon className="h-5 w-5" />
      {badge && (
        <span className="absolute -right-1 -top-1 min-w-[1.125rem] rounded-full bg-danger px-1 text-center text-[0.6875rem] font-semibold leading-[1.125rem] text-surface">
          {badge}
        </span>
      )}
    </Link>
  );
}
