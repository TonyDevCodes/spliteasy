"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPPORTED_CURRENCIES } from "@/lib/money";

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editable) {
    return (
      <span className="text-sm text-text-muted">{value}</span>
    );
  }

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const previous = value;
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
      <select
        value={value}
        onChange={handleChange}
        disabled={saving}
        className="rounded-md border border-border bg-input-background px-2 py-1 text-sm text-text disabled:bg-disabled disabled:text-on-disabled"
      >
        {SUPPORTED_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-xs text-danger">{error}</span>
      )}
    </div>
  );
}
