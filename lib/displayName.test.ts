import { describe, expect, it } from "vitest";
import {
  DELETED_USER_KEY,
  DELETED_USER_NAME,
  getDisplayName,
  isDeletedUser,
  nameForUserId,
  userKey,
  validateDisplayNameInput,
} from "./displayName";

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

describe("validateDisplayNameInput", () => {
  it("trims leading and trailing spaces", () => {
    expect(validateDisplayNameInput("  Tony Test2  ")).toEqual({ ok: true, value: "Tony Test2" });
  });

  it("allows an empty value", () => {
    expect(validateDisplayNameInput("")).toEqual({ ok: true, value: null });
  });

  it("allows a value that is only whitespace, treating it as empty", () => {
    expect(validateDisplayNameInput("    ")).toEqual({ ok: true, value: null });
  });

  it("accepts a name exactly at the 40 character limit", () => {
    const name = "a".repeat(40);
    expect(validateDisplayNameInput(name)).toEqual({ ok: true, value: name });
  });

  it("rejects a name over the 40 character limit", () => {
    const name = "a".repeat(41);
    const result = validateDisplayNameInput(name);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("40");
    }
  });

  it("checks the length limit after trimming, not before", () => {
    const name = `  ${"a".repeat(40)}  `;
    expect(validateDisplayNameInput(name)).toEqual({ ok: true, value: "a".repeat(40) });
  });
});

describe("deleted users", () => {
  it("shows a missing profile as Deleted user", () => {
    expect(DELETED_USER_NAME).toBe("Deleted user");
    expect(getDisplayName(null)).toBe("Deleted user");
    expect(getDisplayName(undefined)).toBe("Deleted user");
  });

  it("names user ids, with Deleted user for null references", () => {
    const names = { u1: "Anna" };
    expect(nameForUserId("u1", names)).toBe("Anna");
    expect(nameForUserId(null, names)).toBe("Deleted user");
    expect(nameForUserId(undefined, names)).toBe("Deleted user");
    expect(nameForUserId(DELETED_USER_KEY, names)).toBe("Deleted user");
    expect(nameForUserId("left-the-group", names)).toBe("Former member");
  });

  it("maps null ids to one balance key", () => {
    expect(userKey(null)).toBe(DELETED_USER_KEY);
    expect(userKey("u1")).toBe("u1");
    expect(isDeletedUser(null)).toBe(true);
    expect(isDeletedUser(DELETED_USER_KEY)).toBe(true);
    expect(isDeletedUser("u1")).toBe(false);
  });
});
