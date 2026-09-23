// Pure helpers for in-app notifications (message text, badge, relative time).
// mobile/lib/notifications.ts is an identical copy of this file.
import { formatMoney } from "./money";

export const NOTIFICATION_TYPES = [
  "expense_added",
  "settlement_added",
  "member_joined",
  "currency_changed",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Written by the database triggers (see the add_notifications migration).
 * Names are display names captured when the notification was created.
 */
export type NotificationPayload = {
  description?: string;
  amount?: number | string;
  currency?: string;
  old_currency?: string;
  group_name?: string;
  actor_name?: string;
  paid_by_name?: string;
  from_name?: string;
  to_name?: string;
  member_name?: string;
};

export type AppNotification = {
  id: string;
  user_id: string;
  group_id: string | null;
  actor_id: string | null;
  type: NotificationType | string;
  payload: NotificationPayload | null;
  read_at: string | null;
  created_at: string;
};

export const NOTIFICATION_COLUMNS = "id, user_id, group_id, actor_id, type, payload, read_at, created_at";
export const NO_NOTIFICATIONS_TEXT = "No notifications yet";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** formatMoney when the payload has a usable amount; null otherwise. */
function payloadMoney(payload: NotificationPayload): string | null {
  const amount = Number(payload.amount);
  if (payload.amount === undefined || payload.amount === null || !Number.isFinite(amount)) {
    return null;
  }
  const currency = text(payload.currency);
  if (!currency) {
    return amount.toFixed(2);
  }
  try {
    return formatMoney(amount, currency);
  } catch {
    // Unknown currency code: still show the amount.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function buildNotificationMessage(notification: Pick<AppNotification, "type" | "payload">): string {
  const payload = notification.payload ?? {};
  const actor = text(payload.actor_name) ?? "Someone";
  const group = text(payload.group_name);
  const inGroup = group ? ` in ${group}` : "";
  const money = payloadMoney(payload);

  switch (notification.type) {
    case "expense_added": {
      const description = text(payload.description);
      const what = description ? `"${description}"` : "an expense";
      return `${actor} added ${what}${money ? ` (${money})` : ""}${inGroup}`;
    }
    case "settlement_added": {
      const from = text(payload.from_name) ?? actor;
      const to = text(payload.to_name) ?? "someone";
      return `${from} paid ${to}${money ? ` ${money}` : ""}${inGroup}`;
    }
    case "member_joined": {
      const member = text(payload.member_name) ?? actor;
      return `${member} joined ${group ?? "your group"}`;
    }
    case "currency_changed": {
      const currency = text(payload.currency);
      const previous = text(payload.old_currency);
      const target = group ?? "the group";
      if (!currency) return `${actor} changed the currency of ${target}`;
      return `${actor} changed the currency of ${target}${previous ? ` from ${previous}` : ""} to ${currency}`;
    }
    default:
      return group ? `New activity in ${group}` : "New activity";
  }
}

/** Text for the unread badge: null hides it, above 9 shows "9+". */
export function formatBadgeCount(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 9 ? "9+" : String(Math.floor(count));
}

/** "just now", "2 min ago", "3 h ago", "yesterday", "4 days ago", then the date. */
export function formatRelativeTime(timestamp: string, now: Date = new Date()): string {
  const then = new Date(timestamp);
  if (Number.isNaN(then.getTime())) return "";

  const seconds = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  const y = then.getFullYear();
  const m = String(then.getMonth() + 1).padStart(2, "0");
  const d = String(then.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
