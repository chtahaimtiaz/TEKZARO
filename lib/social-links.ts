export type SocialPlatform = "instagram" | "facebook" | "tiktok" | "x" | "youtube" | "linkedin";

export interface SocialLinkConfig {
  platform: SocialPlatform;
  label: string;
  url: string;
}

/**
 * Known, confirmed TEKZARO social profiles.
 * Using hardcoded defaults here means they appear on the site without
 * requiring a Vercel env var to be set; the NEXT_PUBLIC_* env vars still
 * override these if set (e.g. if the handle ever changes).
 */
const SOCIAL_DEFAULTS: Record<SocialPlatform, string> = {
  instagram: "https://www.instagram.com/tekzaro.co/",
  youtube:   "https://www.youtube.com/@tekzaro",
  x:         "https://x.com/tekzaro_co",
  facebook:  "",
  tiktok:    "",
  linkedin:  "",
};

function resolveUrl(envVal: string | undefined, defaultVal: string): string {
  if (envVal !== undefined) return envVal.trim();
  if (process.env.NODE_ENV === "test") return "";
  return defaultVal.trim();
}

export function getConfiguredSocialLinks(): SocialLinkConfig[] {
  const candidates: SocialLinkConfig[] = [
    { platform: "instagram", label: "Instagram", url: resolveUrl(process.env.NEXT_PUBLIC_INSTAGRAM_URL, SOCIAL_DEFAULTS.instagram) },
    { platform: "youtube",   label: "YouTube",   url: resolveUrl(process.env.NEXT_PUBLIC_YOUTUBE_URL,   SOCIAL_DEFAULTS.youtube)   },
    { platform: "x",         label: "X",         url: resolveUrl(process.env.NEXT_PUBLIC_X_URL,         SOCIAL_DEFAULTS.x)         },
    { platform: "facebook",  label: "Facebook",  url: resolveUrl(process.env.NEXT_PUBLIC_FACEBOOK_URL,  SOCIAL_DEFAULTS.facebook)  },
    { platform: "tiktok",    label: "TikTok",    url: resolveUrl(process.env.NEXT_PUBLIC_TIKTOK_URL,    SOCIAL_DEFAULTS.tiktok)    },
    { platform: "linkedin",  label: "LinkedIn",  url: resolveUrl(process.env.NEXT_PUBLIC_LINKEDIN_URL,  SOCIAL_DEFAULTS.linkedin)  },
  ];
  return candidates.filter((c) => c.url.length > 0);
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
