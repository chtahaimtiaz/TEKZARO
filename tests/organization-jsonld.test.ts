import { describe, it, expect, beforeEach, afterEach } from "vitest";

const SOCIAL_VARS = [
  "NEXT_PUBLIC_INSTAGRAM_URL",
  "NEXT_PUBLIC_FACEBOOK_URL",
  "NEXT_PUBLIC_TIKTOK_URL",
  "NEXT_PUBLIC_X_URL",
  "NEXT_PUBLIC_YOUTUBE_URL",
  "NEXT_PUBLIC_LINKEDIN_URL",
] as const;

const saved: Record<string, string | undefined> = {};

// social-links reads process.env at call time, so each case sets the
// environment it needs and the module is re-imported fresh.
async function organization(env: Partial<Record<(typeof SOCIAL_VARS)[number], string>>) {
  for (const key of SOCIAL_VARS) delete process.env[key];
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const { organizationJsonLd } = await import("../lib/seo");
  return organizationJsonLd() as Record<string, unknown>;
}

beforeEach(() => {
  for (const key of SOCIAL_VARS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of SOCIAL_VARS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("Organization structured data", () => {
  it("lists the configured profiles in sameAs", async () => {
    const org = await organization({
      NEXT_PUBLIC_INSTAGRAM_URL: "https://www.instagram.com/tekzaro.co/",
      NEXT_PUBLIC_X_URL: "https://x.com/tekzaro_co",
    });
    expect(org.sameAs).toEqual(["https://www.instagram.com/tekzaro.co/", "https://x.com/tekzaro_co"]);
  });

  it("omits sameAs entirely when no profile is configured", async () => {
    const org = await organization({});
    // Not [] — an empty array asserts the organization has no profiles,
    // which is a different claim from saying nothing on the subject.
    expect(org.sameAs).toBeUndefined();
    expect("sameAs" in org && org.sameAs !== undefined).toBe(false);
  });

  it("never emits a blank or placeholder entry for an unset account", async () => {
    const org = await organization({
      NEXT_PUBLIC_X_URL: "https://x.com/tekzaro_co",
      NEXT_PUBLIC_FACEBOOK_URL: "",
      NEXT_PUBLIC_YOUTUBE_URL: "   ",
    });
    expect(org.sameAs).toEqual(["https://x.com/tekzaro_co"]);
  });

  it("supports the extensible platforms without inventing them", async () => {
    const org = await organization({
      NEXT_PUBLIC_YOUTUBE_URL: "https://www.youtube.com/@example",
      NEXT_PUBLIC_LINKEDIN_URL: "https://www.linkedin.com/company/example",
    });
    expect(org.sameAs).toEqual([
      "https://www.youtube.com/@example",
      "https://www.linkedin.com/company/example",
    ]);
  });

  it("points the publisher logo at a file that exists", async () => {
    const org = await organization({});
    const logo = org.logo as { url: string };
    // Was /icon.svg, which 404s — an unusable publisher logo for article
    // rich results.
    expect(logo.url).toMatch(/\/logo\.png$/);
    expect(logo.url).not.toContain("icon.svg");
  });

  it("uses absolute URLs throughout", async () => {
    const org = await organization({ NEXT_PUBLIC_X_URL: "https://x.com/tekzaro_co" });
    expect(String(org.url)).toMatch(/^https?:\/\//);
    expect((org.logo as { url: string }).url).toMatch(/^https?:\/\//);
    for (const u of org.sameAs as string[]) expect(u).toMatch(/^https:\/\//);
  });

  it("declares itself a NewsMediaOrganization with a stable @id", async () => {
    const org = await organization({});
    // A subtype of Organization, so nothing consuming the previous markup
    // breaks, but it states what this publisher is rather than leaving it
    // to be inferred.
    expect(org["@type"]).toBe("NewsMediaOrganization");
    expect(String(org["@id"])).toMatch(/#organization$/);
  });
});

describe("entity relationships", () => {
  it("makes the article publisher the same entity as the sitewide organization", async () => {
    const { organizationJsonLd, organizationId, buildArticleJsonLd } = await import("../lib/seo");
    const article = {
      slug: "s",
      title: "T",
      excerpt: "E",
      metaDescription: null,
      canonicalUrl: null,
      ogImage: null,
      featuredImageUrl: null,
      publishedAt: new Date(),
      updatedAt: new Date(),
      author: { name: "A", slug: "a" },
      category: { name: "C", slug: "c" },
      tags: [],
    } as never;

    const publisher = (buildArticleJsonLd(article) as Record<string, unknown>).publisher as Record<string, unknown>;
    // Same @id, so the two nodes describe one entity rather than two that
    // merely share a name — while the publisher keeps name and logo inline,
    // which Google's Article guidance expects.
    expect(publisher["@id"]).toBe(organizationId());
    expect(publisher["@id"]).toBe(organizationJsonLd()["@id"]);
    expect(publisher.name).toBeTruthy();
    expect((publisher.logo as { url: string }).url).toBeTruthy();
  });

  it("ties the website node to the publishing organization", async () => {
    const { websiteJsonLd, organizationId } = await import("../lib/seo");
    const site = websiteJsonLd() as Record<string, unknown>;
    expect(site["@type"]).toBe("WebSite");
    expect((site.publisher as Record<string, unknown>)["@id"]).toBe(organizationId());
  });

  it("describes an author from stored fields only, omitting what is absent", async () => {
    const { authorJsonLd, organizationId } = await import("../lib/seo");
    const bare = authorJsonLd({ name: "Bilal Ahmed", slug: "bilal-ahmed" }) as Record<string, unknown>;
    const person = bare.mainEntity as Record<string, unknown>;

    expect(person["@type"]).toBe("Person");
    expect(person.name).toBe("Bilal Ahmed");
    expect((person.worksFor as Record<string, unknown>)["@id"]).toBe(organizationId());
    // No bio, photo or position stored — those keys must be absent rather
    // than filled with invented text.
    expect(person.description).toBeUndefined();
    expect(person.image).toBeUndefined();
    expect(person.jobTitle).toBeUndefined();

    const full = authorJsonLd({
      name: "Sara Khawaja",
      slug: "sara-khawaja",
      bio: "Covers smartphones.",
      position: "Staff Writer",
      photoUrl: "https://example.test/p.jpg",
    }) as Record<string, unknown>;
    const filled = full.mainEntity as Record<string, unknown>;
    expect(filled.description).toBe("Covers smartphones.");
    expect(filled.jobTitle).toBe("Staff Writer");
    expect(filled.image).toBe("https://example.test/p.jpg");
  });
});
