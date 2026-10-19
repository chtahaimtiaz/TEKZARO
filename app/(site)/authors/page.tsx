import type { Metadata } from "next";
import Link from "next/link";
import { getAllAuthors } from "@/lib/articles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Authors",
  description: "The TEKZARO newsroom — editors and reporters covering technology.",
  alternates: { canonical: "/authors" },
};

import Image from "next/image";

export default async function AuthorsPage() {
  const authors = await getAllAuthors();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Authors &amp; Editorial Staff</h1>
      <p className="mt-2 text-sm text-ink-soft">
        The journalists, technical analysts, and editors behind TEKZARO&apos;s Pakistan-first and global technology coverage.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {authors.map((author) => (
          <Link
            key={author.id}
            href={`/author/${author.slug}`}
            className="flex items-start gap-4 rounded-xl border border-border bg-paper-raised p-5 hover:border-accent"
          >
            {author.photoUrl ? (
              <Image
                src={author.photoUrl}
                alt={author.name}
                width={56}
                height={56}
                className="h-14 w-14 shrink-0 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink font-serif text-lg font-bold text-white dark:text-paper">
                {author.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink">{author.name}</p>
              {author.position && <p className="text-xs font-medium text-accent">{author.position}</p>}
              {author.bio && <p className="mt-1.5 line-clamp-2 text-xs text-ink-soft leading-relaxed">{author.bio}</p>}
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{author._count.articles} articles</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
