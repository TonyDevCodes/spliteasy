import CategoryIcon from "@/components/CategoryIcon";
import { getCategory } from "@/lib/categories";
import { computeCategoryTotals, computeGrandTotal, formatPercent } from "@/lib/categoryTotals";
import { formatMoney } from "@/lib/money";

type Props = {
  expenses: { amount: number | string; description: string; category?: string | null }[];
  currency: string;
};

export default function CategoryStats({ expenses, currency }: Props) {
  if (expenses.length === 0) return null;

  const totals = computeCategoryTotals(expenses);
  const grandTotal = computeGrandTotal(expenses);
  const barLabel = totals.map((t) => `${t.label} ${formatPercent(t.percent)}`).join(", ");

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <h2 className="text-sm font-semibold text-text">Spending by category</h2>
      <p className="text-lg font-bold text-text">{formatMoney(grandTotal, currency)}</p>
      <div
        role="img"
        aria-label={`Spending by category: ${barLabel}`}
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
      >
        {totals.map((t) => (
          <span
            key={t.key}
            className="h-full"
            style={{ flex: `${t.total} 1 0%`, backgroundColor: t.color }}
          />
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {totals.map((t) => (
          <li key={t.key} className="flex items-center gap-3 text-sm">
            <CategoryIcon category={getCategory(t.key)} />
            <span className="flex min-w-0 flex-1 flex-col text-text">
              <span className="truncate font-medium">{t.label}</span>
              <span className="text-text-muted">
                {t.count} {t.count === 1 ? "expense" : "expenses"}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end text-text">
              <span className="whitespace-nowrap font-medium">{formatMoney(t.total, currency)}</span>
              <span className="text-text-muted">{formatPercent(t.percent)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
