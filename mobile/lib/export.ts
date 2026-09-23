// Pure builders for the group export (CSV files and the PDF summary data).
// mobile/lib/export.ts is an identical copy of this file.
import { computeDetailedBalances, computeSettlements, type BalanceLine } from "./settlements";
import { getDisplayName } from "./displayName";
import { formatMoney } from "./money";

export type ExportGroup = {
  name: string;
  currency: string;
};

export type ExportMember = {
  id: string;
  display_name: string | null;
  email: string;
};

export type ExportSplit = {
  expense_id: string;
  user_id: string;
  amount_owed: number | string;
};

export type ExportExpense = {
  id: string;
  paid_by: string;
  amount: number | string;
  description: string;
  created_at: string;
};

export type ExportSettlement = {
  from_user: string;
  to_user: string;
  amount: number | string;
};

export type GroupBalances = {
  detailed: BalanceLine[];
  simplified: BalanceLine[];
};

export type GroupSummary = {
  title: string;
  currency: string;
  generatedOn: string;
  yourBalance: string[];
  detailed: string[];
  simplified: string[];
  expenseColumns: string[];
  expenseRows: string[][];
};

/** Byte order mark so Excel opens the file as UTF-8 (€, accented names). */
export const CSV_BOM = "﻿";
const CSV_LINE_BREAK = "\r\n";
export const NO_EXPENSES_TEXT = "No expenses";
export const SETTLED_UP_TEXT = "All settled up";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Plain number with a dot decimal separator, e.g. 1234.5 -> "1234.50". */
export function formatCsvAmount(amount: number): string {
  return round2(amount).toFixed(2);
}

/**
 * Quotes a cell when needed (comma, quote, line break). Text starting with
 * = + - @ is prefixed with ' so spreadsheet apps never run it as a formula.
 */
export function escapeCsvText(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function toCsv(rows: string[][]): string {
  return CSV_BOM + rows.map((row) => row.join(",")).join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The calendar day an expense was created on, in the viewer's time zone. */
function expenseDate(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? createdAt.slice(0, 10) : toDateString(date);
}

export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "group";
}

export function exportFileName(groupName: string, extension: "csv" | "pdf", now = new Date()): string {
  return `spliteasy-${slugify(groupName)}-${toDateString(now)}.${extension}`;
}

function nameLookup(members: ExportMember[]): (id: string) => string {
  const names: Record<string, string> = {};
  members.forEach((m) => {
    names[m.id] = getDisplayName(m);
  });
  return (id) => names[id] ?? "Former member";
}

export function computeGroupBalances(
  expenses: ExportExpense[],
  splits: ExportSplit[],
  settlements: ExportSettlement[]
): GroupBalances {
  const net: Record<string, number> = {};
  expenses.forEach((e) => {
    net[e.paid_by] = (net[e.paid_by] ?? 0) + Number(e.amount);
  });
  splits.forEach((s) => {
    net[s.user_id] = (net[s.user_id] ?? 0) - Number(s.amount_owed);
  });
  settlements.forEach((s) => {
    net[s.from_user] = (net[s.from_user] ?? 0) + Number(s.amount);
    net[s.to_user] = (net[s.to_user] ?? 0) - Number(s.amount);
  });

  const numericSplits = splits.map((s) => ({ ...s, amount_owed: Number(s.amount_owed) }));
  const numericSettlements = settlements.map((s) => ({ ...s, amount: Number(s.amount) }));

  return {
    detailed: computeDetailedBalances(expenses, numericSplits, numericSettlements),
    simplified: computeSettlements(net),
  };
}

/**
 * One row per expense: Date, Description, Amount, Currency, Paid by, then one
 * column per member with that member's share of the expense.
 */
export function buildExpensesCsv(
  group: ExportGroup,
  expenses: ExportExpense[],
  members: ExportMember[],
  splits: ExportSplit[]
): string {
  const nameOf = nameLookup(members);
  const header = ["Date", "Description", "Amount", "Currency", "Paid by", ...members.map((m) => nameOf(m.id))];

  if (expenses.length === 0) {
    return toCsv([header.map(escapeCsvText), [escapeCsvText(NO_EXPENSES_TEXT)]]);
  }

  const shares: Record<string, Record<string, number>> = {};
  splits.forEach((s) => {
    const byUser = (shares[s.expense_id] = shares[s.expense_id] ?? {});
    byUser[s.user_id] = (byUser[s.user_id] ?? 0) + Number(s.amount_owed);
  });

  const rows = expenses.map((e) => [
    expenseDate(e.created_at),
    escapeCsvText(e.description),
    formatCsvAmount(Number(e.amount)),
    group.currency,
    escapeCsvText(nameOf(e.paid_by)),
    ...members.map((m) => formatCsvAmount(shares[e.id]?.[m.id] ?? 0)),
  ]);

  return toCsv([header.map(escapeCsvText), ...rows]);
}

/** Current balances: every Detailed line, then the Simplified settlements. */
export function buildBalancesCsv(
  group: ExportGroup,
  balances: GroupBalances,
  members: ExportMember[]
): string {
  const nameOf = nameLookup(members);
  const section = (label: string, lines: BalanceLine[]) =>
    lines.length === 0
      ? [[label, escapeCsvText(SETTLED_UP_TEXT), "", "", ""]]
      : lines.map((line) => [
          label,
          escapeCsvText(nameOf(line.from)),
          escapeCsvText(nameOf(line.to)),
          formatCsvAmount(line.amount),
          group.currency,
        ]);

  return toCsv([
    ["Type", "From", "To", "Amount", "Currency"],
    ...section("Detailed", balances.detailed),
    ...section("Simplified", balances.simplified),
  ]);
}

/** Everything the one-page PDF shows, already formatted for display. */
export function buildGroupSummary(
  group: ExportGroup,
  expenses: ExportExpense[],
  members: ExportMember[],
  balances: GroupBalances,
  currentUserId: string | null,
  now = new Date()
): GroupSummary {
  const nameOf = nameLookup(members);
  const money = (amount: number) => formatMoney(amount, group.currency);
  const describe = (line: BalanceLine) => `${nameOf(line.from)} owes ${nameOf(line.to)}: ${money(line.amount)}`;

  const owedByMe = balances.simplified
    .filter((line) => line.from === currentUserId)
    .reduce((sum, line) => sum + line.amount, 0);
  const owedToMe = balances.simplified
    .filter((line) => line.to === currentUserId)
    .reduce((sum, line) => sum + line.amount, 0);
  const myNet = round2(owedToMe - owedByMe);

  const yourBalance =
    myNet === 0
      ? ["You're all settled up!"]
      : [
          ...(owedByMe > 0 ? [`You owe ${money(owedByMe)}`] : []),
          ...(owedToMe > 0 ? [`You are owed ${money(owedToMe)}`] : []),
          myNet > 0 ? `Net: you are owed ${money(myNet)}` : `Net: you owe ${money(Math.abs(myNet))}`,
        ];

  return {
    title: group.name,
    currency: group.currency,
    generatedOn: toDateString(now),
    yourBalance,
    detailed: balances.detailed.length ? balances.detailed.map(describe) : [SETTLED_UP_TEXT],
    simplified: balances.simplified.length ? balances.simplified.map(describe) : [SETTLED_UP_TEXT],
    expenseColumns: ["Date", "Description", "Paid by", "Amount"],
    expenseRows: expenses.length
      ? expenses.map((e) => [expenseDate(e.created_at), e.description, nameOf(e.paid_by), money(Number(e.amount))])
      : [[NO_EXPENSES_TEXT, "", "", ""]],
  };
}
