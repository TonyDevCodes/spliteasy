import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRecurringRow,
  frequencyLabel,
  isDueNow,
  isValidDateString,
  type RecurringInput,
} from "./recurring";

function input(overrides: Partial<RecurringInput> = {}): RecurringInput {
  return {
    groupId: "g1",
    createdBy: "u1",
    paidBy: "u1",
    description: "  Rent ",
    category: "home",
    amountCents: 1000,
    splits: [
      { userId: "u1", amountCents: 334 },
      { userId: "u2", amountCents: 333 },
      { userId: "u3", amountCents: 333 },
    ],
    frequency: "monthly",
    startDate: "2026-10-31",
    memberIds: ["u1", "u2", "u3"],
    ...overrides,
  };
}

describe("buildRecurringRow", () => {
  it("builds the row with two-decimal splits that sum to the amount", () => {
    expect(buildRecurringRow(input())).toEqual({
      ok: true,
      row: {
        group_id: "g1",
        paid_by: "u1",
        description: "Rent",
        category: "home",
        amount: 10,
        splits: [
          { user_id: "u1", amount_owed: 3.34 },
          { user_id: "u2", amount_owed: 3.33 },
          { user_id: "u3", amount_owed: 3.33 },
        ],
        frequency: "monthly",
        anchor_date: "2026-10-31",
        next_due: "2026-10-31",
        active: true,
        created_by: "u1",
      },
    });
  });

  it("keeps cent sums exact for awkward amounts", () => {
    const result = buildRecurringRow(
      input({
        amountCents: 1005,
        splits: [
          { userId: "u1", amountCents: 1 },
          { userId: "u2", amountCents: 1004 },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const cents = result.row.splits.reduce((s, x) => s + Math.round(x.amount_owed * 100), 0);
      expect(cents).toBe(1005);
      expect(result.row.amount).toBe(10.05);
    }
  });

  it("rejects splits that do not sum to the amount", () => {
    expect(buildRecurringRow(input({ amountCents: 1001 }))).toEqual({
      ok: false,
      error: "Split totals do not match expense amount",
    });
  });

  it("rejects a payer or split user outside the group", () => {
    expect(buildRecurringRow(input({ paidBy: "x" })).ok).toBe(false);
    expect(buildRecurringRow(input({ splits: [{ userId: "x", amountCents: 1000 }] })).ok).toBe(false);
  });

  it("rejects duplicate split users, bad amounts, frequency, date and description", () => {
    const dup = [
      { userId: "u1", amountCents: 500 },
      { userId: "u1", amountCents: 500 },
    ];
    expect(buildRecurringRow(input({ splits: dup })).ok).toBe(false);
    expect(buildRecurringRow(input({ amountCents: 0, splits: [{ userId: "u1", amountCents: 0 }] })).ok).toBe(false);
    expect(buildRecurringRow(input({ amountCents: 10.5 })).ok).toBe(false);
    expect(buildRecurringRow(input({ frequency: "daily" })).ok).toBe(false);
    expect(buildRecurringRow(input({ startDate: "2026-02-30" })).ok).toBe(false);
    expect(buildRecurringRow(input({ description: "  " })).ok).toBe(false);
    expect(buildRecurringRow(input({ splits: [] })).ok).toBe(false);
  });
});

describe("isValidDateString", () => {
  it("accepts real dates only", () => {
    expect(isValidDateString("2026-10-02")).toBe(true);
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("2026-1-2")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });
});

describe("isDueNow", () => {
  it("is true for today or the past", () => {
    expect(isDueNow("2026-10-02", "2026-10-02")).toBe(true);
    expect(isDueNow("2026-09-01", "2026-10-02")).toBe(true);
    expect(isDueNow("2026-10-03", "2026-10-02")).toBe(false);
  });
});

describe("frequencyLabel", () => {
  it("labels both frequencies", () => {
    expect(frequencyLabel("weekly")).toBe("Weekly");
    expect(frequencyLabel("monthly")).toBe("Monthly");
  });
});

it("is identical in the mobile app", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, ...parts), "utf8").replace(/\r\n/g, "\n");
  expect(read("..", "mobile", "lib", "recurring.ts")).toBe(read("recurring.ts"));
});
