import { subscribeToNewsletter } from "@/lib/actions";

interface NewsletterFormProps {
  redirectTo: string;
  status?: string;
}

const STATUS_MESSAGES: Record<string, { text: string; tone: "ok" | "error" }> = {
  pending: { text: "Check your email to confirm your subscription.", tone: "ok" },
  invalid: { text: "Enter a valid email address.", tone: "error" },
  ratelimited: { text: "Too many attempts — try again in a bit.", tone: "error" },
};

export function NewsletterForm({ redirectTo, status }: NewsletterFormProps) {
  const action = subscribeToNewsletter.bind(null, redirectTo);
  const message = status ? STATUS_MESSAGES[status] : undefined;

  return (
    <form action={action} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <input
        id="newsletter-email"
        type="email"
        name="email"
        required
        placeholder="you@example.com"
        suppressHydrationWarning
        // This form always sits on the bg-ink newsletter band, which
        // itself flips to a light surface in dark mode — so this translucent
        // "white on dark" input becomes translucent "paper (dark value) on
        // light" to match, not literally white-on-white.
        className="w-full rounded-md border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/50 focus:border-accent dark:border-paper/20 dark:bg-paper/10 dark:text-paper dark:placeholder:text-paper/50"
      />
      <button
        type="submit"
        className="shrink-0 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark dark:text-paper"
      >
        Subscribe
      </button>
      {message && (
        <p
          role="status"
          className={`text-sm sm:col-span-2 ${message.tone === "ok" ? "text-white dark:text-paper" : "text-red-300 dark:text-red-700"}`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
