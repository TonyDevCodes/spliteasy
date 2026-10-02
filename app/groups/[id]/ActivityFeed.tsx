"use client";

import { useSyncExternalStore } from "react";
import { EmptyState } from "@/components/EmptyState";
import { nameForUserId } from "@/lib/displayName";
import { formatMoney } from "@/lib/money";
import { groupActivityByDay, type ActivityItem } from "@/lib/activity";

type Props = {
  items: ActivityItem[];
  nameById: Record<string, string>;
  currency: string;
};

const subscribe = () => () => {};

function kindLabel(item: ActivityItem): string {
  if (item.kind === "expense") return "Expense";
  return item.isWriteOff ? "Write-off" : "Payment";
}

function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function metaLine(item: ActivityItem, nameById: Record<string, string>): string {
  const label = kindLabel(item);
  const parts = [
    nameForUserId(item.actorId, nameById),
    formatTime(item.createdAt),
  ];
  if (item.title !== label) parts.unshift(label);
  return parts.join(" · ");
}

export default function ActivityFeed({ items, nameById, currency }: Props) {
  // Days and times depend on the viewer's time zone, so render them on the
  // client only (the server render would use the server's zone).
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  const days = isClient ? groupActivityByDay(items) : [];

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h2 className="text-sm font-semibold text-text">Activity</h2>
      {items.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Expenses and payments will show up here."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {days.map((day) => (
            <section key={day.day} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-text-muted">
                {formatDay(day.day)}
              </h3>
              <ul className="flex flex-col gap-2">
                {day.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 flex-1 flex-col text-text">
                      <span className="truncate font-medium">{item.title}</span>
                      <span className="text-text-muted">
                        {metaLine(item, nameById)}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap font-medium text-text">
                      {formatMoney(item.amount, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
