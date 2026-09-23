"use client";

import { useState } from "react";
import type { BalanceLine } from "@/lib/settlements";
import { formatMoney } from "@/lib/money";
import { recordSettlement } from "./actions";

type Props = {
  groupId: string;
  hasExpenses: boolean;
  detailedLines: BalanceLine[];
  simplifiedLines: BalanceLine[];
  nameById: Record<string, string>;
  currency: string;
};

export default function BalancesSection({
  groupId,
  hasExpenses,
  detailedLines,
  simplifiedLines,
  nameById,
  currency,
}: Props) {
  const [view, setView] = useState<"detailed" | "simplified">("detailed");
  const lines = view === "detailed" ? detailedLines : simplifiedLines;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h2 className="text-sm font-semibold text-text">
        All balances in this group
      </h2>
      {!hasExpenses ? (
        <p className="text-sm text-text-muted">
          No expenses yet.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setView("detailed")}
              className={`px-3 py-1.5 rounded-md text-sm ${
                view === "detailed"
                  ? "bg-primary text-on-primary"
                  : "bg-surface-hover text-text"
              }`}
            >
              Detailed
            </button>
            <button
              type="button"
              onClick={() => setView("simplified")}
              className={`px-3 py-1.5 rounded-md text-sm ${
                view === "simplified"
                  ? "bg-primary text-on-primary"
                  : "bg-surface-hover text-text"
              }`}
            >
              Simplified
            </button>
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-text-muted">
              All settled up!
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lines.map((line, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-text">
                    {nameById[line.from] ?? "Someone"} owes{" "}
                    {nameById[line.to] ?? "someone"}:{" "}
                    {formatMoney(line.amount, currency)}
                  </span>
                  <form action={recordSettlement}>
                    <input type="hidden" name="groupId" value={groupId} />
                    <input type="hidden" name="fromUser" value={line.from} />
                    <input type="hidden" name="toUser" value={line.to} />
                    <input
                      type="hidden"
                      name="amount"
                      value={line.amount.toFixed(2)}
                    />
                    <button
                      type="submit"
                      className="whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs font-medium text-text hover:bg-surface-hover"
                    >
                      Mark as settled
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
