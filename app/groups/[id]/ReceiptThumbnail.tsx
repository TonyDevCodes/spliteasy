"use client";

import { useEffect, useState } from "react";
import { RECEIPT_UNAVAILABLE_TEXT } from "@/lib/receipts";

// Thumbnail plus full-size viewer for one receipt (signed URL). A file that
// is missing or not a real image shows "Receipt unavailable" instead of an
// empty box or a blank viewer.
export default function ReceiptThumbnail({
  url,
  description,
}: {
  url: string;
  description: string;
}) {
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (broken && !open) {
    return (
      <span className="self-start rounded border border-border px-1.5 py-0.5 text-xs italic text-text-muted">
        {RECEIPT_UNAVAILABLE_TEXT}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View receipt for ${description}`}
        className="flex items-center gap-2 self-start rounded text-left focus-visible:outline-2 focus-visible:outline-link"
      >
        {/* Signed URLs change on every load; next/image would need the storage host configured. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          onError={() => setBroken(true)}
          className="h-10 w-10 rounded border border-border bg-surface-hover object-cover hover:opacity-80"
        />
        <span className="text-xs font-medium text-link hover:underline">Receipt</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Receipt for ${description}`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-overlay p-4"
        >
          {broken ? (
            <p className="rounded-md bg-surface px-4 py-3 text-base font-semibold text-text">
              {RECEIPT_UNAVAILABLE_TEXT}
            </p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={`Receipt for ${description}`}
              onError={() => setBroken(true)}
              className="max-h-[85vh] max-w-full rounded object-contain"
            />
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md bg-surface px-3 py-1.5 text-sm text-text hover:bg-surface-hover"
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}
