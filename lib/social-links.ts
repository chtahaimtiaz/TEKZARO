export type SocialPlatform = "instagram" | "facebook" | "tiktok" | "x";

export interface SocialLinkConfig {
  platform: SocialPlatform;
  label: string;
  url: string;
}

/**
 * TEKZARO doesn't have these accounts yet — never invent a URL. A platform
 * only ever appears here once its env var is actually set to a real URL;
 * the single place that decision is made, so the footer (or anywhere else
 * that wants social links later) never has to re-derive "is this enabled."
 * Adding a real account later is exactly one env var + a redeploy.
 */
export function getConfiguredSocialLinks(): SocialLinkConfig[] {
  const candidates: SocialLinkConfig[] = [
    { platform: "instagram", label: "Instagram", url: process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? "" },
    { platform: "facebook", label: "Facebook", url: process.env.NEXT_PUBLIC_FACEBOOK_URL ?? "" },
    { platform: "tiktok", label: "TikTok", url: process.env.NEXT_PUBLIC_TIKTOK_URL ?? "" },
    { platform: "x", label: "X", url: process.env.NEXT_PUBLIC_X_URL ?? "" },
  ];
  return candidates.filter((c) => c.url.trim().length > 0);
}
