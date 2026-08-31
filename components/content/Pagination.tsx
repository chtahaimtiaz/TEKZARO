import Link from "next/link";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
}

export function Pagination({ page, pageSize, total, basePath }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const sep = basePath.includes("?") ? "&" : "?";
  const hrefFor = (p: number) => `${basePath}${sep}page=${p}`;

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2">
      {page > 1 && (
        <Link href={hrefFor(page - 1)} className="rounded-md border border-border px-3 py-2 text-sm hover:border-accent">
          ← Previous
        </Link>
      )}
      <span className="px-3 py-2 text-sm text-ink-muted">
        Page {page} of {totalPages}
      </span>
      {page < totalPages && (
        <Link href={hrefFor(page + 1)} className="rounded-md border border-border px-3 py-2 text-sm hover:border-accent">
          Next →
        </Link>
      )}
    </nav>
  );
}
