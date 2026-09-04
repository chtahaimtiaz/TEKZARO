export type SocialPlatform = "instagram" | "facebook" | "tiktok" | "x" | "youtube" | "linkedin";

export interface SocialLinkConfig {
  platform: SocialPlatform;
  label: string;
  url: string;
}

/**
 * Never invent a URL. A platform only ever appears here once its env var is
 * actually set to a real account; the single place that decision is made, so
 * the footer (or anywhere else that wants social links) never has to
 * re-derive "is this enabled." Adding an account is exactly one env var + a
 * redeploy — no code change.
 *
 * Live: X (@tekzaro_co) and Instagram (@tekzaro.co). Facebook and TikTok
 * are wired but intentionally unset — no accounts exist for them yet, and
 * an icon linking nowhere is worse than no icon.
 *
 * These are NEXT_PUBLIC_*, so they are inlined at build time: setting one
 * in Vercel does nothing until the next deploy.
 */
export function getConfiguredSocialLinks(): SocialLinkConfig[] {
  const candidates: SocialLinkConfig[] = [
    { platform: "instagram", label: "Instagram", url: process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? "" },
    { platform: "facebook", label: "Facebook", url: process.env.NEXT_PUBLIC_FACEBOOK_URL ?? "" },
    { platform: "tiktok", label: "TikTok", url: process.env.NEXT_PUBLIC_TIKTOK_URL ?? "" },
    { platform: "x", label: "X", url: process.env.NEXT_PUBLIC_X_URL ?? "" },
    { platform: "youtube", label: "YouTube", url: process.env.NEXT_PUBLIC_YOUTUBE_URL ?? "" },
    { platform: "linkedin", label: "LinkedIn", url: process.env.NEXT_PUBLIC_LINKEDIN_URL ?? "" },
  ];
  return candidates.filter((c) => c.url.trim().length > 0);
}

/**
 * The profile URLs for schema.org `sameAs` on the Organization node — the
 * signal that ties these accounts to the TEKZARO entity for search engines.
 *
 * Same source as the footer by design: one list, so a profile can never be
 * claimed in structured data while being absent from the site itself, or the
 * reverse. Returns undefined rather than [] when nothing is configured, so
 * the property is omitted from the JSON-LD entirely instead of emitting an
 * empty array that asserts "this organization has no profiles."
 */
export function socialProfileUrls(): string[] | undefined {
  const urls = getConfiguredSocialLinks().map((l) => l.url);
  return urls.length > 0 ? urls : undefined;
}
