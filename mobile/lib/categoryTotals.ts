// Spending per category for a list of expenses.
// mobile/lib/categoryTotals.ts is an identical copy of this file.

import { categoryForExpense } from "./categories";

type ExpenseInput = {
  amount: number | string;
  description: string;
  category?: string | null;
};

export type CategoryTotal = {
  key: string;
  label: string;
  color: string;
  total: number;
  count: number;
  /** Share of the grand total, rounded to one decimal (0-100). */
  percent: number;
};

// Amounts are summed as whole cents so sums like 0.1 + 0.2 stay exact.
function toCents(amount: number | string): number {
  const value = Number(amount);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** Sum of all expense amounts, rounded to cents. */
export function computeGrandTotal(expenses: ExpenseInput[]): number {
  return expenses.reduce((sum, e) => sum + toCents(e.amount), 0) / 100;
}

/** Totals per category, largest first. Categories without expenses are left out. */
export function computeCategoryTotals(expenses: ExpenseInput[]): CategoryTotal[] {
  const groups = new Map<string, { label: string; color: string; cents: number; count: number }>();
  let grandCents = 0;

  for (const expense of expenses) {
    const category = categoryForExpense(expense);
    const cents = toCents(expense.amount);
    const group = groups.get(category.key) ?? { label: category.label, color: category.color, cents: 0, count: 0 };
    group.cents += cents;
    group.count += 1;
    groups.set(category.key, group);
    grandCents += cents;
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      color: group.color,
      total: group.cents / 100,
      count: group.count,
      percent: grandCents > 0 ? Math.round((group.cents / grandCents) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}
