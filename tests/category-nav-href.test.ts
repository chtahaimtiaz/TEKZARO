import { describe, it, expect } from "vitest";
import { navCategoryHref } from "../lib/category-nav-href";

describe("navCategoryHref", () => {
  it("uses the generic /category/:slug path when there's no custom route", () => {
    expect(navCategoryHref({ slug: "ai", customRoute: null })).toBe("/category/ai");
  });

  it("uses the custom route when one is set", () => {
    expect(navCategoryHref({ slug: "pakistan-tech", customRoute: "/pakistan-tech" })).toBe("/pakistan-tech");
  });
});
