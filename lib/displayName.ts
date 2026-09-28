export type NamedProfile = {
  display_name: string | null;
  email: string;
};

export const MAX_DISPLAY_NAME_LENGTH = 40;

export type DisplayNameValidation =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * Validates a raw "Name" form input: trims whitespace, allows an empty
 * value (the email-prefix fallback applies), and rejects names over
 * MAX_DISPLAY_NAME_LENGTH characters.
 */
export function validateDisplayNameInput(input: string): DisplayNameValidation {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }

  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      ok: false,
      error: `Name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`,
    };
  }

  return { ok: true, value: trimmed };
}

/**
 * Prefer the profile's display name; fall back to the part of the email
 * before "@" so a raw email is never shown to other users. A missing profile
 * (deleted user) is shown as "Deleted user".
 */
export function getDisplayName(profile: NamedProfile | null | undefined): string {
  if (!profile) return DELETED_USER_NAME;
  if (profile.display_name && profile.display_name.trim().length > 0) {
    return profile.display_name;
  }
  const at = profile.email.indexOf("@");
  return at > 0 ? profile.email.slice(0, at) : profile.email;
}

/** Shown wherever a referenced user was deleted (the column is NULL). */
export const DELETED_USER_NAME = "Deleted user";

/**
 * Balance key for references to a deleted user. Their expenses, shares and
 * settlements stay in the group, grouped under this key so everyone else's
 * balances do not change.
 */
export const DELETED_USER_KEY = "deleted-user";

export function userKey(id: string | null | undefined): string {
  return id ?? DELETED_USER_KEY;
}

export function isDeletedUser(id: string | null | undefined): boolean {
  return id === null || id === undefined || id === DELETED_USER_KEY;
}

/** Display name for a user id: "Deleted user" when the user no longer exists. */
export function nameForUserId(
  id: string | null | undefined,
  nameById: Record<string, string>,
  fallback = "Former member"
): string {
  if (isDeletedUser(id)) return DELETED_USER_NAME;
  return nameById[id as string] ?? fallback;
}
