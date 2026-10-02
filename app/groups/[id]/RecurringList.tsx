import { nameForUserId } from "@/lib/displayName";
import { formatMoney } from "@/lib/money";
import { frequencyLabel } from "@/lib/recurring";
import { deleteRecurring, setRecurringActive } from "./actions";

export type RecurringRow = {
  id: string;
  paid_by: string | null;
  description: string;
  amount: number | string;
  frequency: string;
  next_due: string;
  active: boolean;
  created_by: string | null;
};

type Props = {
  groupId: string;
  templates: RecurringRow[];
  nameById: Record<string, string>;
  currency: string;
  currentUserId: string;
};

function formatDueDate(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function RecurringList({
  groupId,
  templates,
  nameById,
  currency,
  currentUserId,
}: Props) {
  if (templates.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h2 className="text-sm font-semibold text-text">Recurring</h2>
      <ul className="flex flex-col gap-3">
        {templates.map((t) => {
          const isCreator = t.created_by === currentUserId;
          return (
            <li key={t.id} className="flex flex-col gap-1 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate font-medium text-text">
                  {t.description}
                </span>
                <span className="shrink-0 whitespace-nowrap font-medium text-text">
                  {formatMoney(Number(t.amount), currency)}
                </span>
              </div>
              <span className="text-text-muted">
                {frequencyLabel(t.frequency)} · {t.active ? `next ${formatDueDate(t.next_due)}` : "Paused"} · paid by{" "}
                {nameForUserId(t.paid_by, nameById)}
              </span>
              {isCreator && (
                <div className="flex gap-2">
                  <form action={setRecurringActive}>
                    <input type="hidden" name="groupId" value={groupId} />
                    <input type="hidden" name="recurringId" value={t.id} />
                    <input type="hidden" name="active" value={String(!t.active)} />
                    <button
                      type="submit"
                      className="rounded-md border border-border px-3 py-1 text-xs text-text hover:bg-surface-hover"
                    >
                      {t.active ? "Pause" : "Resume"}
                    </button>
                  </form>
                  <form action={deleteRecurring}>
                    <input type="hidden" name="groupId" value={groupId} />
                    <input type="hidden" name="recurringId" value={t.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-border px-3 py-1 text-xs text-danger hover:bg-surface-hover"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
