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
 * before "@" so a raw email is never shown to other users.
 */
export function getDisplayName(profile: NamedProfile): string {
  if (profile.display_name && profile.display_name.trim().length > 0) {
    return profile.display_name;
  }
  const at = profile.email.indexOf("@");
  return at > 0 ? profile.email.slice(0, at) : profile.email;
}
