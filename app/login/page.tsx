"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const { error } =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (mode === "sign-up") {
      setMessage("Check your email to confirm your account.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleMagicLink() {
    setError(null);
    setMessage(null);

    if (!email) {
      setError("Enter your email first.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage("Check your email for the magic link.");
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-sm rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <h1 className="mb-6 text-xl font-semibold text-black dark:text-zinc-50">
          {mode === "sign-in" ? "Sign in" : "Sign up"}
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm text-zinc-600 dark:text-zinc-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-black/[.08] bg-transparent px-3 py-2 text-black outline-none focus:border-black/30 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/30"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm text-zinc-600 dark:text-zinc-400">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-black/[.08] bg-transparent px-3 py-2 text-black outline-none focus:border-black/30 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/30"
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {mode === "sign-in" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleMagicLink}
          disabled={loading}
          className="mt-3 w-full rounded-full border border-black/[.08] px-5 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-[#1a1a1a]"
        >
          Send magic link
        </button>

        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          {mode === "sign-in" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setError(null);
              setMessage(null);
            }}
            className="font-medium text-black underline dark:text-zinc-50"
          >
            {mode === "sign-in" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
