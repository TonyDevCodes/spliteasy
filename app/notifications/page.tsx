import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotificationsList from "./NotificationsList";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-background px-4 py-12">
      <div className="flex w-full max-w-md items-center justify-between">
        <Link href="/groups" className="text-sm text-text-muted hover:text-text">
          &larr; Your groups
        </Link>
      </div>
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8">
        <NotificationsList userId={user.id} />
      </div>
    </div>
  );
}
