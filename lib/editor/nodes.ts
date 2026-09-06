// Custom Tiptap nodes for the rich article canvas. Both are only ever
// imported from RichArticleEditor.tsx — the one place besides
// block-conversion.ts that's allowed to know about Tiptap's types (see the
// layering rule in the implementation plan).
"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Blockquote } from "@tiptap/extension-blockquote";
import { EditorImageNodeView, type ArticleImageNodeOptions } from "../../components/admin/EditorImageNodeView";
import { EditorBlockquoteNodeView } from "../../components/admin/EditorBlockquoteNodeView";

export interface ArticleImageAttrs {
  src: string;
  alt: string;
  caption: string | null;
  credit: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    articleImage: {
      setArticleImage: (attrs: ArticleImageAttrs) => ReturnType;
    };
  }
}

/**
 * Built from scratch rather than extending @tiptap/extension-image — caption
 * and credit aren't stock attributes, so a custom node is needed either way,
 * and the stock extension would only add an unused second "image-shaped"
 * node type to the schema. Rendered via EditorImageNodeView, which is also
 * where "insert" happens: an empty (`src: ""`) node renders the upload/URL/
 * picker chooser; a filled one renders the image plus alt/caption/credit
 * editing and Remove. mediaUploadAvailable/articleMediaOptions/canManageMedia
 * /articleId are passed once via .configure() at mount (see
 * RichArticleEditor.tsx) — stable, server-computed values for the lifetime
 * of one edit session, unlike onChange/onTitleDetected which need the
 * ref-based stale-closure guard because they change every render.
 */
export const ArticleImage = Node.create<ArticleImageNodeOptions>({
  name: "articleImage",
  group: "block",
  atom: true,

  addOptions() {
    return {
      articleId: undefined,
      mediaUploadAvailable: false,
      articleMediaOptions: [],
      canManageMedia: false,
    };
  },

  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      caption: { default: null },
      credit: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-article-image]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { "data-article-image": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditorImageNodeView);
  },

  addCommands() {
    return {
      setArticleImage:
        (attrs: ArticleImageAttrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

/**
 * `.extend()` of the stock Blockquote, kept at name:"blockquote" so
 * toggleBlockquote()/isActive('blockquote') keep working unmodified —
 * StarterKit's own bundled blockquote must be disabled
 * (`blockquote: false`) wherever this is used, to avoid a duplicate node
 * name. Adds only a `cite` attribute and a NodeView.
 */
export const CiteBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      cite: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("cite"),
        renderHTML: (attrs: { cite?: string | null }) => (attrs.cite ? { cite: attrs.cite } : {}),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditorBlockquoteNodeView);
  },
});
