// Where to go after signing in, e.g. back to an invite that was opened while
// signed out. Kept in memory only: an app restart simply lands on the groups
// list. Only invite paths are accepted (see safeReturnPath).
import { safeReturnPath } from "./invites";

let pending: string | null = null;

export function setPendingRedirect(path: string): void {
  pending = safeReturnPath(path);
}

/** Returns the pending path once and clears it. */
export function takePendingRedirect(): string | null {
  const path = pending;
  pending = null;
  return path;
}
