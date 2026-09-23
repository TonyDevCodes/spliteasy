"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Magic link / OAuth failures land here as a URL fragment, e.g.
    // #error=access_denied&error_description=Email+link+is+invalid+or+has+expired
    const hash = window.location.hash;
    if (hash.includes("error")) {
      const params = new URLSearchParams(hash.slice(1));
      const description = params.get("error_description");
      setError(
        description ? description.replace(/\+/g, " ") : "Sign-in link is invalid or has expired."
      );
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    // auth/callback redirects here with ?error=... when code exchange fails.
    const searchParams = new URLSearchParams(window.location.search);
    const callbackError = searchParams.get("error");
    if (callbackError) {
      setError(callbackError.replace(/\+/g, " "));
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

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
              data: name.trim() ? { display_name: name.trim() } : undefined,
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
    <div className="flex flex-1 items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h1 className="mb-6 text-xl font-semibold text-text">
          {mode === "sign-in" ? "Sign in" : "Sign up"}
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === "sign-up" && (
            <div className="flex flex-col gap-1">
              <label htmlFor="name" className="text-sm text-text-muted">
                Name (optional)
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded border border-border bg-input-background px-3 py-2 text-text outline-none focus:border-text-muted"
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm text-text-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-border bg-input-background px-3 py-2 text-text outline-none focus:border-text-muted"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm text-text-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-border bg-input-background px-3 py-2 text-text outline-none focus:border-text-muted"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {message && <p className="text-sm text-success">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:bg-disabled disabled:text-on-disabled"
          >
            {mode === "sign-in" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleMagicLink}
          disabled={loading}
          className="mt-3 w-full rounded-full border border-border px-5 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-hover disabled:bg-disabled disabled:text-on-disabled"
        >
          Send magic link
        </button>

        <p className="mt-6 text-center text-sm text-text-muted">
          {mode === "sign-in" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setError(null);
              setMessage(null);
            }}
            className="font-medium text-text underline"
          >
            {mode === "sign-in" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}