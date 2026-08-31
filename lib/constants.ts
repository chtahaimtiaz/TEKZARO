export type CategorySlug =
  | "ai"
  | "smartphones"
  | "computing"
  | "gadgets"
  | "cybersecurity"
  | "software"
  | "gaming"
  | "startups"
  | "space"
  | "enterprise"
  | "pakistan-tech";

export interface CategoryDef {
  slug: CategorySlug;
  name: string;
  shortName?: string;
  description: string;
}

// Canonical category list. "Pakistan Tech" is treated as a first-class category
// per TEKZARO's Pakistan-first editorial strategy, not a general/political section.
export const CATEGORIES: CategoryDef[] = [
  {
    slug: "pakistan-tech",
    name: "Pakistan Tech",
    description:
      "Technology news from Pakistan — startups, policy, telecom, cybersecurity, IT exports and the people building Pakistan's digital economy.",
  },
  {
    slug: "ai",
    name: "AI",
    description:
      "Artificial intelligence models, research, tools and the companies building them.",
  },
  {
    slug: "smartphones",
    name: "Smartphones",
    description:
      "Phones, mobile platforms, chips and the devices shaping how people connect.",
  },
  {
    slug: "computing",
    name: "Computing",
    description:
      "PCs, processors, operating systems and the infrastructure behind modern computing.",
  },
  {
    slug: "gadgets",
    name: "Gadgets",
    description:
      "Wearables, smart-home devices and the hardware changing everyday life.",
  },
  {
    slug: "cybersecurity",
    name: "Cybersecurity",
    description:
      "Vulnerabilities, breaches, defensive research and the security of connected systems.",
  },
  {
    slug: "software",
    name: "Software",
    description:
      "Applications, developer tools, platforms and the code running the modern internet.",
  },
  {
    slug: "gaming",
    name: "Gaming",
    description:
      "Games, consoles, engines and the business behind interactive entertainment.",
  },
  {
    slug: "startups",
    name: "Startups",
    description: "Funding rounds, founders and the companies building what's next.",
  },
  {
    slug: "space",
    name: "Space",
    shortName: "Space",
    description:
      "Space & Science — launches, missions, research and discovery beyond Earth.",
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    description:
      "Enterprise technology, cloud infrastructure and the systems running large organizations.",
  },
];

export const CATEGORY_MAP: Record<string, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c]),
);

// Primary nav shown on desktop. Kept short so it stays clean; the rest live under "More".
export const PRIMARY_NAV: CategorySlug[] = [
  "pakistan-tech",
  "ai",
  "smartphones",
  "computing",
  "cybersecurity",
];

export const OVERFLOW_NAV: CategorySlug[] = [
  "gadgets",
  "software",
  "gaming",
  "startups",
  "space",
  "enterprise",
];

export const SITE_NAME = "TEKZARO";
export const SITE_TAGLINE = "Independent Technology News";
export const SITE_DESCRIPTION =
  "Pakistan-first technology journalism with global coverage — AI, smartphones, computing, cybersecurity, startups and more, verified before publication.";

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

// Pakistan Tech is canonically hosted at /pakistan-tech (its own prominent hub),
// not /category/pakistan-tech — see components/pakistan for why.
export function categoryHref(slug: string): string {
  return slug === "pakistan-tech" ? "/pakistan-tech" : `/category/${slug}`;
}
