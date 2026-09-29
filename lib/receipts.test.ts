import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildReceiptPath,
  collectReceiptPaths,
  isReceiptPathForGroup,
  MAX_RECEIPT_BYTES,
  receiptContentType,
  receiptGroupId,
  RECEIPT_SIGNED_URL_TTL_SECONDS,
  signedUrlsByPath,
  validateReceiptImage,
  detectReceiptImageFormat,
  MIN_RECEIPT_BYTES,
} from "./receipts";

const GROUP = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

describe("receiptContentType", () => {
  it("maps jpg and jpeg to image/jpeg", () => {
    expect(receiptContentType("jpg")).toBe("image/jpeg");
    expect(receiptContentType("JPEG")).toBe("image/jpeg");
    expect(receiptContentType("png")).toBe("image/png");
  });
});

describe("buildReceiptPath / receiptGroupId / isReceiptPathForGroup", () => {
  it("builds <group id>/<timestamp>.<ext>", () => {
    expect(buildReceiptPath(GROUP, "PNG", 1727000000000)).toBe(`${GROUP}/1727000000000.png`);
  });

  it("round-trips the group id", () => {
    const path = buildReceiptPath(GROUP, "jpg", 1);
    expect(receiptGroupId(path)).toBe(GROUP);
    expect(isReceiptPathForGroup(path, GROUP)).toBe(true);
    expect(isReceiptPathForGroup(path, GROUP.toUpperCase())).toBe(true);
  });

  it("rejects other groups and malformed paths", () => {
    const other = "00000000-0000-4000-8000-000000000000";
    expect(isReceiptPathForGroup(buildReceiptPath(other, "jpg", 1), GROUP)).toBe(false);
    expect(receiptGroupId(`receipts/${GROUP}/1.jpg`)).toBeNull();
    expect(receiptGroupId(`${GROUP}/../x/1.jpg`)).toBeNull();
    expect(receiptGroupId(`not-a-uuid/1.jpg`)).toBeNull();
    expect(receiptGroupId(`${GROUP}/abc.jpg`)).toBeNull();
    expect(receiptGroupId(null)).toBeNull();
    expect(receiptGroupId("")).toBeNull();
  });
});

describe("collectReceiptPaths", () => {
  it("returns unique non-empty paths in order", () => {
    expect(
      collectReceiptPaths([
        { receipt_url: "b/2.jpg" },
        { receipt_url: null },
        {},
        { receipt_url: "  " },
        { receipt_url: "a/1.jpg" },
        { receipt_url: "b/2.jpg" },
      ])
    ).toEqual(["b/2.jpg", "a/1.jpg"]);
  });
});

describe("signedUrlsByPath", () => {
  it("keeps only successful results", () => {
    expect(
      signedUrlsByPath([
        { path: "a/1.jpg", signedUrl: "https://s/a", error: null },
        { path: "b/2.jpg", signedUrl: null, error: "Object not found" },
        { path: null, signedUrl: "https://s/x", error: null },
      ])
    ).toEqual({ "a/1.jpg": "https://s/a" });
    expect(signedUrlsByPath(null)).toEqual({});
  });

  it("uses a 60 minute expiry", () => {
    expect(RECEIPT_SIGNED_URL_TTL_SECONDS).toBe(3600);
  });
});

const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]);
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const bytesOf = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

describe("detectReceiptImageFormat", () => {
  it("recognises JPEG, PNG, WebP and HEIC signatures", () => {
    expect(detectReceiptImageFormat(JPEG_HEADER)).toBe("jpg");
    expect(detectReceiptImageFormat(PNG_HEADER)).toBe("png");
    expect(detectReceiptImageFormat(bytesOf("RIFF\x10\x00\x00\x00WEBPVP8 "))).toBe("webp");
    expect(detectReceiptImageFormat(bytesOf("\x00\x00\x00\x18ftypheic\x00\x00\x00\x00"))).toBe("heic");
    expect(detectReceiptImageFormat(bytesOf("\x00\x00\x00\x18ftypmif1\x00\x00\x00\x00"))).toBe("heic");
  });

  it("rejects text, other formats and short headers", () => {
    expect(detectReceiptImageFormat(bytesOf("File not found"))).toBeNull();
    expect(detectReceiptImageFormat(bytesOf("GIF89a\x01\x00\x01\x00"))).toBeNull();
    expect(detectReceiptImageFormat(bytesOf("%PDF-1.7\n%...."))).toBeNull();
    expect(detectReceiptImageFormat(bytesOf("\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00"))).toBeNull();
    expect(detectReceiptImageFormat(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectReceiptImageFormat(new Uint8Array())).toBeNull();
  });
});

describe("validateReceiptImage", () => {
  it("accepts a valid JPEG or PNG and returns the real extension", () => {
    expect(validateReceiptImage(JPEG_HEADER, 34_455)).toEqual({ ok: true, extension: "jpg" });
    expect(validateReceiptImage(PNG_HEADER, MIN_RECEIPT_BYTES)).toEqual({ ok: true, extension: "png" });
    expect(validateReceiptImage(JPEG_HEADER, MAX_RECEIPT_BYTES)).toEqual({ ok: true, extension: "jpg" });
  });

  it("rejects a tiny file even with an image signature", () => {
    const check = validateReceiptImage(JPEG_HEADER, MIN_RECEIPT_BYTES - 1);
    expect(check.ok).toBe(false);
    expect(!check.ok && check.error).toMatch(/empty or unreadable/);
    expect(validateReceiptImage(bytesOf("File not found"), 14).ok).toBe(false);
    expect(validateReceiptImage(new Uint8Array(), 0).ok).toBe(false);
  });

  it("rejects a wrong signature", () => {
    const check = validateReceiptImage(bytesOf("<!DOCTYPE html><html>"), 5_000);
    expect(check.ok).toBe(false);
    expect(!check.ok && check.error).toMatch(/JPEG, PNG, WebP or HEIC/);
  });

  it("rejects a file over 10 MB", () => {
    const check = validateReceiptImage(JPEG_HEADER, MAX_RECEIPT_BYTES + 1);
    expect(!check.ok && check.error).toMatch(/10 MB/);
  });
});

it("is identical in the mobile app", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, ...parts), "utf8").replace(/\r\n/g, "\n");
  expect(read("..", "mobile", "lib", "receipts.ts")).toBe(read("receipts.ts"));
});
