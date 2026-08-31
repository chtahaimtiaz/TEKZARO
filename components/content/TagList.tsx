import Link from "next/link";

interface TagListProps {
  tags: { slug: string; name: string }[];
}

export function TagList({ tags }: TagListProps) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li key={tag.slug}>
          <Link
            href={`/search?q=${encodeURIComponent(tag.name)}`}
            className="rounded-full border border-border px-3 py-1 text-xs text-ink-soft hover:border-accent hover:text-accent"
          >
            {tag.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
