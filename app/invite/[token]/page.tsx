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
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
        <p className="text-red-600 dark:text-red-400">
          This invite link is invalid.
        </p>
      </div>
    );
  }

  if (invite.is_expired) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
        <p className="text-red-600 dark:text-red-400">
          This invite link has expired.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-black dark:text-zinc-50">
          You&apos;ve been invited to join
        </p>
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          {invite.group_name}
        </h1>
        <form action={joinGroup} className="w-full">
          <input type="hidden" name="groupId" value={invite.group_id} />
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="w-full rounded-md bg-black px-4 py-2 font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Join group
          </button>
        </form>
        <Link
          href="/groups"
          className="text-sm text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}