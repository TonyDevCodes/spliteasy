// Invite links: https://<site>/invite/<token> (shared, works for everyone) and
// the mobile app's spliteasy://invite/<token>. Tokens are the group_invites
// token (a uuid today). Identical copy in mobile/lib/invites.ts.

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * The invite token from a bare token, an invite path ("/invite/<token>") or a
 * full invite URL (https or spliteasy://). Query strings and fragments are
 * ignored. Returns null for anything that is not a valid token.
 */
export function parseInviteToken(input: string | string[] | null | undefined): string | null {
  const raw = (Array.isArray(input) ? input[0] : input)?.trim();
  if (!raw) return null;

  const withoutSuffix = raw.split(/[?#]/)[0];
  const match = withoutSuffix.match(/(?:^|\/)invite\/([^/]+)\/?$/);
  const candidate = decode(match ? match[1] : withoutSuffix);

  return candidate && TOKEN_PATTERN.test(candidate) ? candidate : null;
}

export function invitePath(token: string): string {
  return `/invite/${encodeURIComponent(token)}`;
}

/** The link to share: always the web URL, which works with or without the app. */
export function inviteUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}${invitePath(token)}`;
}

/**
 * Where to go after signing in. Only invite paths are accepted, so a crafted
 * link cannot send a user anywhere else in the app.
 */
export function safeReturnPath(path: unknown): string | null {
  if (typeof path !== "string" || !path.startsWith("/invite/")) return null;
  const token = parseInviteToken(path);
  return token ? invitePath(token) : null;
}
