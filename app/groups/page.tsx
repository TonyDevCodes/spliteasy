import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDisplayName } from "@/lib/displayName";
import { SignOutButton } from "@/app/sign-out-button";
import { NotificationBell } from "@/app/notification-bell";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const myName = profile ? getDisplayName(profile) : getDisplayName({ display_name: null, email: user.email ?? "" });

  const { data: memberships, error } = await supabase
    .from("group_members")
    .select("groups(id, name, created_at)")
    .eq("user_id", user.id)
    .order("created_at", { referencedTable: "groups", ascending: false })
    .returns<MembershipRow[]>();

  if (error) {
    console.error("Groups query error:", error);
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <p className="text-danger">
          Something went wrong loading your groups.
        </p>
      </div>
    );
  }

  const groups = (memberships ?? [])
    .map((m) => m.groups)
    .filter((g): g is GroupRow => g !== null);

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-background px-4 py-12">
      <div className="flex w-full max-w-md items-center justify-between text-sm text-text-muted">
        <span>
          Signed in as{" "}
          <Link
            href="/profile"
            className="font-medium text-text hover:underline"
          >
            {myName}
          </Link>
        </span>
        <div className="flex items-center gap-2">
          <NotificationBell userId={user.id} />
          <SignOutButton small />
        </div>
      </div>

      <div className="flex w-full max-w-md items-center justify-between">
        <h1 className="text-xl font-semibold text-text">
          Your groups
        </h1>
        <Link
          href="/groups/new"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover"
        >
          Create group
        </Link>
      </div>

      {groups.length === 0 ? (
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-text-muted">
            You&apos;re not part of any group yet.
          </p>
        </div>
      ) : (
        <ul className="flex w-full max-w-md flex-col gap-2">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
                className="block rounded-lg border border-border bg-surface p-4 text-text hover:border-text-muted"
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