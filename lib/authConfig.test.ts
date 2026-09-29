import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoCredentials, isFlagEnabled, nextStepAfterSignUp } from "./authConfig";

describe("nextStepAfterSignUp", () => {
  it("enters the app when signUp returned a session (email confirmation off)", () => {
    const session = { access_token: "t", user: { id: "u1" } };
    expect(nextStepAfterSignUp(session)).toBe("enter-app");
  });

  it("asks to confirm the email when there is no session (confirmation on)", () => {
    expect(nextStepAfterSignUp(null)).toBe("confirm-email");
    expect(nextStepAfterSignUp(undefined)).toBe("confirm-email");
  });
});

describe("isFlagEnabled", () => {
  it("is off by default", () => {
    expect(isFlagEnabled(undefined)).toBe(false);
    expect(isFlagEnabled(null)).toBe(false);
    expect(isFlagEnabled("")).toBe(false);
    expect(isFlagEnabled("false")).toBe(false);
    expect(isFlagEnabled("0")).toBe(false);
  });

  it("accepts common truthy spellings", () => {
    expect(isFlagEnabled("true")).toBe(true);
    expect(isFlagEnabled(" TRUE ")).toBe(true);
    expect(isFlagEnabled("1")).toBe(true);
    expect(isFlagEnabled("yes")).toBe(true);
    expect(isFlagEnabled("on")).toBe(true);
  });
});

describe("demoCredentials", () => {
  it("returns trimmed credentials when both are set", () => {
    expect(demoCredentials(" demo@example.com ", " secret ")).toEqual({
      email: "demo@example.com",
      password: "secret",
    });
  });

  it("returns null when either is missing", () => {
    expect(demoCredentials(undefined, "secret")).toBeNull();
    expect(demoCredentials("demo@example.com", "")).toBeNull();
    expect(demoCredentials(null, null)).toBeNull();
  });
});

it("is identical in the mobile app", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, ...parts), "utf8").replace(/\r\n/g, "\n");
  expect(read("..", "mobile", "lib", "authConfig.ts")).toBe(read("authConfig.ts"));
});
