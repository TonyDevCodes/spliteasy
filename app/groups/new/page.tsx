import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from "@/lib/money";

async function createGroup(formData: FormData) {
  "use server";

  const name = (formData.get("name") as string | null)?.trim();

  if (!name) {
    return;
  }

  const rawCurrency = formData.get("currency") as string | null;
  const currency = SUPPORTED_CURRENCIES.includes(rawCurrency as any)
    ? rawCurrency
    : DEFAULT_CURRENCY;

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .insert({ name, created_by: user.id, currency })
    .select("id")
    .single();

  if (groupError || !group) {
    console.error("Create group error:", groupError);
    return;
  }

  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: group.id,
    user_id: user.id,
    role: "admin",
  });

  if (memberError) {
    console.error("Add group member error:", memberError);
    return;
  }

  redirect("/groups");
}

export default function NewGroupPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="flex w-full max-w-md">
        <Link href="/groups" className="text-sm text-text-muted hover:text-text">
          &larr; Your groups
        </Link>
      </div>
      <form
        action={createGroup}
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-surface p-8"
      >
        <h1 className="text-xl font-semibold text-text">
          Create a group
        </h1>
        <input
          type="text"
          name="name"
          placeholder="Group name"
          required
          className="rounded-md border border-border bg-input-background px-3 py-2 text-text"
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="currency" className="text-sm text-text-muted">
            Currency
          </label>
          <select
            id="currency"
            name="currency"
            defaultValue={DEFAULT_CURRENCY}
            className="rounded-md border border-border bg-input-background px-3 py-2 text-text"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="flex-1 rounded-md bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover"
          >
            Create
          </button>
          <Link
            href="/groups"
            className="rounded-md border border-border px-4 py-2 font-medium text-text hover:bg-surface-hover"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}