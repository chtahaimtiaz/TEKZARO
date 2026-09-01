import type { Metadata } from "next";
import { setPasswordWithTokenAction } from "@/lib/auth-actions";
import { Logo } from "@/components/ui/Logo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set password",
  robots: { index: false, follow: false },
};

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-sunk px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-paper-raised p-8">
        <Logo size={44} className="mx-auto" priority />
        <p className="mt-4 eyebrow text-center">TEKZARO Newsroom</p>
        <h1 className="mt-1 text-center font-serif text-2xl font-bold text-ink">Set your password</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Choose a password for your account. This link can only be used once.
        </p>

        {!token && (
          <p role="alert" className="mt-4 text-sm font-medium text-red-600 dark:text-red-400">
            No invite/reset token was provided. Use the link from your email.
          </p>
        )}

        {token && (
          <form action={setPasswordWithTokenAction} className="mt-6 flex flex-col gap-4">
            <input type="hidden" name="token" value={token} />
            <div>
              <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-ink-soft">
                New password
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                className="w-full rounded-md border border-border-strong px-3 py-2.5 text-sm focus:border-accent"
              />
              <p className="mt-1 text-xs text-ink-muted">At least 12 characters.</p>
            </div>
            <div>
              <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-ink-soft">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                className="w-full rounded-md border border-border-strong px-3 py-2.5 text-sm focus:border-accent"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="mt-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark dark:text-paper"
            >
              Set password &amp; sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
