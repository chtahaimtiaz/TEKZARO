import { placeholderParams } from "@/lib/placeholder";

interface PlaceholderArtProps {
  seed: string;
  label: string;
  className?: string;
}

// Original generated cover art — gradient + geometric composition keyed off
// the article slug/category so pieces stay visually distinct without ever
// touching a real (potentially copyrighted) photo.
export function PlaceholderArt({ seed, label, className }: PlaceholderArtProps) {
  const { hueA, hueB, shapes, rotation } = placeholderParams(seed);
  const gradientId = `pg-${seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;

  return (
    <svg
      viewBox="0 0 400 225"
      className={className}
      role="img"
      aria-label={`${label} illustration`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1" gradientTransform={`rotate(${rotation % 90} 0.5 0.5)`}>
          <stop offset="0%" stopColor={`hsl(${hueA} 42% 16%)`} />
          <stop offset="100%" stopColor={`hsl(${hueB} 55% 30%)`} />
        </linearGradient>
      </defs>
      <rect width="400" height="225" fill={`url(#${gradientId})`} />
      {shapes.map((s, i) => (
        <circle
          key={i}
          cx={(s.cx / 100) * 400}
          cy={(s.cy / 100) * 225}
          r={(s.r / 100) * 225}
          fill={`hsl(${hueA} 60% 85%)`}
          opacity={s.opacity}
        />
      ))}
    </svg>
  );
}
