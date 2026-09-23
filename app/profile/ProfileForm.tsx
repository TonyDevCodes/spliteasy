"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { validateDisplayNameInput } from "@/lib/displayName";
import { isTransientAuthError } from "@/lib/authErrors";

type Status = "idle" | "saving" | "saved" | "error";

export default function ProfileForm({
  email,
  initialName,
}: {
  email: string;
  initialName: string;
}) {
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setStatus("saving");
    setError(null);

    const result = validateDisplayNameInput(name);
    if (!result.ok) {
      setStatus("error");
      setError(result.error);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user) {
      setStatus("error");
      setError(
        isTransientAuthError(userError)
          ? "Could not reach the server. Please try again."
          : "You must be signed in."
      );
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ display_name: result.value })
      .eq("id", user.id);

    if (updateError) {
      setStatus("error");
      setError(updateError.message);
      return;
    }

    setName(result.value ?? "");
    setStatus("saved");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm text-text-muted">
          Email
        </label>
        <p className="text-text">{email}</p>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="name"
          className="text-sm text-text-muted"
        >
          Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-border bg-input-background px-3 py-2 text-text outline-none focus:border-text-muted"
        />
      </div>

      {status === "error" && error && (
        <p className="text-sm text-danger">{error}</p>
      )}
      {status === "saved" && (
        <p className="text-sm text-success">Saved</p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={status === "saving"}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:bg-disabled disabled:text-on-disabled"
      >
        {status === "saving" ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
