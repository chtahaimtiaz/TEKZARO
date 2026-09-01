import Image from "next/image";

interface LogoProps {
  /** Square size in px — the source asset is 1254x1254, always rendered at
   * this same aspect ratio (never stretched). */
  size?: number;
  className?: string;
  /** Set true for the one above-the-fold instance per page (header) that
   * should skip lazy-loading; leave false everywhere else. */
  priority?: boolean;
}

/** The single approved TEKZARO logo asset (public/logo.png) — a fixed
 * black-background mark that reads correctly on both light and dark chrome
 * without needing separate theme variants, so it's used as-is everywhere
 * rather than swapped per theme. */
export function Logo({ size = 36, className = "", priority = false }: LogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="TEKZARO"
      width={1254}
      height={1254}
      priority={priority}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-md ${className}`}
    />
  );
}
