import Link from "next/link";

interface SectionHeaderProps {
  title: string;
  href?: string;
  eyebrow?: string;
  accent?: "default" | "pakistan";
}

export function SectionHeader({ title, href, eyebrow, accent = "default" }: SectionHeaderProps) {
  return (
    <div className="mb-5 flex items-end justify-between border-b border-border pb-3">
      <div>
        {eyebrow && (
          <p className={`eyebrow mb-1 ${accent === "pakistan" ? "eyebrow-pakistan" : ""}`}>{eyebrow}</p>
        )}
        <h2 className="text-2xl font-bold text-ink">{title}</h2>
      </div>
      {href && (
        <Link
          href={href}
          className={`text-sm font-semibold whitespace-nowrap hover:underline ${
            accent === "pakistan" ? "text-pakistan" : "text-accent"
          }`}
        >
          View all →
        </Link>
      )}
    </div>
  );
}
