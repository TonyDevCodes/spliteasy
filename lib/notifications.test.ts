import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";
import { buildNotificationMessage, formatBadgeCount, formatRelativeTime } from "./notifications";

describe("buildNotificationMessage", () => {
  it("describes an added expense with the group currency", () => {
    expect(
      buildNotificationMessage({
        type: "expense_added",
        payload: { actor_name: "Anna", description: "Dinner", amount: 42.5, currency: "EUR", group_name: "Trip" },
      })
    ).toBe('Anna added "Dinner" (€42.50) in Trip');
  });

  it("describes a settlement", () => {
    expect(
      buildNotificationMessage({
        type: "settlement_added",
        payload: { actor_name: "Bob", from_name: "Bob", to_name: "Anna", amount: "10", currency: "GBP", group_name: "Flat" },
      })
    ).toBe("Bob paid Anna £10.00 in Flat");
  });

  it("describes a new member", () => {
    expect(
      buildNotificationMessage({ type: "member_joined", payload: { member_name: "José", group_name: "Trip" } })
    ).toBe("José joined Trip");
  });

  it("describes a currency change", () => {
    expect(
      buildNotificationMessage({
        type: "currency_changed",
        payload: { actor_name: "Anna", group_name: "Trip", old_currency: "EUR", currency: "USD" },
      })
    ).toBe("Anna changed the currency of Trip from EUR to USD");
  });

  it("formats other currencies", () => {
    const message = (currency: string) =>
      buildNotificationMessage({ type: "expense_added", payload: { actor_name: "A", amount: 1234.5, currency } });
    expect(message("USD")).toBe("A added an expense ($1,234.50)");
    expect(message("ALL")).toBe(`A added an expense (${formatMoney(1234.5, "ALL")})`);
    expect(message("ALL")).toMatch(/ALL.1,235/);
    expect(message("XYZ1")).toBe("A added an expense (1234.50 XYZ1)");
  });

  it("falls back gracefully when payload fields are missing", () => {
    expect(buildNotificationMessage({ type: "expense_added", payload: {} })).toBe("Someone added an expense");
    expect(buildNotificationMessage({ type: "expense_added", payload: null })).toBe("Someone added an expense");
    expect(buildNotificationMessage({ type: "settlement_added", payload: { amount: 5 } })).toBe("Someone paid someone 5.00");
    expect(buildNotificationMessage({ type: "member_joined", payload: {} })).toBe("Someone joined your group");
    expect(buildNotificationMessage({ type: "currency_changed", payload: { group_name: "Trip" } })).toBe(
      "Someone changed the currency of Trip"
    );
    expect(
      buildNotificationMessage({ type: "expense_added", payload: { actor_name: "  ", amount: "abc", description: "" } })
    ).toBe("Someone added an expense");
    expect(buildNotificationMessage({ type: "something_new", payload: { group_name: "Trip" } })).toBe(
      "New activity in Trip"
    );
  });
});

describe("formatBadgeCount", () => {
  it("hides the badge at zero", () => {
    expect(formatBadgeCount(0)).toBeNull();
    expect(formatBadgeCount(-1)).toBeNull();
    expect(formatBadgeCount(Number.NaN)).toBeNull();
  });

  it("shows the count up to 9, then 9+", () => {
    expect(formatBadgeCount(1)).toBe("1");
    expect(formatBadgeCount(9)).toBe("9");
    expect(formatBadgeCount(10)).toBe("9+");
    expect(formatBadgeCount(250)).toBe("9+");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-23T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("uses short relative labels", () => {
    expect(formatRelativeTime(ago(20_000), now)).toBe("just now");
    expect(formatRelativeTime(ago(2 * 60_000), now)).toBe("2 min ago");
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe("3 h ago");
    expect(formatRelativeTime(ago(26 * 3_600_000), now)).toBe("yesterday");
    expect(formatRelativeTime(ago(4 * 86_400_000), now)).toBe("4 days ago");
  });

  it("falls back to the date after a week, and handles bad input", () => {
    expect(formatRelativeTime(ago(10 * 86_400_000), now)).toMatch(/^2026-09-1\d$/);
    expect(formatRelativeTime(ago(-60_000), now)).toBe("just now");
    expect(formatRelativeTime("not a date", now)).toBe("");
  });
});

it("is identical in the mobile app", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, ...parts), "utf8").replace(/\r\n/g, "\n");
  expect(read("..", "mobile", "lib", "notifications.ts")).toBe(read("notifications.ts"));
});
