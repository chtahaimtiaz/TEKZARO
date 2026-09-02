import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { changePasswordAction } from "@/lib/auth-actions";
import { Logo } from "@/components/ui/Logo";
import { PasswordInput } from "@/components/ui/PasswordInput";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Change password",
  robots: { index: false, follow: false },
};

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-sunk px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-paper-raised p-8">
        <Logo size={44} className="mx-auto" priority />
        <p className="mt-4 eyebrow text-center">TEKZARO Newsroom</p>
        <h1 className="mt-1 text-center font-serif text-2xl font-bold text-ink">Change password</h1>
        {user.mustChangePassword && (
          <p className="mt-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-300">
            This account is using a one-time bootstrap password. Set a new password to continue.
          </p>
        )}

        <form action={changePasswordAction} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-ink-soft">
              Current password
            </label>
            <PasswordInput
              id="currentPassword"
              name="currentPassword"
              required
              autoComplete="current-password"
              className="rounded-md border border-border-strong px-3 py-2.5 text-sm focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-ink-soft">
              New password
            </label>
            <PasswordInput
              id="newPassword"
              name="newPassword"
              required
              minLength={12}
              autoComplete="new-password"
              className="rounded-md border border-border-strong px-3 py-2.5 text-sm focus:border-accent"
            />
            <p className="mt-1 text-xs text-ink-muted">At least 12 characters.</p>
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-ink-soft">
              Confirm new password
            </label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              required
              minLength={12}
              autoComplete="new-password"
              className="rounded-md border border-border-strong px-3 py-2.5 text-sm focus:border-accent"
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
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
