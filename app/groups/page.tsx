import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type GroupRow = {
  id: string;
  name: string;
  created_at: string;
};

type MembershipRow = {
  groups: GroupRow | null;
};

export default async function GroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships, error } = await supabase
    .from("group_members")
    .select("groups(id, name, created_at)")
    .eq("user_id", user.id)
    .order("created_at", { referencedTable: "groups", ascending: false })
    .returns<MembershipRow[]>();

  if (error) {
    console.error("Groups query error:", error);
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-red-600 dark:text-red-400">
          Something went wrong loading your groups.
        </p>
      </div>
    );
  }

  const groups = (memberships ?? [])
    .map((m) => m.groups)
    .filter((g): g is GroupRow => g !== null);

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="flex w-full max-w-md items-center justify-between">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          Your groups
        </h1>
        <Link
          href="/groups/new"
          className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Create group
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-zinc-600 dark:text-zinc-400">
            You&apos;re not part of any group yet.
          </p>
        </div>
      ) : (
        <ul className="flex w-full max-w-md flex-col gap-2">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
                className="block rounded-lg border border-zinc-200 bg-white p-4 text-black hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:border-zinc-700"
              >
                {group.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}