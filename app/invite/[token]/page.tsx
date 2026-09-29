import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { joinGroupByToken } from "@/lib/invites";

// Joining goes through the join_group_by_token RPC, which checks the invite
// in the database (already a member: it just returns the group).
async function joinGroup(formData: FormData) {
  "use server";

  const token = formData.get("token") as string;

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    redirect(`/login?next=/invite/${token}`);
  }

  const result = await joinGroupByToken(supabase, token);

  if (!result.ok) {
    console.error("Join group error:", result.reason);
    if (result.reason === "not-signed-in") {
      redirect(`/login?next=/invite/${token}`);
    }
    // Invalid/expired: the invite page shows that state; otherwise say so.
    redirect(`/invite/${token}${result.reason === "failed" ? "?error=join" : ""}`);
  }

  redirect(`/groups/${result.groupId}`);
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await params;
  const joinFailed = (await searchParams).error === "join";

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    redirect(`/login?next=/invite/${token}`);
  }

  const { data, error } = await supabase.rpc("get_invite_by_token", {
    p_token: token,
  });

  const invite = data?.[0];

  if (error || !invite) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-background px-4">
        <p className="text-danger">
          This invite link is invalid.
        </p>
        <Link href="/groups" className="text-sm text-text-muted hover:text-text">
          &larr; Your groups
        </Link>
      </div>
    );
  }

  if (invite.is_expired) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-background px-4">
        <p className="text-danger">
          This invite link has expired.
        </p>
        <Link href="/groups" className="text-sm text-text-muted hover:text-text">
          &larr; Your groups
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-surface p-8 text-center">
        <p className="text-text">
          You&apos;ve been invited to join
        </p>
        <h1 className="text-xl font-semibold text-text">
          {invite.group_name}
        </h1>
        {joinFailed && (
          <p className="w-full rounded-md bg-danger-background p-3 text-sm text-danger">
            Could not join the group. Please try again.
          </p>
        )}
        <form action={joinGroup} className="w-full">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover"
          >
            Join group
          </button>
        </form>
        <Link
          href="/groups"
          className="text-sm text-text-muted hover:text-text"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}