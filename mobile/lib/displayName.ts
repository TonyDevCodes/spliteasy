export type NamedProfile = {
  display_name: string | null;
  email: string;
};

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
