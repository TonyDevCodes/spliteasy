import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CSV_BOM,
  buildBalancesCsv,
  buildExpensesCsv,
  buildGroupSummary,
  computeGroupBalances,
  escapeCsvText,
  exportFileName,
  slugify,
  type ExportExpense,
  type ExportMember,
  type ExportSplit,
} from "./export";

const group = { name: "Trip to Zürich", currency: "EUR" };

const members: ExportMember[] = [
  { id: "a", display_name: "Anna", email: "anna@example.com" },
  { id: "b", display_name: null, email: "bob.smith@example.com" },
  { id: "c", display_name: "José", email: "jose@example.com" },
];

const expenses: ExportExpense[] = [
  {
    id: "e1",
    paid_by: "a",
    amount: 90,
    description: 'Dinner, "the good one"\nwith dessert',
    created_at: "2026-09-20T12:00:00Z",
  },
  {
    id: "e2",
    paid_by: "b",
    amount: "10.5",
    description: "Taxi",
    created_at: "2026-09-21T12:00:00Z",
  },
];

// e1 is a custom split, e2 an equal split between a and b.
const splits: ExportSplit[] = [
  { expense_id: "e1", user_id: "a", amount_owed: 50 },
  { expense_id: "e1", user_id: "b", amount_owed: 25.5 },
  { expense_id: "e1", user_id: "c", amount_owed: 14.5 },
  { expense_id: "e2", user_id: "a", amount_owed: 5.25 },
  { expense_id: "e2", user_id: "b", amount_owed: "5.25" },
];

/** Minimal RFC 4180 parser, enough to check what a spreadsheet app would read. */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (quoted) {
      if (ch === '"' && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && csv[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else {
      cell += ch;
    }
  }
  return rows;
}

describe("buildExpensesCsv", () => {
  const csv = buildExpensesCsv(group, expenses, members, splits);
  const rows = parseCsv(csv.slice(CSV_BOM.length));

  it("starts with a UTF-8 BOM", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.charCodeAt(1)).not.toBe(0xfeff);
  });

  it("has the expected columns, one share column per member by display name", () => {
    expect(rows[0]).toEqual(["Date", "Description", "Amount", "Currency", "Paid by", "Anna", "bob.smith", "José"]);
  });

  it("never contains raw email addresses", () => {
    expect(csv).not.toContain("@example.com");
  });

  it("escapes commas, quotes and newlines in descriptions", () => {
    expect(csv).toContain('"Dinner, ""the good one""\nwith dessert"');
    expect(rows[1][1]).toBe('Dinner, "the good one"\nwith dessert');
    expect(rows[1]).toHaveLength(8);
  });

  it("writes plain dot-decimal amounts and the group currency", () => {
    expect(rows[1].slice(0, 5)).toEqual(["2026-09-20", rows[1][1], "90.00", "EUR", "Anna"]);
    expect(rows[2].slice(2, 5)).toEqual(["10.50", "EUR", "bob.smith"]);
  });

  it("lists each member's share, and the shares add up to the amount", () => {
    expect(rows[1].slice(5)).toEqual(["50.00", "25.50", "14.50"]);
    expect(rows[2].slice(5)).toEqual(["5.25", "5.25", "0.00"]);
    for (const row of rows.slice(1)) {
      const total = row.slice(5).reduce((sum, share) => sum + Number(share), 0);
      expect(total).toBeCloseTo(Number(row[2]), 2);
    }
  });

  it("exports a valid file with headers and a No expenses line for an empty group", () => {
    const empty = buildExpensesCsv(group, [], members, []);
    expect(empty.startsWith(CSV_BOM)).toBe(true);
    expect(parseCsv(empty.slice(1))).toEqual([
      ["Date", "Description", "Amount", "Currency", "Paid by", "Anna", "bob.smith", "José"],
      ["No expenses"],
    ]);
  });
});

describe("escapeCsvText", () => {
  it("leaves plain text alone", () => {
    expect(escapeCsvText("Taxi")).toBe("Taxi");
  });

  it("neutralises spreadsheet formulas", () => {
    expect(escapeCsvText("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvText("@cmd")).toBe("'@cmd");
  });
});

describe("buildBalancesCsv", () => {
  it("lists Detailed and Simplified balances with display names", () => {
    const balances = computeGroupBalances(expenses, splits, []);
    const rows = parseCsv(buildBalancesCsv(group, balances, members).slice(1));
    expect(rows[0]).toEqual(["Type", "From", "To", "Amount", "Currency"]);
    expect(rows).toContainEqual(["Detailed", "bob.smith", "Anna", "20.25", "EUR"]);
    expect(rows).toContainEqual(["Detailed", "José", "Anna", "14.50", "EUR"]);
    expect(rows.filter((r) => r[0] === "Simplified").length).toBeGreaterThan(0);
  });

  it("says All settled up when there is nothing to settle", () => {
    const csv = buildBalancesCsv(group, computeGroupBalances([], [], []), members);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(parseCsv(csv.slice(1))).toEqual([
      ["Type", "From", "To", "Amount", "Currency"],
      ["Detailed", "All settled up", "", "", ""],
      ["Simplified", "All settled up", "", "", ""],
    ]);
  });
});

describe("buildGroupSummary", () => {
  it("formats amounts with the group currency", () => {
    const summary = buildGroupSummary(
      { name: "US trip", currency: "USD" },
      expenses,
      members,
      computeGroupBalances(expenses, splits, []),
      "b"
    );
    expect(summary.expenseRows[0][3]).toBe("$90.00");
    expect(summary.yourBalance[0]).toBe("You owe $20.25");
  });

  it("handles an empty group", () => {
    const summary = buildGroupSummary(group, [], members, computeGroupBalances([], [], []), "a");
    expect(summary.expenseRows).toEqual([["No expenses", "", "", ""]]);
    expect(summary.yourBalance).toEqual(["You're all settled up!"]);
  });
});

describe("file names", () => {
  it("uses a slug of the group name and the date", () => {
    const now = new Date(2026, 8, 23);
    expect(exportFileName("Trip to Zürich!", "csv", now)).toBe("spliteasy-trip-to-zurich-2026-09-23.csv");
    expect(exportFileName("Test Mobile Group", "pdf", now)).toBe("spliteasy-test-mobile-group-2026-09-23.pdf");
    expect(slugify("🎉")).toBe("group");
  });
});

it("is identical in the mobile app", () => {
  const web = readFileSync(join(__dirname, "export.ts"), "utf8").replace(/\r\n/g, "\n");
  const mobile = readFileSync(join(__dirname, "..", "mobile", "lib", "export.ts"), "utf8").replace(/\r\n/g, "\n");
  expect(mobile).toBe(web);
});
