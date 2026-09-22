import { describe, expect, it } from "vitest";
import { getDisplayName } from "./displayName";

describe("getDisplayName", () => {
  it("uses the display name when present", () => {
    expect(getDisplayName({ display_name: "Tony", email: "tony@example.com" })).toBe("Tony");
  });

  it("falls back to the email prefix when display name is null", () => {
    expect(getDisplayName({ display_name: null, email: "tonyrotterdam+test2@hotmail.com" })).toBe(
      "tonyrotterdam+test2"
    );
  });

  it("falls back to the email prefix when display name is blank", () => {
    expect(getDisplayName({ display_name: "   ", email: "someone@example.com" })).toBe("someone");
  });

  it("never returns the full email when a name is missing", () => {
    const result = getDisplayName({ display_name: null, email: "a@b.com" });
    expect(result).not.toContain("@");
  });
});
