import type { Metadata } from "next";
import Link from "next/link";
import { getAllAuthors } from "@/lib/articles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Authors",
  description: "The TEKZARO newsroom — editors and reporters covering technology.",
};

export default async function AuthorsPage() {
  const authors = await getAllAuthors();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="eyebrow">Newsroom</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Authors</h1>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {authors.map((author) => (
          <Link
            key={author.id}
            href={`/author/${author.slug}`}
            className="flex items-center gap-4 rounded-xl border border-border bg-paper-raised p-4 hover:border-accent"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink font-serif text-lg font-bold text-white dark:text-paper">
              {author.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div>
              <p className="font-bold">{author.name}</p>
              {author.position && <p className="text-sm text-ink-muted">{author.position}</p>}
              <p className="mt-1 text-xs text-ink-muted">{author._count.articles} articles</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
