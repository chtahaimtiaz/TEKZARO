export type SocialPlatformPost = "instagram" | "facebook" | "tiktok" | "x";

export interface SocialPostDraft {
  platform: SocialPlatformPost;
  label: string;
  text: string;
}

export interface SocialPostInput {
  title: string;
  excerpt: string;
  categoryName: string;
  tagNames: string[];
  url: string;
  pakistanRelevance: number;
}

const ATTRIBUTION = "— TEKZARO";

function toHashtag(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned ? `#${cleaned}` : "";
}

/** Category + up to 3 tags + #Pakistan when relevance is genuinely high —
 * mirroring the same threshold the article page itself uses to decide
 * `isPakistan` (lib/... article page: pakistanRelevance >= 70). Never
 * invents a hashtag that isn't grounded in the article's own real data. */
function buildHashtags(input: SocialPostInput, max: number): string {
  const tags = new Set<string>();
  tags.add("#TechNews");
  const categoryTag = toHashtag(input.categoryName);
  if (categoryTag) tags.add(categoryTag);
  if (input.pakistanRelevance >= 70) tags.add("#Pakistan");
  for (const tag of input.tagNames) {
    if (tags.size >= max) break;
    const t = toHashtag(tag);
    if (t) tags.add(t);
  }
  return [...tags].slice(0, max).join(" ");
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
}

/**
 * Deterministic, template-based per-platform copy — same philosophy as
 * lib/discovery/headlines.ts's generateHeadlineSuggestions: plain string
 * formatting of the article's own real title/excerpt/category/tags/URL,
 * no AI call, nothing invented. Editors can revise before copying (see
 * components/admin/SocialPostPanel.tsx); nothing here posts anywhere.
 */
export function generateSocialPosts(input: SocialPostInput): SocialPostDraft[] {
  const summary = input.excerpt.trim();
  const hashtags3 = buildHashtags(input, 3);
  const hashtags5 = buildHashtags(input, 5);

  const instagram = [input.title, summary, `Read more: ${input.url}`, ATTRIBUTION, hashtags5]
    .filter(Boolean)
    .join("\n\n");

  const facebook = [input.title, summary, input.url, ATTRIBUTION].filter(Boolean).join("\n\n");

  const tiktok = [`${input.title}`, summary, `Full story: ${input.url}`, hashtags3].filter(Boolean).join("\n\n");

  // X: keep the whole post within a practical ~280-character budget once
  // the URL and hashtags are appended, trimming the headline/summary
  // portion first rather than dropping the URL or hashtags.
  const xSuffix = ` ${input.url} ${hashtags3}`;
  const xBudget = Math.max(40, 280 - xSuffix.length);
  const xLead = truncateAtWord(summary ? `${input.title} — ${summary}` : input.title, xBudget);
  const x = `${xLead}${xSuffix}`;

  return [
    { platform: "instagram", label: "Instagram", text: instagram },
    { platform: "facebook", label: "Facebook", text: facebook },
    { platform: "tiktok", label: "TikTok", text: tiktok },
    { platform: "x", label: "X", text: x },
  ];
}
