"use client";

import { useState } from "react";
import {
  canWriteOff,
  WRITE_OFF_CONFIRM_TEXT,
  WRITE_OFF_LABEL,
  type BalanceLine,
} from "@/lib/settlements";
import { EmptyState } from "@/components/EmptyState";
import { formatMoney } from "@/lib/money";
import { isDeletedUser, nameForUserId } from "@/lib/displayName";
import { recordSettlement, recordWriteOff } from "./actions";

type Props = {
  groupId: string;
  hasExpenses: boolean;
  detailedLines: BalanceLine[];
  simplifiedLines: BalanceLine[];
  nameById: Record<string, string>;
  currency: string;
  isAdmin: boolean;
};

export default function BalancesSection({
  groupId,
  hasExpenses,
  detailedLines,
  simplifiedLines,
  nameById,
  currency,
  isAdmin,
}: Props) {
  const [view, setView] = useState<"detailed" | "simplified">("detailed");
  const lines = view === "detailed" ? detailedLines : simplifiedLines;

  // The expenses list below already explains an empty group.
  if (!hasExpenses) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h2 className="text-sm font-semibold text-text">
        All balances in this group
      </h2>
      {(
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
            <EmptyState
              title="You're all settled up"
              description="No one owes anything in this group."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {lines.map((line, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-text">
                    {nameForUserId(line.from, nameById)} owes{" "}
                    {nameForUserId(line.to, nameById)}:{" "}
                    {formatMoney(line.amount, currency)}
                  </span>
                  {/* A settlement needs two existing users. */}
                  {!isDeletedUser(line.from) && !isDeletedUser(line.to) && (
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
                  )}
                  {/* Only admins can close a debt with a deleted user. */}
                  {canWriteOff(line, isAdmin) && (
                  <form
                    action={recordWriteOff}
                    onSubmit={(event) => {
                      if (!window.confirm(WRITE_OFF_CONFIRM_TEXT)) {
                        event.preventDefault();
                      }
                    }}
                  >
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
                      {WRITE_OFF_LABEL}
                    </button>
                  </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
