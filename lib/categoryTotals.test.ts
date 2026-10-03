import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeCategoryTotals, computeGrandTotal, formatPercent } from "./categoryTotals";

function exp(amount: number | string, description: string, category: string | null = null) {
  return { amount, description, category };
}

describe("computeCategoryTotals", () => {
  it("returns an empty list for no expenses", () => {
    expect(computeCategoryTotals([])).toEqual([]);
    expect(computeGrandTotal([])).toBe(0);
  });

  it("handles a single expense", () => {
    expect(computeCategoryTotals([exp(12.5, "Pizza", "food")])).toEqual([
      { key: "food", label: "Food & drinks", color: "#F59E0B", total: 12.5, count: 1, percent: 100 },
    ]);
  });

  it("uses the stored category over the description", () => {
    const [result] = computeCategoryTotals([exp(20, "Pizza", "travel")]);
    expect(result.key).toBe("travel");
  });

  it("infers a null category from the description", () => {
    const [result] = computeCategoryTotals([exp(9, "Taxi to airport", null)]);
    expect(result.key).toBe("transport");
  });

  it("falls back to other for an unknown category", () => {
    const [result] = computeCategoryTotals([exp(5, "Pizza", "nonsense")]);
    expect(result.key).toBe("other");
    expect(result.label).toBe("Other");
  });

  it("sums in cents so float errors do not show", () => {
    const [result] = computeCategoryTotals([exp(0.1, "a", "food"), exp(0.2, "b", "food")]);
    expect(result.total).toBe(0.3);
    expect(result.count).toBe(2);
    expect(computeGrandTotal([exp(0.1, "a"), exp(0.2, "b")])).toBe(0.3);
  });

  it("accepts string amounts", () => {
    const [result] = computeCategoryTotals([exp("10.10", "a", "bills"), exp("0.20", "b", "bills")]);
    expect(result.total).toBe(10.3);
  });

  it("sorts by total, largest first", () => {
    const result = computeCategoryTotals([
      exp(5, "a", "food"),
      exp(50, "b", "housing"),
      exp(20, "c", "transport"),
      exp(10, "d", "food"),
    ]);
    expect(result.map((r) => r.key)).toEqual(["housing", "transport", "food"]);
  });

  it("skips categories without expenses", () => {
    const result = computeCategoryTotals([exp(5, "a", "food"), exp(5, "b", "bills")]);
    expect(result).toHaveLength(2);
  });

  it("computes percents rounded to one decimal", () => {
    const result = computeCategoryTotals([exp(1, "a", "food"), exp(1, "b", "bills"), exp(1, "c", "travel")]);
    expect(result.map((r) => r.percent)).toEqual([33.3, 33.3, 33.3]);

    const split = computeCategoryTotals([exp(75, "a", "food"), exp(25, "b", "bills")]);
    expect(split.map((r) => r.percent)).toEqual([75, 25]);
  });

  it("gives 0 percent when the grand total is zero", () => {
    expect(computeCategoryTotals([exp(0, "a", "food")])[0].percent).toBe(0);
  });
});

describe("formatPercent", () => {
  it("always shows one decimal", () => {
    expect(formatPercent(9)).toBe("9.0%");
    expect(formatPercent(62.8)).toBe("62.8%");
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(100)).toBe("100.0%");
  });
});

it("is identical in the mobile app", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, ...parts), "utf8").replace(/\r\n/g, "\n");
  expect(read("..", "mobile", "lib", "categoryTotals.ts")).toBe(read("categoryTotals.ts"));
});
