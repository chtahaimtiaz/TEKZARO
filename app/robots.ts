import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /search is an internal search results page: thin, endlessly
      // variable by query string, and duplicative of the category and
      // latest feeds. Google's guidance is explicitly not to let search
      // result pages be crawled, so it is excluded here and absent from
      // the sitemap.
      disallow: ["/admin", "/api/", "/search"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
