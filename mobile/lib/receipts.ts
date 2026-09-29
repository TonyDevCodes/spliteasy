// Receipt photos live in the private "receipts" storage bucket at
// <group id>/<timestamp>.<ext>; expenses.receipt_url stores that path (not a
// URL). The first folder must be the group id: the storage policies check
// group membership on it. Identical copy in mobile/lib/receipts.ts.

export const RECEIPTS_BUCKET = "receipts";

/** Signed URLs for the private bucket are valid for 60 minutes. */
export const RECEIPT_SIGNED_URL_TTL_SECONDS = 60 * 60;

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

/** Anything smaller is not a real photo (e.g. a "File not found" text body). */
export const MIN_RECEIPT_BYTES = 1024;

export const RECEIPT_UNAVAILABLE_TEXT = "Receipt unavailable";

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RECEIPT_PATH_REGEX = new RegExp(`^(${UUID_PATTERN})/\\d+\\.([a-z0-9]+)$`, "i");

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

/** Bytes needed from the start of a file to recognise its image format. */
export const RECEIPT_HEADER_BYTES = 16;

export type ReceiptImageFormat = "jpg" | "png" | "webp" | "heic";

// ISO-BMFF brands used by HEIC/HEIF photos (iPhone and many Android cameras).
const HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** The image format from the file's first bytes (its signature), else null. */
export function detectReceiptImageFormat(header: Uint8Array): ReceiptImageFormat | null {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "jpg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (header.length >= 8 && png.every((b, i) => header[i] === b)) {
    return "png";
  }
  if (header.length >= 12 && ascii(header, 0, 4) === "RIFF" && ascii(header, 8, 4) === "WEBP") {
    return "webp";
  }
  if (header.length >= 12 && ascii(header, 4, 4) === "ftyp" && HEIF_BRANDS.includes(ascii(header, 8, 4))) {
    return "heic";
  }
  return null;
}

export type ReceiptImageCheck =
  | { ok: true; extension: ReceiptImageFormat }
  | { ok: false; error: string };

/**
 * Checks a receipt before upload from its total size and first bytes, so an
 * error page or empty file is never stored as a receipt. The extension comes
 * from the real format, not from the file name.
 */
export function validateReceiptImage(header: Uint8Array, size: number): ReceiptImageCheck {
  if (size < MIN_RECEIPT_BYTES) {
    return { ok: false, error: "The receipt image is empty or unreadable." };
  }
  if (size > MAX_RECEIPT_BYTES) {
    return { ok: false, error: "The receipt image must be 10 MB or smaller." };
  }
  const format = detectReceiptImageFormat(header);
  if (!format) {
    return { ok: false, error: "The receipt must be a JPEG, PNG, WebP or HEIC image." };
  }
  return { ok: true, extension: format };
}
