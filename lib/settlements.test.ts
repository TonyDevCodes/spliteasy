import { describe, expect, it } from "vitest";
import {
  buildWriteOffRow,
  canWriteOff,
  computeDetailedBalances,
  computeNetBalances,
  computeSettlements,
  type BalanceLine,
} from "./settlements";
import { DELETED_USER_KEY } from "./displayName";

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

describe("deleted users (null references)", () => {
  // test2 paid 60 (split with mobiletest), then the deleted user paid 60
  // (split with test3), and test3 settled 10 with the deleted user.
  const expenses = [
    { id: "e1", paid_by: "test2", amount: 60 },
    { id: "e2", paid_by: null, amount: 60 },
  ];
  const splits = [
    { expense_id: "e1", user_id: "test2", amount_owed: 30 },
    { expense_id: "e1", user_id: "mobiletest", amount_owed: 30 },
    { expense_id: "e2", user_id: null, amount_owed: 30 },
    { expense_id: "e2", user_id: "test3", amount_owed: 30 },
  ];
  const settlements = [{ from_user: "test3", to_user: null, amount: 10 }];

  it("keeps everyone else's balances unchanged", () => {
    const net = computeNetBalances(expenses, splits, settlements);
    expect(net).toEqual({ test2: 30, mobiletest: -30, [DELETED_USER_KEY]: 20, test3: -20 });
    expect(Object.values(net).reduce((a, b) => a + b, 0)).toBeCloseTo(0, 2);
  });

  it("shows debts to a deleted user under one key", () => {
    const detailed = computeDetailedBalances(expenses, splits, settlements);
    expect(detailed).toContainEqual({ from: "mobiletest", to: "test2", amount: 30 });
    expect(detailed).toContainEqual({ from: "test3", to: DELETED_USER_KEY, amount: 20 });
    expect(detailed).toHaveLength(2);
  });
});

describe("write-offs of debts with deleted users", () => {
  // A deleted user paid 60 for a and b; b paid 90 for a (30) and the deleted user (60).
  // Lines: a owes deleted 30, deleted owes b 30, a owes b 30.
  const expenses = [
    { id: "e1", paid_by: null, amount: 60 },
    { id: "e2", paid_by: "b", amount: 90 },
  ];
  const splits = [
    { expense_id: "e1", user_id: "a", amount_owed: 30 },
    { expense_id: "e1", user_id: "b", amount_owed: 30 },
    { expense_id: "e2", user_id: "a", amount_owed: 30 },
    { expense_id: "e2", user_id: null, amount_owed: 60 },
  ];

  function linesWith(settlements: { from_user: string | null; to_user: string | null; amount: number; kind?: string }[]) {
    return {
      detailed: computeDetailedBalances(expenses, splits, settlements),
      simplified: computeSettlements(computeNetBalances(expenses, splits, settlements)),
    };
  }

  function withDeleted(lines: BalanceLine[]) {
    return lines.filter((l) => l.from === DELETED_USER_KEY || l.to === DELETED_USER_KEY);
  }

  it("closes a debt the deleted user owed", () => {
    const before = linesWith([]);
    const line = before.detailed.find((l) => l.from === DELETED_USER_KEY)!;
    expect(line).toEqual({ from: DELETED_USER_KEY, to: "b", amount: 30 });

    const row = buildWriteOffRow("g1", line);
    expect(row).toEqual({ group_id: "g1", from_user: null, to_user: "b", amount: 30, kind: "write_off" });

    const after = linesWith([row]);
    expect(after.detailed.find((l) => l.from === DELETED_USER_KEY)).toBeUndefined();
    expect(after.detailed).toContainEqual({ from: "a", to: DELETED_USER_KEY, amount: 30 });
    expect(after.detailed).toContainEqual({ from: "a", to: "b", amount: 30 });
  });

  it("closes a debt owed to the deleted user", () => {
    const before = linesWith([]);
    const line = before.detailed.find((l) => l.to === DELETED_USER_KEY)!;
    expect(line).toEqual({ from: "a", to: DELETED_USER_KEY, amount: 30 });

    const row = buildWriteOffRow("g1", line);
    expect(row.from_user).toBe("a");
    expect(row.to_user).toBeNull();

    const after = linesWith([row]);
    expect(after.detailed.find((l) => l.to === DELETED_USER_KEY)).toBeUndefined();
    expect(after.detailed).toContainEqual({ from: DELETED_USER_KEY, to: "b", amount: 30 });
  });

  it("makes the group fully settled once every deleted-user line is written off and the rest is paid", () => {
    const writeOffs = withDeleted(linesWith([]).detailed).map((l) => buildWriteOffRow("g1", l));
    expect(writeOffs).toHaveLength(2);
    const remaining = linesWith(writeOffs).detailed;
    expect(withDeleted(remaining)).toEqual([]);
    const payments = remaining.map((l) => ({ from_user: l.from, to_user: l.to, amount: l.amount, kind: "payment" }));
    const settled = linesWith([...writeOffs, ...payments]);
    expect(settled.detailed).toEqual([]);
    expect(settled.simplified).toEqual([]);
  });

  it("leaves the rest of the debt after a partial write-off", () => {
    const after = linesWith([{ from_user: null, to_user: "b", amount: 12.5, kind: "write_off" }]);
    expect(after.detailed).toContainEqual({ from: DELETED_USER_KEY, to: "b", amount: 17.5 });
  });

  it("offers the write-off only to admins, and only on lines with exactly one deleted side", () => {
    const deletedOwes: BalanceLine = { from: DELETED_USER_KEY, to: "b", amount: 30 };
    const owedToDeleted: BalanceLine = { from: "a", to: DELETED_USER_KEY, amount: 30 };
    const normal: BalanceLine = { from: "a", to: "b", amount: 30 };

    expect(canWriteOff(deletedOwes, true)).toBe(true);
    expect(canWriteOff(owedToDeleted, true)).toBe(true);
    expect(canWriteOff(normal, true)).toBe(false);

    expect(canWriteOff(deletedOwes, false)).toBe(false);
    expect(canWriteOff(owedToDeleted, false)).toBe(false);
    expect(canWriteOff(normal, false)).toBe(false);
  });
});
