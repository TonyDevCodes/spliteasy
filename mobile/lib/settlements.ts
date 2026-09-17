export type BalanceLine = {
  from: string;
  to: string;
  amount: number;
};

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
