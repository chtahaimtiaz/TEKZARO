"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BlockEditor } from "./BlockEditor";
import { PublicationChecklist } from "./PublicationChecklist";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { MediaUploadButton } from "./MediaUploadButton";
import { SocialPostPanel } from "./SocialPostPanel";
import { evaluatePublicationChecks, allChecksPassed } from "@/lib/publication-checks";
import { absoluteUrl } from "@/lib/seo";
import { slugify } from "@/lib/slugify";
import { splitPakistanImpact } from "@/lib/content-blocks";
import { TRANSITION_LABELS, type TransitionName } from "@/lib/workflow";
import {
  createArticleAction,
  updateArticleAction,
  transitionArticleAction,
  type ArticleFormInput,
} from "@/lib/article-actions";
import { isPublishableReuseStatus } from "@/lib/publication-checks";
import type { ArticleStatus, ImageReuseStatus } from "@prisma/client";
import type { ContentBlock } from "@/lib/content-blocks";

export interface FeaturedMediaInfo {
  id: string;
  reuseStatus: ImageReuseStatus;
  sourceDomain: string | null;
  sourceArticleUrl: string | null;
  createdAt: string;
  selectionReasons: string[] | null;
}

interface ArticleEditorProps {
  mode: "create" | "edit";
  articleId?: string;
  status?: ArticleStatus;
  initialBlocks: ContentBlock[];
  initial: Omit<ArticleFormInput, "blocks" | "pakistanImpact">;
  /** Provenance of the currently-linked Media row (initial.featuredMediaId),
   * or null when there is none — a fresh upload / hand-typed URL flow keeps
   * this in lockstep client-side, see the featuredMedia state below. */
  initialFeaturedMedia: FeaturedMediaInfo | null;
  categories: { id: string; name: string }[];
  authors: { id: string; name: string }[];
  legalTransitions: TransitionName[];
  mediaUploadAvailable: boolean;
}

