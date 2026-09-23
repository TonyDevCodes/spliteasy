"use client";

import { useRef, useState } from "react";
import {
  buildBalancesCsv,
  buildExpensesCsv,
  buildGroupSummary,
  computeGroupBalances,
  exportFileName,
  type ExportExpense,
  type ExportGroup,
  type ExportMember,
  type ExportSettlement,
  type ExportSplit,
} from "@/lib/export";

type Props = {
  group: ExportGroup;
  expenses: ExportExpense[];
  splits: ExportSplit[];
  settlements: ExportSettlement[];
  members: ExportMember[];
  currentUserId: string;
};

type ExportKind = "expenses-csv" | "balances-csv" | "pdf";

const OPTIONS: { kind: ExportKind; label: string }[] = [
  { kind: "expenses-csv", label: "CSV (expenses)" },
  { kind: "balances-csv", label: "CSV (balances)" },
  { kind: "pdf", label: "PDF summary" },
];

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ExportMenu({ group, expenses, splits, settlements, members, currentUserId }: Props) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(kind: ExportKind) {
    menuRef.current?.removeAttribute("open");
    setBusy(true);
    setError(null);

    try {
      const balances = computeGroupBalances(expenses, splits, settlements);

      if (kind === "pdf") {
        const { buildSummaryPdf } = await import("@/lib/exportPdf");
        const summary = buildGroupSummary(group, expenses, settlements, members, balances, currentUserId);
        download(await buildSummaryPdf(summary), exportFileName(group.name, "pdf"));
      } else {
        const csv =
          kind === "expenses-csv"
            ? buildExpensesCsv(group, expenses, members, splits)
            : buildBalancesCsv(group, balances, members, settlements);
        download(new Blob([csv], { type: "text/csv;charset=utf-8" }), exportFileName(group.name, "csv"));
      }
    } catch (err) {
      console.error("Export error:", err);
      setError("Export failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <details ref={menuRef} className="relative">
        <summary
          className={`cursor-pointer list-none rounded-md border border-border px-3 py-1 text-sm font-medium text-text hover:bg-surface-hover [&::-webkit-details-marker]:hidden ${
            busy ? "pointer-events-none text-on-disabled bg-disabled" : ""
          }`}
          aria-disabled={busy}
        >
          {busy ? "Exporting…" : "Export ▾"}
        </summary>
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 flex w-44 flex-col overflow-hidden rounded-md border border-border bg-surface shadow-lg"
        >
          {OPTIONS.map((option) => (
            <button
              key={option.kind}
              type="button"
              role="menuitem"
              onClick={() => handleExport(option.kind)}
              className="px-3 py-2 text-left text-sm text-text hover:bg-surface-hover"
            >
              {option.label}
            </button>
          ))}
        </div>
      </details>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
