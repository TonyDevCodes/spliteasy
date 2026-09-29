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

// Joining goes through the join_group_by_token RPC, which checks the invite in
// the database; clients never insert into group_members for a join.

export type JoinGroupResult =
  | { ok: true; groupId: string }
  | { ok: false; reason: "invalid" | "expired" | "not-signed-in" | "failed"; message: string };

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

const JOIN_MESSAGES = {
  invalid: "This invite link is invalid.",
  expired: "This invite link has expired.",
  "not-signed-in": "Sign in to join the group.",
  failed: "Could not join the group. Check your connection and try again.",
} as const;

function joinFailure(reason: keyof typeof JOIN_MESSAGES): JoinGroupResult {
  return { ok: false, reason, message: JOIN_MESSAGES[reason] };
}

export async function joinGroupByToken(client: RpcClient, rawToken: string): Promise<JoinGroupResult> {
  const token = parseInviteToken(rawToken);
  if (!token) return joinFailure("invalid");

  try {
    const { data, error } = await client.rpc("join_group_by_token", { p_token: token });
    if (error) {
      const message = error.message ?? "";
      if (message.includes("invite_invalid")) return joinFailure("invalid");
      if (message.includes("invite_expired")) return joinFailure("expired");
      if (message.includes("not_authenticated")) return joinFailure("not-signed-in");
      return joinFailure("failed");
    }
    return typeof data === "string" && data ? { ok: true, groupId: data } : joinFailure("failed");
  } catch {
    return joinFailure("failed");
  }
}
