"use server";

import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export async function createInvite(formData: FormData) {
  const groupId = formData.get("groupId") as string;

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const { error } = await supabase.from("group_invites").insert({
    group_id: groupId,
    created_by: user.id,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error("Create invite error:", error);
  }

  redirect(`/groups/${groupId}`);
}

export async function recordSettlement(formData: FormData) {
  const groupId = formData.get("groupId") as string;
  const fromUser = formData.get("fromUser") as string;
  const toUser = formData.get("toUser") as string;
  const amount = formData.get("amount") as string;

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("settlements").insert({
    group_id: groupId,
    from_user: fromUser,
    to_user: toUser,
    amount: parseFloat(amount),
  });

  if (error) {
    console.error("Record settlement error:", error);
  }

  redirect(`/groups/${groupId}`);
}
