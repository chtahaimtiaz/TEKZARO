import type { Metadata } from "next";
import { loginAction } from "@/lib/auth-actions";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Invalid email or password.",
  locked: "Too many failed attempts. Try again in 15 minutes.",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const message = error ? ERROR_MESSAGES[error] ?? "Something went wrong. Try again." : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-sunk px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-paper-raised p-8">
        <p className="eyebrow">TEKZARO Newsroom</p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Sign in</h1>

        <form action={loginAction} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="next" value={next && next.startsWith("/admin") ? next : "/admin"} />
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-soft">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="w-full rounded-md border border-border-strong px-3 py-2.5 text-sm focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink-soft">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-border-strong px-3 py-2.5 text-sm focus:border-accent"
            />
          </div>

          {message && (
            <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
              {message}
            </p>
          )}

          <button
            type="submit"
            className="mt-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark dark:text-paper"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
