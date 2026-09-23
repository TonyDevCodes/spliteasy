"use client";

import { useEffect } from "react";
import Link from "next/link";

// Shown when a page fails to load, e.g. when the session could not be verified
// because of a network problem. The user stays signed in and can retry.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-surface p-8 text-center">
        <h1 className="text-xl font-semibold text-text">Something went wrong</h1>
        <p className="text-sm text-text-muted">
          We could not load this page. Check your connection and try again. You are still signed in.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover"
          >
            Try again
          </button>
          <Link
            href="/groups"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover"
          >
            Your groups
          </Link>
        </div>
      </div>
    </div>
  );
}
