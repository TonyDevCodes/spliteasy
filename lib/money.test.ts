import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("formats EUR", () => {
    expect(formatMoney(12.5, "EUR")).toBe("€12.50");
  });

  it("formats USD", () => {
    expect(formatMoney(12.5, "USD")).toBe("$12.50");
  });

  it("formats GBP", () => {
    expect(formatMoney(12.5, "GBP")).toBe("£12.50");
  });

  it("formats ALL with no decimal places", () => {
    const result = formatMoney(1250, "ALL");
    expect(result).toContain("ALL");
    expect(result).toContain("1,250");
    expect(result).not.toContain(".");
  });

  it("formats negative amounts", () => {
    expect(formatMoney(-12.5, "EUR")).toBe("-€12.50");
  });

  it("formats zero", () => {
    expect(formatMoney(0, "EUR")).toBe("€0.00");
  });
});
