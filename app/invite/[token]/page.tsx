import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function joinGroup(formData: FormData) {
  "use server";

  const groupId = formData.get("groupId") as string;
  const token = formData.get("token") as string;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/invite/${token}`);
  }

  const { error } = await supabase.from("group_members").insert({
    group_id: groupId,
    user_id: user.id,
    role: "member",
  });

  if (error && error.code !== "23505") {
    console.error("Join group error:", error);
    return;
  }

  redirect(`/groups/${groupId}`);
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/invite/${token}`);
  }

  const { data, error } = await supabase.rpc("get_invite_by_token", {
    p_token: token,
  });

  const invite = data?.[0];

  if (error || !invite) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background px-4">
        <p className="text-danger">
          This invite link is invalid.
        </p>
      </div>
    );
  }

  if (invite.is_expired) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background px-4">
        <p className="text-danger">
          This invite link has expired.
        </p>
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
        <form action={joinGroup} className="w-full">
          <input type="hidden" name="groupId" value={invite.group_id} />
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