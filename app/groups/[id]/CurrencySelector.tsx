"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CURRENCY_CHANGE_WARNING } from "@/lib/money";
import CurrencyPicker from "@/components/CurrencyPicker";

export default function CurrencySelector({
  groupId,
  currency,
  editable,
}: {
  groupId: string;
  currency: string;
  editable: boolean;
}) {
  const [value, setValue] = useState(currency);
  const [pending, setPending] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPending(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pending]);

  if (!editable) {
    return (
      <span className="text-sm text-text-muted">{value}</span>
    );
  }

  async function confirmChange() {
    if (!pending) return;
    const next = pending;
    const previous = value;
    setPending(null);
    setValue(next);
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("groups")
      .update({ currency: next })
      .eq("id", groupId);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      setValue(previous);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <CurrencyPicker value={value} onChange={setPending} disabled={saving} className="w-28" />
      {error && (
        <span className="text-xs text-danger">{error}</span>
      )}
      {pending && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-overlay px-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="currency-dialog-title"
            aria-describedby="currency-dialog-text"
            className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-surface p-6"
          >
            <h2 id="currency-dialog-title" className="text-base font-semibold text-text">
              Change currency to {pending}?
            </h2>
            <p id="currency-dialog-text" className="text-sm text-text-muted">
              {CURRENCY_CHANGE_WARNING}
            </p>
            <div className="flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setPending(null)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmChange}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover"
              >
                Change currency
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
