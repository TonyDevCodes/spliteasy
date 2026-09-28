// Receipt photos live in the private "receipts" storage bucket at
// <group id>/<timestamp>.<ext>; expenses.receipt_url stores that path (not a
// URL). The first folder must be the group id: the storage policies check
// group membership on it. Identical copy in mobile/lib/receipts.ts.

export const RECEIPTS_BUCKET = "receipts";

/** Signed URLs for the private bucket are valid for 60 minutes. */
export const RECEIPT_SIGNED_URL_TTL_SECONDS = 60 * 60;

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"];

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RECEIPT_PATH_REGEX = new RegExp(`^(${UUID_PATTERN})/\\d+\\.([a-z0-9]+)$`, "i");

/**
 * The file extension for an upload, from a file name or URI (query string and
 * fragment ignored), else from the MIME type, else "jpg".
 */
export function receiptExtension(nameOrUri: string, mimeType?: string | null): string {
  const match = nameOrUri.split(/[?#]/)[0].match(/\.([A-Za-z0-9]+)$/);
  const fromName = match?.[1].toLowerCase();
  if (fromName && IMAGE_EXTENSIONS.includes(fromName)) {
    return fromName;
  }

  const fromMime = mimeType?.toLowerCase().match(/^image\/([a-z0-9]+)$/)?.[1];
  if (fromMime && IMAGE_EXTENSIONS.includes(fromMime)) {
    return fromMime === "jpeg" ? "jpg" : fromMime;
  }

  return "jpg";
}

export function receiptContentType(extension: string): string {
  const ext = extension.toLowerCase();
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
}

export function buildReceiptPath(groupId: string, extension: string, now: number = Date.now()): string {
  return `${groupId}/${now}.${extension.toLowerCase()}`;
}

/** The group id (first folder) of a well-formed receipt path, else null. */
export function receiptGroupId(path: string | null | undefined): string | null {
  const match = path?.match(RECEIPT_PATH_REGEX);
  return match ? match[1].toLowerCase() : null;
}

/** True when the path is a well-formed receipt path inside this group's folder. */
export function isReceiptPathForGroup(path: string | null | undefined, groupId: string): boolean {
  const pathGroupId = receiptGroupId(path);
  return pathGroupId !== null && pathGroupId === groupId.toLowerCase();
}

/** Unique, non-empty receipt paths of a list of expenses, in list order. */
export function collectReceiptPaths(expenses: { receipt_url?: string | null }[]): string[] {
  const paths = expenses
    .map((e) => e.receipt_url?.trim())
    .filter((p): p is string => Boolean(p));
  return [...new Set(paths)];
}

/** Maps each path to its signed URL, skipping entries that failed. */
export function signedUrlsByPath(
  results: { path: string | null; signedUrl: string | null; error: string | null }[] | null | undefined
): Record<string, string> {
  const map: Record<string, string> = {};
  (results ?? []).forEach((r) => {
    if (r.path && r.signedUrl && !r.error) {
      map[r.path] = r.signedUrl;
    }
  });
  return map;
}

/** Checks a picked file before upload; returns an error message or null. */
export function validateReceiptFile(file: { size: number; type: string }): string | null {
  if (!file.type.toLowerCase().startsWith("image/")) {
    return "The receipt must be an image.";
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return "The receipt image must be 10 MB or smaller.";
  }
  return null;
}
