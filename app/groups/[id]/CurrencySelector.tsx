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
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{value}</span>
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
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      >
        {SUPPORTED_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}
