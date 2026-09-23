"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ small = false }: { small?: boolean } = {}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className={
        small
          ? "rounded-md border border-border px-3 py-1 text-xs font-medium text-text hover:bg-surface-hover"
          : "rounded-full bg-primary px-5 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover"
      }
    >
      Sign out
    </button>
  );
}
