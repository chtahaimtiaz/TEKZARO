import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 font-serif text-4xl font-bold">Story not found</h1>
      <p className="mt-3 max-w-md text-ink-soft">
        The page you&apos;re looking for doesn&apos;t exist, may have been moved, or its slug may
        have changed since publication.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className="rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-soft dark:text-paper">
          Go home
        </Link>
        <Link href="/search" className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold hover:border-accent">
          Search TEKZARO
        </Link>
      </div>
    </div>
  );
}
