import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildReceiptPath,
  collectReceiptPaths,
  isReceiptPathForGroup,
  MAX_RECEIPT_BYTES,
  receiptContentType,
  receiptExtension,
  receiptGroupId,
  RECEIPT_SIGNED_URL_TTL_SECONDS,
  signedUrlsByPath,
  validateReceiptFile,
} from "./receipts";

const GROUP = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

describe("receiptExtension", () => {
  it("takes a known image extension from the name, lowercased", () => {
    expect(receiptExtension("IMG_0001.PNG")).toBe("png");
    expect(receiptExtension("file:///data/cache/photo.jpeg")).toBe("jpeg");
  });

  it("ignores a query string or fragment", () => {
    expect(receiptExtension("https://x/y/photo.webp?token=abc#top")).toBe("webp");
  });

  it("falls back to the MIME type, then to jpg", () => {
    expect(receiptExtension("blob", "image/png")).toBe("png");
    expect(receiptExtension("blob", "image/jpeg")).toBe("jpg");
    expect(receiptExtension("receipt.exe", "application/octet-stream")).toBe("jpg");
    expect(receiptExtension("content://media/42")).toBe("jpg");
  });
});

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

describe("validateReceiptFile", () => {
  it("accepts images up to the size limit", () => {
    expect(validateReceiptFile({ size: MAX_RECEIPT_BYTES, type: "image/png" })).toBeNull();
  });

  it("rejects non-images and files that are too large", () => {
    expect(validateReceiptFile({ size: 10, type: "application/pdf" })).toMatch(/image/);
    expect(validateReceiptFile({ size: MAX_RECEIPT_BYTES + 1, type: "image/jpeg" })).toMatch(/10 MB/);
  });
});

it("is identical in the mobile app", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, ...parts), "utf8").replace(/\r\n/g, "\n");
  expect(read("..", "mobile", "lib", "receipts.ts")).toBe(read("receipts.ts"));
});
