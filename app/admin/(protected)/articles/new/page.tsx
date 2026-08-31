import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAN_WRITE } from "@/lib/permissions";
import { ArticleEditor } from "@/components/admin/ArticleEditor";
import { isMediaUploadAvailable } from "@/lib/media/storage";

export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  const user = await requireUser();
  if (!CAN_WRITE.includes(user.role)) redirect("/admin/articles");

  const [categories, authors] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.author.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <ArticleEditor
      mode="create"
      initialBlocks={[]}
      initialFeaturedMedia={null}
      initial={{
        title: "",
        slug: "",
        subheadline: "",
        excerpt: "",
        categoryId: "",
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
      }}
      categories={categories}
      authors={authors}
      legalTransitions={[]}
      mediaUploadAvailable={isMediaUploadAvailable()}
    />
  );
}
