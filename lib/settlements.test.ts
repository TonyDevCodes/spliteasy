import { describe, expect, it } from "vitest";
import { computeDetailedBalances, computeSettlements } from "./settlements";

type RawExpense = { id: string; paid_by: string; amount: number };
type RawSplit = { expense_id: string; user_id: string; amount_owed: number };
type RawSettlement = { from_user: string; to_user: string; amount: number };

function netFromLedger(
  expenses: RawExpense[],
  splits: RawSplit[],
  settlements: RawSettlement[]
): Record<string, number> {
  const net: Record<string, number> = {};

  expenses.forEach((e) => {
    net[e.paid_by] = (net[e.paid_by] ?? 0) + e.amount;
  });
  splits.forEach((s) => {
    net[s.user_id] = (net[s.user_id] ?? 0) - s.amount_owed;
  });
  settlements.forEach((s) => {
    net[s.from_user] = (net[s.from_user] ?? 0) + s.amount;
    net[s.to_user] = (net[s.to_user] ?? 0) - s.amount;
  });

  return net;
}

function netPerPerson(lines: { from: string; to: string; amount: number }[]) {
  const net: Record<string, number> = {};
  lines.forEach((l) => {
    net[l.from] = (net[l.from] ?? 0) - l.amount;
    net[l.to] = (net[l.to] ?? 0) + l.amount;
  });
  return net;
}

describe("2 people, 1 debt", () => {
  it("Detailed and Simplified are identical", () => {
    const expenses: RawExpense[] = [{ id: "e1", paid_by: "B", amount: 10 }];
    const splits: RawSplit[] = [{ expense_id: "e1", user_id: "A", amount_owed: 10 }];

    const detailed = computeDetailedBalances(expenses, splits, []);
    const net = netFromLedger(expenses, splits, []);
    const simplified = computeSettlements(net);

    expect(detailed).toEqual([{ from: "A", to: "B", amount: 10 }]);
    expect(simplified).toEqual(detailed);
  });
});

describe("chain: A owes B 10, B owes C 10", () => {
  it("simplifies to a single A -> C transfer of 10", () => {
    const net = { A: -10, B: 0, C: 10 };
    const simplified = computeSettlements(net);

    expect(simplified).toEqual([{ from: "A", to: "C", amount: 10 }]);
  });
});

describe("circle: A owes B 10, B owes C 10, C owes A 10", () => {
  it("simplifies to zero transfers", () => {
    const net = { A: 0, B: 0, C: 0 };
    const simplified = computeSettlements(net);

    expect(simplified).toEqual([]);
  });

  it("detailed view still shows the three raw debts", () => {
    const expenses: RawExpense[] = [
      { id: "e1", paid_by: "B", amount: 10 },
      { id: "e2", paid_by: "C", amount: 10 },
      { id: "e3", paid_by: "A", amount: 10 },
    ];
    const splits: RawSplit[] = [
      { expense_id: "e1", user_id: "A", amount_owed: 10 },
      { expense_id: "e2", user_id: "B", amount_owed: 10 },
      { expense_id: "e3", user_id: "C", amount_owed: 10 },
    ];

    const detailed = computeDetailedBalances(expenses, splits, []);
    expect(detailed).toHaveLength(3);
  });
});

describe("4 people, mixed debts", () => {
  it("preserves each person's net movement and never needs more transfers than the detailed view", () => {
    const expenses: RawExpense[] = [
      { id: "e1", paid_by: "B", amount: 20 }, // A owes B 20
      { id: "e2", paid_by: "D", amount: 20 }, // C owes D 20
      { id: "e3", paid_by: "C", amount: 15 }, // B owes C 15
    ];
    const splits: RawSplit[] = [
      { expense_id: "e1", user_id: "A", amount_owed: 20 },
      { expense_id: "e2", user_id: "C", amount_owed: 20 },
      { expense_id: "e3", user_id: "B", amount_owed: 15 },
    ];

    const trueNet = netFromLedger(expenses, splits, []);
    const detailed = computeDetailedBalances(expenses, splits, []);
    const simplified = computeSettlements(trueNet);

    expect(netPerPerson(detailed)).toEqual(trueNet);
    expect(netPerPerson(simplified)).toEqual(trueNet);
    expect(simplified.length).toBeLessThanOrEqual(detailed.length);
  });
});

describe("decimal splits", () => {
  it("33.33 / 33.33 / 33.34 leaves no 0.01 ghost debts", () => {
    const net = { A: 66.67, B: -33.33, C: -33.34 };
    const simplified = computeSettlements(net);

    const total = simplified.reduce((sum, l) => sum + l.amount, 0);
    expect(Math.round(total * 100) / 100).toBe(66.67);
    simplified.forEach((l) => {
      expect(l.amount).toBeGreaterThan(0.005);
    });
    expect(netPerPerson(simplified)).toEqual(net);
  });
});

describe("empty group", () => {
  it("computeSettlements returns an empty result for no expenses", () => {
    expect(computeSettlements({})).toEqual([]);
  });

  it("computeDetailedBalances returns an empty result and does not crash", () => {
    expect(computeDetailedBalances([], [], [])).toEqual([]);
  });
});
