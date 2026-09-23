// Tells a temporary auth failure (network, rate limit, server error) apart from
// a real "not signed in". Only the latter may send the user to the sign-in
// screen; a transient failure must keep the session and show a retry instead.
// mobile/lib/authErrors.ts is an identical copy of this file.
import { isAuthRetryableFetchError } from "@supabase/supabase-js";

export function isTransientAuthError(error: unknown): boolean {
  if (!error) return false;
  if (isAuthRetryableFetchError(error)) return true;

  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") {
    return status === 0 || status === 408 || status === 429 || status >= 500;
  }

  // Errors thrown by fetch itself (offline, DNS, aborted) are not AuthErrors.
  return error instanceof TypeError;
}
