"use client";

import { useState } from "react";
import type { BalanceLine } from "@/lib/settlements";
import { recordSettlement } from "./actions";

type Props = {
  groupId: string;
  hasExpenses: boolean;
  detailedLines: BalanceLine[];
  simplifiedLines: BalanceLine[];
  nameById: Record<string, string>;
};

export default function BalancesSection({
  groupId,
  hasExpenses,
  detailedLines,
  simplifiedLines,
  nameById,
}: Props) {
  const [view, setView] = useState<"detailed" | "simplified">("detailed");
  const lines = view === "detailed" ? detailedLines : simplifiedLines;

  return (
    <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
        All balances in this group
      </h2>
      {!hasExpenses ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
                  ? "bg-black text-white"
                  : "bg-zinc-100 text-black"
              }`}
            >
              Detailed
            </button>
            <button
              type="button"
              onClick={() => setView("simplified")}
              className={`px-3 py-1.5 rounded-md text-sm ${
                view === "simplified"
                  ? "bg-black text-white"
                  : "bg-zinc-100 text-black"
              }`}
            >
              Simplified
            </button>
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              All settled up!
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lines.map((line, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {nameById[line.from] ?? "Someone"} owes{" "}
                    {nameById[line.to] ?? "someone"}: €
                    {line.amount.toFixed(2)}
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
                      className="whitespace-nowrap rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
