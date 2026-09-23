import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";
import ThemeSetting from "./ThemeSetting";

export default async function ProfilePage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-background px-4 py-12">
      <div className="flex w-full max-w-md items-center justify-between">
        <Link
          href="/groups"
          className="text-sm text-text-muted hover:text-text"
        >
          &larr; Back to groups
        </Link>
      </div>
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-surface p-8">
        <h1 className="text-xl font-semibold text-text">
          Profile
        </h1>
        <ProfileForm
          email={profile?.email ?? user.email ?? ""}
          initialName={profile?.display_name ?? ""}
        />
        <div className="border-t border-border pt-4">
          <ThemeSetting />
        </div>
      </div>
    </div>
  );
}
