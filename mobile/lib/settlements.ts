import { userKey } from "./displayName";

export type BalanceLine = {
  from: string;
  to: string;
  amount: number;
};

// User ids are NULL when that user was deleted; userKey() groups those
// references under DELETED_USER_KEY so the remaining balances stay correct.
type ExpenseInput = { id: string; paid_by: string | null };
type SplitInput = { expense_id: string; user_id: string | null; amount_owed: number | string };
type SettlementInput = { from_user: string | null; to_user: string | null; amount: number | string };

/** Net balance per user: positive = is owed money, negative = owes money. */
export function computeNetBalances(
  expenses: (ExpenseInput & { amount: number | string })[],
  splits: SplitInput[],
  settlements: SettlementInput[]
): Record<string, number> {
  const net: Record<string, number> = {};
  const addTo = (id: string | null, amount: number) => {
    const key = userKey(id);
    net[key] = (net[key] ?? 0) + amount;
  };
  expenses.forEach((e) => addTo(e.paid_by, Number(e.amount)));
  splits.forEach((s) => addTo(s.user_id, -Number(s.amount_owed)));
  settlements.forEach((s) => {
    addTo(s.from_user, Number(s.amount));
    addTo(s.to_user, -Number(s.amount));
  });
  return net;
}

/**
 * Direct per-pair debts derived straight from the ledger (expenses + splits,
 * reduced by settlements), without netting across different people. Unlike
 * computeSettlements, this can produce more than n-1 lines (e.g. a debt
 * cycle A -> B -> C -> A stays as three lines instead of being optimized away).
 */
export function computeDetailedBalances(
  expenses: ExpenseInput[],
  splits: SplitInput[],
  settlements: SettlementInput[]
): BalanceLine[] {
  const paidByById: Record<string, string> = {};
  expenses.forEach((e) => {
    paidByById[e.id] = userKey(e.paid_by);
  });

  const owed: Record<string, number> = {};
  const add = (debtor: string, creditor: string, amount: number) => {
    if (debtor === creditor || !amount) return;
    const key = `${debtor}|${creditor}`;
    owed[key] = (owed[key] ?? 0) + amount;
  };

  splits.forEach((s) => {
    const payer = paidByById[s.expense_id];
    if (!payer) return;
    add(userKey(s.user_id), payer, Number(s.amount_owed));
  });

  settlements.forEach((s) => {
    add(userKey(s.from_user), userKey(s.to_user), -Number(s.amount));
  });

  const lines: BalanceLine[] = [];
  const seenPairs = new Set<string>();

  Object.keys(owed).forEach((key) => {
    const [a, b] = key.split("|");
    const pairKey = [a, b].sort().join("|");
    if (seenPairs.has(pairKey)) return;
    seenPairs.add(pairKey);

    const aOwesB = owed[`${a}|${b}`] ?? 0;
    const bOwesA = owed[`${b}|${a}`] ?? 0;
    const net = Math.round((aOwesB - bOwesA) * 100) / 100;

    if (net > 0.005) lines.push({ from: a, to: b, amount: net });
    else if (net < -0.005) lines.push({ from: b, to: a, amount: -net });
  });

  return lines;
}

export function computeSettlements(net: Record<string, number>): BalanceLine[] {
  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  for (const [id, amount] of Object.entries(net)) {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded > 0.005) creditors.push({ id, amount: rounded });
    else if (rounded < -0.005) debtors.push({ id, amount: -rounded });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const lines: BalanceLine[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settled = Math.min(debtor.amount, creditor.amount);

    lines.push({ from: debtor.id, to: creditor.id, amount: settled });

    debtor.amount -= settled;
    creditor.amount -= settled;

    if (debtor.amount <= 0.005) i++;
    if (creditor.amount <= 0.005) j++;
  }

  return lines;
}
