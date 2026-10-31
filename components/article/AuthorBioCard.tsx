import Image from "next/image";
import Link from "next/link";
import type { Author } from "@prisma/client";

interface AuthorBioCardProps {
  author: Author;
}

/**
 * Rich author bio card rendered at the bottom of every article page.
 * Provides E-E-A-T signals (author identity, position, bio, social links)
 * for both readers and search engines / ad platform reviewers.
 */
export function AuthorBioCard({ author }: AuthorBioCardProps) {
  const socials = (author.socialLinks as Record<string, string> | null) ?? {};

  return (
    <aside
      aria-label={`About the author: ${author.name}`}
      className="mt-10 rounded-xl border border-border bg-paper-raised p-5"
    >
      <p className="mb-4 text-xs font-bold uppercase tracking-wide text-ink-muted">
        About the Author
      </p>
      <div className="flex items-start gap-4">
        {author.photoUrl ? (
          <Image
            src={author.photoUrl}
            alt={author.name}
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-full object-cover border border-border"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-ink font-serif text-xl font-bold text-white dark:text-paper">
            {author.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/author/${author.slug}`}
            className="font-bold text-ink hover:text-accent"
          >
            {author.name}
          </Link>
          {author.position && (
            <p className="text-sm text-accent font-medium">{author.position}</p>
          )}
          {author.bio && (
            <p className="mt-2 text-sm text-ink-soft line-clamp-3">{author.bio}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <Link
              href={`/author/${author.slug}`}
              className="font-semibold text-accent hover:underline"
            >
              More articles →
            </Link>
            {Object.entries(socials).map(([platform, url]) => (
              <a
                key={platform}
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-ink-muted hover:text-accent hover:underline capitalize"
              >
                {platform}
              </a>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
