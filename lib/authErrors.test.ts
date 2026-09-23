import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AuthApiError,
  AuthInvalidTokenResponseError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { isTransientAuthError } from "./authErrors";

describe("isTransientAuthError", () => {
  it("treats network and server failures as transient", () => {
    expect(isTransientAuthError(new AuthRetryableFetchError("Failed to fetch", 0))).toBe(true);
    expect(isTransientAuthError(new AuthApiError("Too many requests", 429, "over_request_rate_limit"))).toBe(true);
    expect(isTransientAuthError(new AuthApiError("Bad gateway", 502, undefined))).toBe(true);
    expect(isTransientAuthError(new TypeError("Network request failed"))).toBe(true);
    // A malformed token response from the server (status 500) is not a sign-out.
    expect(isTransientAuthError(new AuthInvalidTokenResponseError())).toBe(true);
  });

  it("treats a missing or rejected session as signed out", () => {
    expect(isTransientAuthError(new AuthSessionMissingError())).toBe(false);
    expect(isTransientAuthError(new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found"))).toBe(false);
    expect(isTransientAuthError(new AuthApiError("JWT expired", 401, "bad_jwt"))).toBe(false);
    expect(isTransientAuthError(new AuthApiError("User not found", 403, "user_not_found"))).toBe(false);
  });

  it("returns false when there is no error", () => {
    expect(isTransientAuthError(null)).toBe(false);
    expect(isTransientAuthError(undefined)).toBe(false);
  });
});

it("is identical in the mobile app", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, ...parts), "utf8").replace(/\r\n/g, "\n");
  expect(read("..", "mobile", "lib", "authErrors.ts")).toBe(read("authErrors.ts"));
});
