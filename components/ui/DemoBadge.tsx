// Spec section 63: demo content must be clearly labeled and never presented
// as real current news.
export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${className}`}
      title="Illustrative placeholder content, not real news"
    >
      Demo
    </span>
  );
}
