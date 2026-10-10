"use client";

import { useState, type FormEvent } from "react";

interface DevLoginProps {
  readonly onSuccess: () => void;
}

/** Minimal local-development sign-in. Never handles real credentials. */
export function DevLogin({ onSuccess }: DevLoginProps) {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || secret === "") {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/dev-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (response.ok) {
        setSecret("");
        onSuccess();
        return;
      }
      if (response.status === 429) {
        setError("Too many attempts — wait a minute and try again.");
      } else if (response.status === 401) {
        setError("Incorrect access secret.");
      } else {
        setError("Sign-in is unavailable right now.");
      }
    } catch {
      setError("Sign-in request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-4 sm:px-6 dark:border-zinc-800 dark:bg-zinc-900">
      <form
        aria-label="Developer sign-in"
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label
            htmlFor="billy-dev-secret"
            className="text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
          >
            Developer access secret
          </label>
          <input
            id="billy-dev-secret"
            type="password"
            autoComplete="off"
            value={secret}
            disabled={busy}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Required for local model catalog access"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
        </div>
        <button
          type="submit"
          disabled={busy || secret === ""}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {error !== null ? (
        <p role="alert" className="mx-auto mt-2 w-full max-w-3xl text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : (
        <p className="mx-auto mt-2 w-full max-w-3xl text-xs text-zinc-500 dark:text-zinc-400">
          Local development only — checked against{" "}
          <code className="font-mono">BILLY_DEV_ACCESS_SECRET</code> on the
          server. Nothing leaves this machine.
        </p>
      )}
    </div>
  );
}
