// Sign-up outcome, feature flags and demo credentials for the auth screens.
// The apps read the env vars themselves (NEXT_PUBLIC_* / EXPO_PUBLIC_* are
// inlined at build time only when accessed literally) and pass the values
// here. Identical copy in mobile/lib/authConfig.ts.

export type SignUpNextStep = "enter-app" | "confirm-email";

/**
 * With email confirmation off, signUp returns a session and the user goes
 * straight into the app. Without a session (confirmation on), they must
 * confirm their email first.
 */
export function nextStepAfterSignUp(session: unknown): SignUpNextStep {
  return session ? "enter-app" : "confirm-email";
}

/** "true", "1", "yes" or "on" (any case) enable a flag; anything else, including unset, disables it. */
export function isFlagEnabled(value: string | undefined | null): boolean {
  return ["true", "1", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export type DemoCredentials = { email: string; password: string };

/** The demo account, or null (no "Try the demo" button) when either value is missing. */
export function demoCredentials(
  email: string | undefined | null,
  password: string | undefined | null
): DemoCredentials | null {
  const e = (email ?? "").trim();
  const p = (password ?? "").trim();
  return e && p ? { email: e, password: p } : null;
}
