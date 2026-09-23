import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";
import { isTransientAuthError } from "./authErrors";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    name?: string
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    // When the stored access token has expired and the refresh fails because
    // of the network, getSession() returns no session but keeps it in storage.
    // Treating that as "signed out" sent users to the sign-in screen, so keep
    // waiting (spinner) and retry until the network is back.
    async function loadInitialSession(attempt: number) {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!data.session && isTransientAuthError(error)) {
        console.warn("Session refresh failed, retrying:", error);
        retryTimer = setTimeout(() => loadInitialSession(attempt + 1), Math.min(30_000, 1_000 * 2 ** attempt));
        return;
      }

      setSession(data.session);
      setLoading(false);
    }

    loadInitialSession(0);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      // The initial session is handled above, where a network failure can be
      // told apart from a real "no session".
      if (event === "INITIAL_SESSION") return;
      setSession(newSession);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  }

  async function signUp(email: string, password: string, name?: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: Linking.createURL("auth/callback"),
        data: name?.trim() ? { display_name: name.trim() } : undefined,
      },
    });
    return { error: error ? error.message : null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
