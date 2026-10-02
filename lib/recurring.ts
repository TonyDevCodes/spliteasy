export type RecurringFrequency = "weekly" | "monthly";

export type CentsSplit = { userId: string; amountCents: number };

export type RecurringSplit = { user_id: string; amount_owed: number };

export type RecurringInsertRow = {
  group_id: string;
  paid_by: string;
  description: string;
  category: string | null;
  amount: number;
  splits: RecurringSplit[];
  frequency: RecurringFrequency;
  anchor_date: string;
  next_due: string;
  active: true;
  created_by: string;
};

export type RecurringInput = {
  groupId: string;
  createdBy: string;
  paidBy: string;
  description: string;
  category: string | null;
  amountCents: number;
  splits: CentsSplit[];
  frequency: string;
  startDate: string;
  memberIds: string[];
};

export type RecurringResult =
  | { ok: true; row: RecurringInsertRow }
  | { ok: false; error: string };

export function isRecurringFrequency(value: unknown): value is RecurringFrequency {
  return value === "weekly" || value === "monthly";
}

export function frequencyLabel(frequency: string): string {
  return frequency === "weekly" ? "Weekly" : "Monthly";
}

// A real calendar date written as YYYY-MM-DD.
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// The daily run generates every template whose next due date is today or
// earlier. Both arguments are YYYY-MM-DD, so string order is date order.
export function isDueNow(nextDue: string, today: string): boolean {
  return nextDue <= today;
}

function toAmount(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

// Validates a recurring template and builds the recurring_expenses row. The
// start date is both the anchor and the first due date.
export function buildRecurringRow(input: RecurringInput): RecurringResult {
  const description = input.description.trim();
  if (!description) return { ok: false, error: "Description is required" };
  if (!isRecurringFrequency(input.frequency)) {
    return { ok: false, error: "Invalid repeat frequency" };
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: "Amount must be greater than 0" };
  }
  if (!isValidDateString(input.startDate)) {
    return { ok: false, error: "Invalid start date" };
  }

  const members = new Set(input.memberIds);
  if (!members.has(input.paidBy)) {
    return { ok: false, error: "Payer is not a member of this group" };
  }
  if (input.splits.length === 0) {
    return { ok: false, error: "At least one split is required" };
  }

  const seen = new Set<string>();
  let total = 0;
  for (const s of input.splits) {
    if (!members.has(s.userId)) {
      return { ok: false, error: "Split user is not a member of this group" };
    }
    if (seen.has(s.userId)) {
      return { ok: false, error: "Duplicate split user" };
    }
    seen.add(s.userId);
    if (!Number.isInteger(s.amountCents) || s.amountCents < 0) {
      return { ok: false, error: "Invalid split amount" };
    }
    total += s.amountCents;
  }
  if (total !== input.amountCents) {
    return { ok: false, error: "Split totals do not match expense amount" };
  }

  return {
    ok: true,
    row: {
      group_id: input.groupId,
      paid_by: input.paidBy,
      description,
      category: input.category,
      amount: toAmount(input.amountCents),
      splits: input.splits.map((s) => ({
        user_id: s.userId,
        amount_owed: toAmount(s.amountCents),
      })),
      frequency: input.frequency,
      anchor_date: input.startDate,
      next_due: input.startDate,
      active: true,
      created_by: input.createdBy,
    },
  };
}
