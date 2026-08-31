import type { PublicationCheckResult } from "@/lib/publication-checks";

export function PublicationChecklist({ checks }: { checks: PublicationCheckResult[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2">
          <span className={c.passed ? "text-pakistan" : "text-red-500"} aria-hidden>
            {c.passed ? "✓" : "✗"}
          </span>
          <span>
            <span className={c.passed ? "" : "font-medium text-ink"}>{c.label}</span>
            {!c.passed && c.reason && <span className="block text-xs text-ink-muted">{c.reason}</span>}
          </span>
        </li>
      ))}
      <li className="mt-1 text-xs text-ink-muted">Slug uniqueness is re-verified against the database on save.</li>
    </ul>
  );
}
