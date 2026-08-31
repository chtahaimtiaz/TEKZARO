import { subscribeToNewsletter } from "@/lib/actions";

interface NewsletterFormProps {
  redirectTo: string;
  status?: string;
}

const STATUS_MESSAGES: Record<string, { text: string; tone: "ok" | "error" }> = {
  success: { text: "You're subscribed. Welcome to TEKZARO.", tone: "ok" },
  exists: { text: "That email is already subscribed.", tone: "ok" },
  invalid: { text: "Enter a valid email address.", tone: "error" },
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
        className="w-full rounded-md border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/50 focus:border-accent"
      />
      <button
        type="submit"
        className="shrink-0 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark"
      >
        Subscribe
      </button>
      {message && (
        <p role="status" className={`text-sm sm:col-span-2 ${message.tone === "ok" ? "text-white" : "text-red-300"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
