import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_WRITE, CAN_OVERRIDE_AUTHOR_ELIGIBILITY, CAN_MANAGE_MEDIA } from "@/lib/permissions";
import { getAuthorsForEditor } from "@/lib/author-eligibility";
import { ArticleEditor } from "@/components/admin/ArticleEditor";
import { isMediaUploadAvailable } from "@/lib/media/storage";

export const dynamic = "force-dynamic";

export default async function NewArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const user = await requireUser();
  if (!CAN_WRITE.includes(user.role)) redirect("/admin/articles");
  const { category: categoryParam } = await searchParams;

  const [categories, authors] = await Promise.all([
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getAuthorsForEditor(),
  ]);

  // Pre-fill from the Daily Editorial Checklist's "Create Article" quick
  // action — validated against the fetched (active) category list rather
  // than trusted blindly from the query string.
  const initialCategoryId = categoryParam && categories.some((c) => c.id === categoryParam) ? categoryParam : "";

  return (
    <ArticleEditor
      mode="create"
      initialBlocks={[]}
      initialFeaturedMedia={null}
      canOverrideAuthorEligibility={CAN_OVERRIDE_AUTHOR_ELIGIBILITY.includes(user.role)}
      canManageMedia={CAN_MANAGE_MEDIA.includes(user.role)}
      canDelete={false}
      initial={{
        title: "",
        slug: "",
        subheadline: "",
        excerpt: "",
        categoryId: initialCategoryId,
        authorId: "",
        tagNames: [],
        locationName: "",
        featuredImageUrl: "",
        featuredImageAlt: "",
        featuredImageCaption: "",
        featuredImageCredit: "",
        featuredMediaId: "",
        seoTitle: "",
        metaDescription: "",
        canonicalUrl: "",
        ogImage: "",
        isBreaking: false,
        featured: false,
        pakistanRelevance: 0,
        regionalRelevance: 0,
        globalSignificance: 0,
        scheduledAt: "",
        overrideAuthorEligibility: false,
      }}
      categories={categories}
      authors={authors}
      legalTransitions={[]}
      mediaUploadAvailable={isMediaUploadAvailable()}
    />
  );
}
