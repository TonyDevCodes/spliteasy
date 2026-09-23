import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isTransientAuthError } from "@/lib/authErrors";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — ignore, since the proxy
            // refreshes the session and writes cookies on every request.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user, or null when there is no valid session. A temporary
 * failure (network, rate limit, Auth server error) throws instead of returning
 * null, so pages show a retryable error rather than redirecting to /login as
 * if the user had been signed out.
 */
export async function getCurrentUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase.auth.getUser();
  if (data.user) return data.user;
  if (isTransientAuthError(error)) {
    throw new Error("Could not verify your session right now. Please try again.", { cause: error });
  }
  return null;
}