export function ArticleEditor({
  mode,
  articleId,
  status,
  initialBlocks,
  initial,
  initialFeaturedMedia,
  categories,
  authors,
  legalTransitions,
  mediaUploadAvailable,
}: ArticleEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");

  const { blocks: initialSplitBlocks, pakistanImpact: initialImpact } = useMemo(
    () => splitPakistanImpact(initialBlocks),
    [initialBlocks],
  );

  const [form, setForm] = useState<Omit<ArticleFormInput, "blocks" | "pakistanImpact">>(initial);
  const [blocks, setBlocks] = useState<ContentBlock[]>(initialSplitBlocks);
  const [pakistanImpact, setPakistanImpact] = useState(initialImpact);
  const [tagsText, setTagsText] = useState(initial.tagNames.join(", "));
  const [featuredMedia, setFeaturedMedia] = useState<FeaturedMediaInfo | null>(initialFeaturedMedia);

  function patch(next: Partial<Omit<ArticleFormInput, "blocks" | "pakistanImpact">>) {
    setForm((f) => ({ ...f, ...next }));
  }

  function handleTitleChange(title: string) {
    if (!slugTouched) {
      patch({ title, slug: slugify(title) });
    } else {
      patch({ title });
    }
  }

  const tagNames = tagsText
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const fullInput: ArticleFormInput = { ...form, blocks, pakistanImpact, tagNames };

  const checks = useMemo(
    () =>
      evaluatePublicationChecks({
        title: fullInput.title,
        slug: fullInput.slug,
        categoryId: fullInput.categoryId || null,
        authorId: fullInput.authorId || null,
        blocks,
        featuredImageUrl: fullInput.featuredImageUrl || null,
        featuredImageAlt: fullInput.featuredImageAlt || null,
        metaDescription: fullInput.metaDescription || null,
        excerpt: fullInput.excerpt || null,
        featuredMediaReuseStatus: featuredMedia?.reuseStatus ?? null,
      }),
    // slugAvailable omitted deliberately — verified server-side on save/publish
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fullInput.title, fullInput.slug, fullInput.categoryId, fullInput.authorId, blocks, fullInput.featuredImageUrl, fullInput.featuredImageAlt, fullInput.metaDescription, fullInput.excerpt, featuredMedia],
  );

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createArticleAction(fullInput)
          : await updateArticleAction(articleId!, fullInput);

      if (!result.ok) {
        setError(result.error ?? "Save failed.");
        return;
      }

      if (mode === "create" && result.data && "id" in result.data) {
        router.push(`/admin/articles/${result.data.id}`);
        return;
      }
      if (result.data?.slug && result.data.slug !== form.slug) {
        patch({ slug: result.data.slug });
        setNotice(`Saved. Slug was adjusted to "${result.data.slug}" to stay unique.`);
      } else {
        setNotice("Saved.");
      }
      router.refresh();
    });
  }

  function runTransition(name: TransitionName) {
    if (!articleId) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const saveResult = await updateArticleAction(articleId, fullInput);
      if (!saveResult.ok) {
        setError(saveResult.error ?? "Save failed before transition.");
        return;
      }
      const result = await transitionArticleAction(articleId, name);
      if (!result.ok) {
        setError(result.error ?? "Action failed.");
        return;
      }
      setNotice(`${TRANSITION_LABELS[name]} succeeded.`);
      router.refresh();
    });
  }

  const publishLike = legalTransitions.filter((t) => t === "publish" || t === "schedule");
  const otherTransitions = legalTransitions.filter((t) => t !== "publish" && t !== "schedule");
  const blockingChecks = !allChecksPassed(checks);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="eyebrow">{mode === "create" ? "New Article" : "Edit Article"}</p>
          {status && <p className="text-sm text-ink-muted">Status: {status.replace(/_/g, " ")}</p>}
        </div>
        {articleId && (
          <div className="flex gap-3 text-sm">
            <Link href={`/admin/articles/${articleId}/preview`} className="font-semibold text-accent hover:underline" target="_blank">
              Preview →
            </Link>
            <Link href={`/admin/articles/${articleId}/versions`} className="font-semibold text-accent hover:underline">
              Version history →
            </Link>
          </div>
        )}
      </div>

      {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-md bg-pakistan-soft p-3 text-sm font-medium text-pakistan">{notice}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <input
            value={form.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Headline"
            className="w-full rounded-md border border-border-strong p-3 font-serif text-2xl font-bold focus:border-accent"
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-muted">/article/</span>
            <input
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                patch({ slug: slugify(e.target.value) });
              }}
              className="flex-1 rounded-md border border-border-strong p-2 text-sm focus:border-accent"
            />
          </div>
          <input
            value={form.subheadline}
            onChange={(e) => patch({ subheadline: e.target.value })}
            placeholder="Subheadline / dek"
            className="w-full rounded-md border border-border-strong p-2.5 text-sm focus:border-accent"
          />
          <textarea
            value={form.excerpt}
            onChange={(e) => patch({ excerpt: e.target.value })}
            placeholder="Excerpt (shown on cards and in search results)"
            rows={2}
            className="w-full rounded-md border border-border-strong p-2.5 text-sm focus:border-accent"
          />

          <div>
            <p className="mb-2 text-sm font-semibold text-ink-soft">Body</p>
            <BlockEditor blocks={blocks} onChange={setBlocks} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-ink-soft" htmlFor="pk-impact">
              What This Means for Pakistan <span className="font-normal text-ink-muted">(optional — only if a real angle exists)</span>
            </label>
            <textarea
              id="pk-impact"
              value={pakistanImpact}
              onChange={(e) => setPakistanImpact(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border-strong p-2.5 text-sm focus:border-accent"
            />
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-border bg-paper-raised p-4">
            <p className="mb-2 text-sm font-bold">Publication checklist</p>
            <PublicationChecklist checks={checks} />
          </div>

          <SuggestionsPanel
            title={form.title}
            excerpt={form.excerpt}
            categoryId={form.categoryId || null}
            tagNames={tagNames}
            articleId={articleId}
            onSelectHeadline={(headline) => {
              if (!slugTouched) {
                patch({ title: headline, slug: slugify(headline) });
              } else {
                patch({ title: headline });
              }
            }}
            onInsertLink={(text) => setBlocks((b) => [...b, { type: "paragraph", text }])}
          />

          <div className="rounded-xl border border-border bg-paper-raised p-4">
            <p className="mb-3 text-sm font-bold">Metadata</p>
            <div className="flex flex-col gap-3 text-sm">
              <label className="flex flex-col gap-1">
                Category
                <select
                  value={form.categoryId}
                  onChange={(e) => patch({ categoryId: e.target.value })}
                  className="rounded-md border border-border-strong p-2"
                >
                  <option value="">Select a category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                Author byline
                <select
                  value={form.authorId}
                  onChange={(e) => patch({ authorId: e.target.value })}
                  className="rounded-md border border-border-strong p-2"
                >
                  <option value="">Select an author</option>
                  {authors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                Tags (comma-separated)
                <input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  className="rounded-md border border-border-strong p-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                Location
                <input
                  value={form.locationName}
                  onChange={(e) => patch({ locationName: e.target.value })}
                  placeholder="e.g. Islamabad, Pakistan"
                  className="rounded-md border border-border-strong p-2"
                />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isBreaking} onChange={(e) => patch({ isBreaking: e.target.checked })} />
                Breaking news
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.featured} onChange={(e) => patch({ featured: e.target.checked })} />
                Featured (homepage hero)
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-paper-raised p-4">
            <p className="mb-3 text-sm font-bold">Featured image</p>
            <div className="flex flex-col gap-3 text-sm">
              <MediaUploadButton
                kind="article"
                available={mediaUploadAvailable}
                onUploaded={(result) => {
                  // A fresh upload is real, human-vouched-for permission —
                  // the upload route sets reuseStatus:"ALLOWED" server-side;
                  // mirrored here so the checklist updates immediately
                  // without a round trip. See invariant rule 4.
                  patch({ featuredImageUrl: result.url, featuredMediaId: result.id });
                  setFeaturedMedia({
                    id: result.id,
                    reuseStatus: "ALLOWED",
                    sourceDomain: null,
                    sourceArticleUrl: null,
                    createdAt: new Date().toISOString(),
                    selectionReasons: null,
                  });
                }}
              />
              <input
                value={form.featuredImageUrl}
                onChange={(e) => {
                  // A hand-typed URL has no provenance record by
                  // definition — clear the link rather than let it
                  // silently keep pointing at whatever was there before.
                  // See invariant rule 4.
                  patch({ featuredImageUrl: e.target.value, featuredMediaId: "" });
                  setFeaturedMedia(null);
                }}
                placeholder="Image URL"
                className="rounded-md border border-border-strong p-2"
              />
              <input value={form.featuredImageAlt} onChange={(e) => patch({ featuredImageAlt: e.target.value })} placeholder="Alt text" className="rounded-md border border-border-strong p-2" />
              <input value={form.featuredImageCaption} onChange={(e) => patch({ featuredImageCaption: e.target.value })} placeholder="Caption" className="rounded-md border border-border-strong p-2" />
              <input value={form.featuredImageCredit} onChange={(e) => patch({ featuredImageCredit: e.target.value })} placeholder="Credit / license" className="rounded-md border border-border-strong p-2" />

              {featuredMedia && !isPublishableReuseStatus(featuredMedia.reuseStatus) && (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-800">
                  Needs image-rights review — this image was automatically found and hasn&apos;t been cleared
                  for publication. Approve it on the Media page, upload a different image, or paste a
                  different URL.
                </p>
              )}

              {featuredMedia && (
                <details className="rounded-md border border-border-strong p-2 text-xs text-ink-muted">
                  <summary className="cursor-pointer font-semibold text-ink-soft">Image provenance</summary>
                  <dl className="mt-2 flex flex-col gap-1">
                    <p>
                      <span className="font-medium text-ink-soft">Reuse status: </span>
                      {featuredMedia.reuseStatus.replace(/_/g, " ")}
                    </p>
                    {featuredMedia.sourceDomain && (
                      <p>
                        <span className="font-medium text-ink-soft">Source: </span>
                        {featuredMedia.sourceDomain}
                      </p>
                    )}
                    <p>
                      <span className="font-medium text-ink-soft">Found: </span>
                      {new Date(featuredMedia.createdAt).toLocaleDateString()}
                    </p>
                    {featuredMedia.selectionReasons && featuredMedia.selectionReasons.length > 0 && (
                      <div>
                        <span className="font-medium text-ink-soft">Why selected:</span>
                        <ul className="list-disc pl-4">
                          {featuredMedia.selectionReasons.map((reason, i) => (
                            <li key={i}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </dl>
                </details>
              )}
            </div>
          </div>

          {mode === "edit" && (
            <SocialPostPanel
              title={form.title}
              excerpt={form.excerpt}
              categoryName={categories.find((c) => c.id === form.categoryId)?.name ?? ""}
              tagNames={tagNames}
              url={absoluteUrl(`/article/${form.slug}`)}
              pakistanRelevance={form.pakistanRelevance}
            />
          )}

          <div className="rounded-xl border border-border bg-paper-raised p-4">
            <p className="mb-3 text-sm font-bold">SEO</p>
            <div className="flex flex-col gap-3 text-sm">
              <input value={form.seoTitle} onChange={(e) => patch({ seoTitle: e.target.value })} placeholder="SEO title" className="rounded-md border border-border-strong p-2" />
              <textarea value={form.metaDescription} onChange={(e) => patch({ metaDescription: e.target.value })} placeholder="Meta description" rows={2} className="rounded-md border border-border-strong p-2" />
              <input value={form.canonicalUrl} onChange={(e) => patch({ canonicalUrl: e.target.value })} placeholder="Canonical URL" className="rounded-md border border-border-strong p-2" />
              <input value={form.ogImage} onChange={(e) => patch({ ogImage: e.target.value })} placeholder="Social image URL" className="rounded-md border border-border-strong p-2" />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-paper-raised p-4">
            <p className="mb-3 text-sm font-bold">Editorial priority (0–100)</p>
            <div className="flex flex-col gap-3 text-sm">
              {(
                [
                  ["pakistanRelevance", "Pakistan relevance"],
                  ["regionalRelevance", "Regional relevance"],
                  ["globalSignificance", "Global significance"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-1">
                  {label}: {form[key]}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={form[key]}
                    onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<typeof form>)}
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1">
                Scheduled date/time (required to Schedule)
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => patch({ scheduledAt: e.target.value })}
                  className="rounded-md border border-border-strong p-2"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-50"
            >
              {mode === "create" ? "Create draft" : "Save changes"}
            </button>

            {otherTransitions.map((name) => (
              <button
                key={name}
                type="button"
                disabled={pending}
                onClick={() => runTransition(name)}
                className="rounded-md border border-border-strong px-4 py-2.5 text-sm font-semibold hover:border-accent disabled:opacity-50"
              >
                {TRANSITION_LABELS[name]}
              </button>
            ))}

            {publishLike.map((name) => (
              <button
                key={name}
                type="button"
                disabled={pending || (articleId ? false : true) || blockingChecks}
                onClick={() => runTransition(name)}
                title={blockingChecks ? "All publication checks must pass first" : undefined}
                className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
              >
                {TRANSITION_LABELS[name]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
