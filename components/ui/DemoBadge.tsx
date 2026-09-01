// Spec section 63: demo content must be clearly labeled and never presented
// as real current news.
export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      // Deliberately bg-black, not the ink token: this badge sits on top of
      // photos, not the page background, so it must stay a stable dark chip
      // regardless of site theme rather than flipping to a near-white bg in
      // dark mode (which would make it both invisible and illegible).
      className={`rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${className}`}
      title="Illustrative placeholder content, not real news"
    >
      Demo
    </span>
  );
}
