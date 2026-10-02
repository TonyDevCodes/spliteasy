import { describe, expect, it } from "vitest";
import { groupActivityByDay, toActivityItem, toActivityItems, type ActivityRow } from "./activity";

function row(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    group_id: "g1",
    kind: "expense",
    ref_id: "r1",
    actor_id: "u1",
    amount: 12.5,
    currency: "EUR",
    title: "Pizza",
    created_at: "2026-10-01T12:00:00Z",
    ...overrides,
  };
}

function item(overrides: Partial<ActivityRow> = {}) {
  const mapped = toActivityItem(row(overrides));
  if (!mapped) throw new Error("expected an item");
  return mapped;
}

describe("toActivityItem", () => {
  it("maps an expense row", () => {
    expect(toActivityItem(row())).toEqual({
      id: "expense:r1",
      groupId: "g1",
      kind: "expense",
      refId: "r1",
      actorId: "u1",
      amount: 12.5,
      currency: "EUR",
      title: "Pizza",
      isWriteOff: false,
      createdAt: "2026-10-01T12:00:00Z",
    });
  });

  it("maps a settlement row and parses a string amount", () => {
    const mapped = toActivityItem(row({ kind: "settlement", ref_id: "s1", title: "payment", amount: "30.00" }));
    expect(mapped).toMatchObject({
      id: "settlement:s1",
      kind: "settlement",
      amount: 30,
      title: "Payment",
      isWriteOff: false,
    });
  });

  it("marks a write-off and keeps a deleted actor as null", () => {
    const mapped = toActivityItem(row({ kind: "settlement", title: "write_off", actor_id: null }));
    expect(mapped).toMatchObject({ title: "Write-off", isWriteOff: true, actorId: null });
  });

  it("falls back to a generic title for a blank expense description", () => {
    expect(toActivityItem(row({ title: "  " }))?.title).toBe("Expense");
    expect(toActivityItem(row({ title: null }))?.title).toBe("Expense");
  });

  it("returns null for an unknown kind", () => {
    expect(toActivityItem(row({ kind: "comment" }))).toBeNull();
  });
});

describe("toActivityItems", () => {
  it("drops unknown rows", () => {
    expect(toActivityItems([row(), row({ kind: "other", ref_id: "x" })])).toHaveLength(1);
  });
});

describe("groupActivityByDay", () => {
  it("returns an empty list for no items", () => {
    expect(groupActivityByDay([], "UTC")).toEqual([]);
  });

  it("groups a single expense under its day", () => {
    const days = groupActivityByDay([item()], "UTC");
    expect(days).toHaveLength(1);
    expect(days[0].day).toBe("2026-10-01");
    expect(days[0].items[0].id).toBe("expense:r1");
  });

  it("groups a single settlement under its day", () => {
    const days = groupActivityByDay([item({ kind: "settlement", ref_id: "s1", title: "payment" })], "UTC");
    expect(days).toHaveLength(1);
    expect(days[0].items[0].kind).toBe("settlement");
  });

  it("puts items of the same day together", () => {
    const days = groupActivityByDay(
      [
        item({ ref_id: "a", created_at: "2026-10-01T08:00:00Z" }),
        item({ kind: "settlement", ref_id: "b", created_at: "2026-10-01T20:00:00Z" }),
      ],
      "UTC",
    );
    expect(days).toHaveLength(1);
    expect(days[0].items).toHaveLength(2);
  });

  it("orders days and items newest first", () => {
    const days = groupActivityByDay(
      [
        item({ ref_id: "old", created_at: "2026-09-29T10:00:00Z" }),
        item({ ref_id: "early", created_at: "2026-10-01T08:00:00Z" }),
        item({ ref_id: "late", created_at: "2026-10-01T20:00:00Z" }),
        item({ ref_id: "mid", created_at: "2026-09-30T10:00:00Z" }),
      ],
      "UTC",
    );
    expect(days.map((d) => d.day)).toEqual(["2026-10-01", "2026-09-30", "2026-09-29"]);
    expect(days[0].items.map((i) => i.refId)).toEqual(["late", "early"]);
  });

  it("uses the given time zone to decide the day", () => {
    const items = [item({ created_at: "2026-10-01T23:30:00Z" })];
    expect(groupActivityByDay(items, "UTC")[0].day).toBe("2026-10-01");
    expect(groupActivityByDay(items, "Europe/Amsterdam")[0].day).toBe("2026-10-02");
  });

  it("drops items with an invalid timestamp", () => {
    expect(groupActivityByDay([item({ created_at: "nope" })], "UTC")).toEqual([]);
  });
});
