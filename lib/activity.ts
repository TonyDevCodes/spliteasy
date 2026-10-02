// Pure helpers for the group activity feed (rows of the public.group_activity view).

export type ActivityKind = "expense" | "settlement";

/** One row of public.group_activity, as returned by PostgREST. */
export type ActivityRow = {
  group_id: string;
  kind: ActivityKind | string;
  ref_id: string;
  actor_id: string | null;
  amount: number | string;
  currency: string;
  /** Expense description, or the settlement kind ('payment' / 'write_off'). */
  title: string | null;
  created_at: string;
};

export type ActivityItem = {
  id: string;
  groupId: string;
  kind: ActivityKind;
  refId: string;
  actorId: string | null;
  amount: number;
  currency: string;
  title: string;
  /** Settlement only: true when an admin wrote off a debt instead of a payment. */
  isWriteOff: boolean;
  createdAt: string;
};

export type ActivityDay = {
  /** YYYY-MM-DD */
  day: string;
  items: ActivityItem[];
};

export const ACTIVITY_COLUMNS = "group_id, kind, ref_id, actor_id, amount, currency, title, created_at";

/** Maps a view row to an ActivityItem; null for a row of an unknown kind. */
export function toActivityItem(row: ActivityRow): ActivityItem | null {
  if (row.kind !== "expense" && row.kind !== "settlement") return null;

  const amount = Number(row.amount);
  const isWriteOff = row.kind === "settlement" && row.title === "write_off";
  const fallback = row.kind === "expense" ? "Expense" : isWriteOff ? "Write-off" : "Payment";
  const title = row.kind === "expense" ? row.title?.trim() || fallback : fallback;

  return {
    // ref_id is unique per table only, so the kind is part of the id.
    id: `${row.kind}:${row.ref_id}`,
    groupId: row.group_id,
    kind: row.kind,
    refId: row.ref_id,
    actorId: row.actor_id,
    amount: Number.isFinite(amount) ? amount : 0,
    currency: row.currency,
    title,
    isWriteOff,
    createdAt: row.created_at,
  };
}

/** Maps rows to items, dropping rows of an unknown kind. */
export function toActivityItems(rows: ActivityRow[]): ActivityItem[] {
  return rows.flatMap((row) => {
    const item = toActivityItem(row);
    return item ? [item] : [];
  });
}

function dayKey(timestamp: string, timeZone?: string): string | null {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Groups items by calendar day (the device's time zone unless one is given),
 * newest day first and newest item first within a day. Items with an invalid
 * timestamp are dropped.
 */
export function groupActivityByDay(items: ActivityItem[], timeZone?: string): ActivityDay[] {
  const byDay = new Map<string, ActivityItem[]>();

  for (const item of items) {
    const key = dayKey(item.createdAt, timeZone);
    if (!key) continue;
    const list = byDay.get(key);
    if (list) list.push(item);
    else byDay.set(key, [item]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, list]) => ({
      day,
      items: list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    }));
}
