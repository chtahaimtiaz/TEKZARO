import Link from "next/link";
import type { Article } from "@prisma/client";

interface PrevNextArticleProps {
  previous: Article | null;
  next: Article | null;
}

export function PrevNextArticle({ previous, next }: PrevNextArticleProps) {
  if (!previous && !next) return null;
  return (
    <nav aria-label="Article navigation" className="mt-10 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
      {previous ? (
        <Link href={`/article/${previous.slug}`} className="rounded-lg border border-border p-4 hover:border-accent">
          <p className="text-xs font-semibold text-ink-muted">← Previous</p>
          <p className="mt-1 line-clamp-2 font-semibold">{previous.title}</p>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link href={`/article/${next.slug}`} className="rounded-lg border border-border p-4 text-right hover:border-accent">
          <p className="text-xs font-semibold text-ink-muted">Next →</p>
          <p className="mt-1 line-clamp-2 font-semibold">{next.title}</p>
        </Link>
      ) : (
        <div />
      )}
    </nav>
  );
}
