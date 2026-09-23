import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  redirect(user ? "/groups" : "/login");
}
