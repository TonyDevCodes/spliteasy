import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function createGroup(formData: FormData) {
  "use server";

  const name = (formData.get("name") as string | null)?.trim();

  if (!name) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .insert({ name, created_by: user.id })
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
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <form
        action={createGroup}
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          Create a group
        </h1>
        <input
          type="text"
          name="name"
          placeholder="Group name"
          required
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Create
        </button>
      </form>
    </div>
  );
}