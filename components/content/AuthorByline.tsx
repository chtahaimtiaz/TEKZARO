import Link from "next/link";
import { timeAgo } from "@/lib/format";
import type { Author } from "@prisma/client";

interface AuthorBylineProps {
  author: Author;
  publishedAt: Date | null;
  readingTime: number | null;
  size?: "sm" | "md";
}

export function AuthorByline({ author, publishedAt, readingTime, size = "sm" }: AuthorBylineProps) {
  const text = size === "sm" ? "text-xs" : "text-sm";
  return (
    <div className={`flex items-center gap-2 ${text} text-ink-muted`}>
      <Link href={`/author/${author.slug}`} className="font-medium text-ink-soft hover:text-accent">
        {author.name}
      </Link>
      {publishedAt && (
        <>
          <span aria-hidden>·</span>
          <time dateTime={publishedAt.toISOString()}>{timeAgo(publishedAt)}</time>
        </>
      )}
      {readingTime && (
        <>
          <span aria-hidden>·</span>
          <span>{readingTime} min read</span>
        </>
      )}
    </div>
  );
}
